// =====================================================================
// FONTI DATI ESTERNE
// Ogni funzione: usa fetchJSON (timeout 8s) + cache 10 min, e LANCIA un
// errore se la fonte non risponde. Le route a monte trasformano l'errore
// in un messaggio chiaro per la UI. Nessun dato viene mai inventato.
// =====================================================================

import { fetchJSON } from './http.js';
import { cached } from './cache.js';
import {
  toEnglish,
  toItalian,
  namesMatch,
  tierOf,
  tierWeight,
} from './teams.js';

// ---------- utilità ----------

// Data -> 'YYYYMMDD' (formato richiesto da ESPN)
function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Mediana di un array di numeri (null se vuoto)
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Parsing numerico sicuro (ritorna null se non è un numero valido)
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// =====================================================================
// 1) ESPN — calendario e risultati Mondiali (nessuna chiave)
// =====================================================================
export async function fetchFixtures() {
  const now = new Date();
  const start = new Date(now.getTime() - 1 * 86400000); // da ieri
  const end = new Date(now.getTime() + 25 * 86400000); // a +25 giorni
  const range = `${ymd(start)}-${ymd(end)}`;
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard` +
    `?limit=50&dates=${range}`;

  return cached(`fixtures:${range}`, async () => {
    const data = await fetchJSON(url);
    const fixtures = [];
    for (const ev of data.events || []) {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;

      const homeEn = home.team?.displayName || home.team?.name || 'Casa';
      const awayEn = away.team?.displayName || away.team?.name || 'Ospite';
      const state = ev.status?.type?.state || 'pre'; // pre | in | post

      fixtures.push({
        id: ev.id,
        date: ev.date,
        homeEn,
        awayEn,
        homeIt: toItalian(homeEn),
        awayIt: toItalian(awayEn),
        state,
        completed: !!ev.status?.type?.completed,
        statusDesc: ev.status?.type?.shortDetail || ev.status?.type?.description || '',
        scoreHome: num(home.score),
        scoreAway: num(away.score),
        venue: comp?.venue?.fullName || null,
      });
    }
    fixtures.sort((a, b) => new Date(a.date) - new Date(b.date));
    return { source: 'ESPN', count: fixtures.length, fixtures };
  });
}

// =====================================================================
// 2) TheSportsDB — ultime 5 partite di una nazionale (nessuna chiave)
//    searchteams.php -> idTeam, poi eventslast.php -> ultimi eventi
// =====================================================================
export async function fetchForm(team) {
  const en = toEnglish(team);
  return cached(`form:${en}`, async () => {
    // a) cerco la squadra per nome inglese
    const searchUrl =
      `https://www.thesportsdb.com/api/v1/json/123/searchteams.php` +
      `?t=${encodeURIComponent(en)}`;
    const search = await fetchJSON(searchUrl);
    const teamRow = (search.teams || [])[0];
    if (!teamRow) {
      throw new Error(`Nazionale "${en}" non trovata su TheSportsDB`);
    }
    const idTeam = teamRow.idTeam;

    // b) ultimi eventi della squadra
    const lastUrl =
      `https://www.thesportsdb.com/api/v1/json/123/eventslast.php?id=${idTeam}`;
    const last = await fetchJSON(lastUrl);
    const events = last.results || last.events || [];
    if (!events.length) {
      throw new Error(`Nessun risultato recente per "${en}" su TheSportsDB`);
    }

    const matches = [];
    for (const ev of events.slice(0, 5)) {
      const isHome = namesMatch(ev.strHomeTeam, en);
      const isAway = namesMatch(ev.strAwayTeam, en);
      if (!isHome && !isAway) continue; // evento non pertinente

      const hs = num(ev.intHomeScore);
      const as = num(ev.intAwayScore);
      if (hs === null || as === null) continue; // non ancora giocata

      const scored = isHome ? hs : as;
      const conceded = isHome ? as : hs;
      const opponent = isHome ? ev.strAwayTeam : ev.strHomeTeam;
      const outcome = scored > conceded ? 'V' : scored === conceded ? 'P' : 'S';

      matches.push({
        opponent,
        opponentIt: toItalian(opponent),
        opponentTier: tierOf(opponent),
        date: ev.dateEvent || null,
        scored,
        conceded,
        outcome, // V (vittoria) / P (pareggio) / S (sconfitta)
      });
    }

    if (!matches.length) {
      throw new Error(`Nessuna partita giocata recente per "${en}"`);
    }

    // medie gol calcolate matematicamente sui dati reali
    const n = matches.length;
    const avgScored = matches.reduce((s, m) => s + m.scored, 0) / n;
    const avgConceded = matches.reduce((s, m) => s + m.conceded, 0) / n;

    // forma pesata: V=3, P=1, S=0, moltiplicato per il peso della fascia avversario
    const points = { V: 3, P: 1, S: 0 };
    const weightedForm = matches.reduce(
      (s, m) => s + points[m.outcome] * tierWeight(m.opponentTier),
      0
    );

    return {
      source: 'TheSportsDB',
      team: en,
      teamIt: toItalian(en),
      n,
      matches,
      avgScored: round2(avgScored),
      avgConceded: round2(avgConceded),
      weightedForm: round2(weightedForm),
    };
  });
}

// =====================================================================
// 3) The Odds API — quote reali, MEDIANA tra i bookmaker
//    Mercati: h2h (1/X/2) e totals (Over/Under 2.5)
// =====================================================================
export async function fetchOdds(a, b) {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error('Chiave The Odds API non configurata');
  const enA = toEnglish(a);
  const enB = toEnglish(b);

  return cached(`odds:${enA}|${enB}`, async () => {
    const url =
      `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/` +
      `?apiKey=${key}&regions=eu&markets=h2h,totals&oddsFormat=decimal`;
    const events = await fetchJSON(url);
    if (!Array.isArray(events)) {
      throw new Error('Risposta inattesa da The Odds API');
    }

    // individuo la partita (in qualunque ordine casa/ospite)
    const ev = events.find(
      (e) =>
        (namesMatch(e.home_team, enA) && namesMatch(e.away_team, enB)) ||
        (namesMatch(e.home_team, enB) && namesMatch(e.away_team, enA))
    );
    if (!ev) {
      throw new Error(`Nessuna quota disponibile per ${enA}–${enB}`);
    }

    // raccolgo le quote di ogni bookmaker
    const arrA = [];
    const arrDraw = [];
    const arrB = [];
    const arrOver = [];
    const arrUnder = [];

    for (const bk of ev.bookmakers || []) {
      const h2h = (bk.markets || []).find((m) => m.key === 'h2h');
      if (h2h) {
        for (const o of h2h.outcomes || []) {
          const p = num(o.price);
          if (p === null) continue;
          if (namesMatch(o.name, enA)) arrA.push(p);
          else if (namesMatch(o.name, enB)) arrB.push(p);
          else if (/draw|pareggio/i.test(o.name)) arrDraw.push(p);
        }
      }
      const totals = (bk.markets || []).find((m) => m.key === 'totals');
      if (totals) {
        for (const o of totals.outcomes || []) {
          if (num(o.point) !== 2.5) continue; // solo la linea 2.5
          const p = num(o.price);
          if (p === null) continue;
          if (/over/i.test(o.name)) arrOver.push(p);
          else if (/under/i.test(o.name)) arrUnder.push(p);
        }
      }
    }

    const bookmakers = (ev.bookmakers || []).length;
    if (!arrA.length || !arrB.length) {
      throw new Error(`Quote 1/X/2 non disponibili per ${enA}–${enB}`);
    }

    return {
      source: 'The Odds API',
      enA,
      enB,
      commenceTime: ev.commence_time || null,
      bookmakers,
      median: {
        home: median(arrA), // quota vittoria A (1)
        draw: median(arrDraw), // quota pareggio (X)
        away: median(arrB), // quota vittoria B (2)
        over: median(arrOver), // Over 2.5
        under: median(arrUnder), // Under 2.5
      },
      hasTotals: arrOver.length > 0 && arrUnder.length > 0,
    };
  });
}

// =====================================================================
// 4) football-data.org — classifica del girone (OPZIONALE, serve chiave)
//    Ritorna null se la chiave non è configurata (card semplicemente assente)
// =====================================================================
export async function fetchStandings(team) {
  if (!process.env.FOOTBALL_DATA_KEY) return null; // opzionale: nessuna chiave
  const en = toEnglish(team);

  return cached(`standings:${en}`, async () => {
    const url = `https://api.football-data.org/v4/competitions/WC/standings`;
    const data = await fetchJSON(url, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY },
    });

    // cerco il girone (table TOTAL) che contiene la nazionale richiesta
    for (const st of data.standings || []) {
      if (st.type && st.type !== 'TOTAL') continue;
      const table = st.table || [];
      const inGroup = table.some((row) => namesMatch(row.team?.name, en));
      if (!inGroup) continue;

      return {
        source: 'football-data.org',
        group: st.group || st.stage || 'Girone',
        table: table.map((row) => ({
          position: row.position,
          team: row.team?.name,
          teamIt: toItalian(row.team?.name),
          played: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDifference: row.goalDifference,
          points: row.points,
          highlight: namesMatch(row.team?.name, en),
        })),
      };
    }
    throw new Error(`Girone non trovato per "${en}" su football-data.org`);
  });
}

function round2(x) {
  return Math.round(x * 100) / 100;
}
