// ——— Fonte: ESPN box-score → statistiche giocatori (multi-competizione, pesate) ———
// ESPN risponde dove Sofascore è bloccato. Cerchiamo le ultime partite della
// nazionale su PIÙ competizioni (amichevoli, Nations League, qualificazioni,
// Mondiale), poi aggreghiamo le statistiche dei singoli (tiri, falli, cartellini)
// PESANDO le partite più recenti. Etichette riconosciute per PAROLA.

import { getJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// Competizioni ESPN dove giocano le nazionali (match per nome, le altre tornano vuote)
const LEAGUES = [
  "fifa.world", "fifa.friendly", "uefa.nations",
  "fifa.worldq.uefa", "fifa.worldq.conmebol", "fifa.worldq.concacaf",
  "fifa.worldq.afc", "fifa.worldq.caf", "fifa.worldq.ofc",
  "uefa.euro", "uefa.euroq", "conmebol.america", "caf.nations", "concacaf.gold",
];

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Eventi CONCLUSI della nazionale su tutte le competizioni (ultimi `monthsBack` mesi). */
export async function getTeamEvents(teamName, monthsBack = 18) {
  const en = toEnglish(teamName).toLowerCase();
  return cached(
    `espn:events:${en}:${monthsBack}`,
    async () => {
      const end = new Date(Date.now() + 86400000);
      const start = new Date(); start.setMonth(start.getMonth() - monthsBack);
      const range = `${ymd(start)}-${ymd(end)}`;
      const found = new Map(); // id -> { id, date, league }
      // interroga le competizioni in parallelo; quelle senza la squadra non aggiungono nulla
      await Promise.all(LEAGUES.map(async (lg) => {
        try {
          const j = await getJson(`${SITE}/${lg}/scoreboard?limit=200&dates=${range}`, { timeout: 8000 });
          for (const e of j.events || []) {
            const comp = (e.competitions || [])[0] || {};
            if (!comp.status?.type?.completed) continue;
            const names = (comp.competitors || []).map((c) => (c.team?.displayName || "").toLowerCase());
            if (names.some((n) => n && (n.includes(en) || en.includes(n)))) {
              if (!found.has(e.id)) found.set(e.id, { id: e.id, date: e.date, league: lg });
            }
          }
        } catch { /* competizione non disponibile: salta */ }
      }));
      return [...found.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    30 * 60 * 1000
  );
}

/** Riconosce a quale statistica corrisponde un'etichetta ESPN (per parola). */
function classify(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("shot") && (l.includes("on goal") || l.includes("on target"))) return "shotsOn";
  if (l.includes("shot")) return "shotsTotal";
  if (l.includes("foul") && !l.includes("suffer") && !l.includes("won")) return "foulsCommitted";
  if (l.includes("yellow")) return "yellow";
  if (l.includes("red card")) return "red";
  if (l.includes("minute")) return "minutes";
  return null;
}

/** Statistiche dei giocatori di una squadra in un singolo evento. */
async function eventPlayers(league, eventId, teamEn) {
  const j = await getJson(`${SITE}/${league}/summary?event=${eventId}`, { timeout: 8000 });
  const out = {};
  for (const g of j.boxscore?.players || []) {
    const tn = (g.team?.displayName || "").toLowerCase();
    if (!(tn.includes(teamEn) || teamEn.includes(tn))) continue;
    for (const cat of g.statistics || []) {
      const labels = cat.labels || cat.names || cat.keys || [];
      for (const a of cat.athletes || []) {
        const name = a.athlete?.displayName;
        if (!name) continue;
        const pos = a.athlete?.position?.abbreviation || a.athlete?.position?.name;
        const rec = out[name] || (out[name] = { name, pos, s: {} });
        (a.stats || []).forEach((v, i) => {
          const k = classify(labels[i]);
          if (k) { const n = parseFloat(v); if (Number.isFinite(n)) rec.s[k] = (rec.s[k] || 0) + n; }
        });
      }
    }
  }
  return out;
}

/**
 * Medie PESATE dei giocatori sulle ultime `maxEvents` partite (qualsiasi competizione).
 * La partita più recente pesa 1.0, scende fino a ~0.5 sulla più vecchia.
 * @returns {object} { source, players[], nEvents } — players nel formato di buildProps
 */
export async function getEspnPlayerStats(teamName, maxEvents = 10) {
  const en = toEnglish(teamName).toLowerCase();
  return cached(
    `espn:pstats:${en}:${maxEvents}`,
    async () => {
      const events = (await getTeamEvents(teamName)).slice(0, maxEvents);
      if (!events.length) return { source: "ESPN", players: [], nEvents: 0 };
      const n = events.length;
      const weightOf = (idx) => (n > 1 ? 1 - 0.5 * (idx / (n - 1)) : 1); // 1.0 → 0.5

      // agg per giocatore: somma pesata e somma pesi (sui match giocati)
      const agg = {};
      for (let i = 0; i < events.length; i++) {
        const ev = events[i], w = weightOf(i);
        let pls = {};
        try { pls = await eventPlayers(ev.league, ev.id, en); } catch { continue; }
        for (const [name, rec] of Object.entries(pls)) {
          const a = agg[name] || (agg[name] = { name, pos: rec.pos, wTot: 0, apps: 0, shotsTotal: 0, shotsOn: 0, foulsCommitted: 0, yellow: 0, minutes: 0 });
          a.wTot += w; a.apps++;
          a.shotsTotal += w * (rec.s.shotsTotal || 0);
          a.shotsOn += w * (rec.s.shotsOn || 0);
          a.foulsCommitted += w * (rec.s.foulsCommitted || 0);
          a.yellow += w * (rec.s.yellow || 0);
          a.minutes += w * (rec.s.minutes || 0);
        }
      }

      // converti in medie pesate per partita, poi rimetti in formato buildProps
      // (buildProps fa avg = totale/appearances → passiamo media*appearances)
      const players = Object.values(agg)
        .filter((p) => p.wTot > 0)
        .map((p) => {
          const avg = (x) => x / p.wTot; // media pesata per partita
          const apps = p.apps;
          return {
            name: p.name, pos: p.pos, appearances: apps, minutes: Math.round(avg(p.minutes) * apps) || null,
            rating: null, goals: 0, assists: 0,
            shotsTotal: +(avg(p.shotsTotal) * apps).toFixed(2),
            shotsOn: +(avg(p.shotsOn) * apps).toFixed(2),
            foulsCommitted: +(avg(p.foulsCommitted) * apps).toFixed(2),
            yellow: +(avg(p.yellow) * apps).toFixed(2),
            red: 0,
            _avgShots: +avg(p.shotsTotal).toFixed(2), // utili a colpo d'occhio
          };
        })
        .sort((x, y) => (y.shotsTotal + y.foulsCommitted) - (x.shotsTotal + x.foulsCommitted))
        .slice(0, 5);

      return { source: `ESPN (${n} gare, pesate)`, players, nEvents: n };
    },
    30 * 60 * 1000
  );
}

/** Diagnostica: competizioni trovate ed etichette box-score grezze (per tarare). */
export async function sampleEspn(teamName) {
  const events = await getTeamEvents(teamName);
  if (!events.length) return { nota: "nessun evento concluso trovato per la squadra su ESPN" };
  const en = toEnglish(teamName).toLowerCase();
  const ev = events[0];
  let categorie = null;
  try {
    const j = await getJson(`${SITE}/${ev.league}/summary?event=${ev.id}`, { timeout: 8000 });
    const groups = j.boxscore?.players || [];
    const g = groups.find((x) => { const tn = (x.team?.displayName || "").toLowerCase(); return tn.includes(en) || en.includes(tn); }) || groups[0];
    categorie = (g?.statistics || []).map((c) => (c.labels || c.names || c.keys || []));
  } catch (e) { categorie = `errore summary: ${e.message}`; }
  return {
    nEventiTrovati: events.length,
    competizioni: [...new Set(events.map((e) => e.league))],
    eventoCampione: { id: ev.id, league: ev.league, data: ev.date?.slice(0, 10) },
    etichetteBoxscore: categorie,
  };
}
