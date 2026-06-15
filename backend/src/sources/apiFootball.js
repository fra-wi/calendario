// ——— Fonte: API-Football (api-sports.io diretto) ———
// Header x-apisports-key. Fornisce: id lega/squadre, risultati storici (per il
// motore Dixon-Coles), formazioni, infortuni, classifiche gironi, H2H, stat giocatori.
// Caching aggressivo (TTL lunghi per i dati ~statici) per rispettare il rate-limit.

import { fetchJson } from "../lib/http.js";
import { cached, cacheGet, cacheSet } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const BASE = "https://v3.football.api-sports.io";
const SEASON = 2026; // Mondiali 2026

// TTL differenziati: i risultati passati e gli id non cambiano, le formazioni sì.
const TTL = {
  meta: 24 * 60 * 60 * 1000, // id lega/squadre: 24h
  history: 30 * 60 * 1000, // risultati storici: 30min
  lineup: 5 * 60 * 1000, // formazioni probabili: 5min
  injuries: 30 * 60 * 1000,
  standings: 30 * 60 * 1000,
};

// Ultimo valore noto del rate-limit, esposto a /api/health
let rateRemaining = null;

export function getRateRemaining() {
  return rateRemaining;
}

/** GET autenticato verso API-Football. Legge il rate-limit dagli header. */
async function afGet(path, key) {
  if (!key) throw new Error("API_FOOTBALL_KEY mancante");
  const { json, headers } = await fetchJson(`${BASE}${path}`, {
    headers: { "x-apisports-key": key },
    timeout: 8000,
  });
  const rem = headers.get("x-ratelimit-requests-remaining");
  if (rem != null) rateRemaining = Number(rem);
  // API-Football mette gli errori in json.errors anche con HTTP 200
  if (json && json.errors && Object.keys(json.errors).length) {
    const msg = Object.values(json.errors).join("; ");
    throw new Error(`API-Football: ${msg}`);
  }
  return json?.response || [];
}

/** Trova (e cachea) l'id della lega "World Cup". */
export async function getWorldCupLeagueId(key) {
  return cached(
    "af:wc-league",
    async () => {
      const res = await afGet(`/leagues?search=World Cup`, key);
      // Preferisci la competizione per nazionali "World Cup" di tipo Cup
      const wc =
        res.find((l) => /^world cup$/i.test(l.league?.name) && l.league?.type === "Cup") ||
        res.find((l) => /world cup/i.test(l.league?.name));
      if (!wc) throw new Error("lega World Cup non trovata su API-Football");
      return wc.league.id;
    },
    TTL.meta
  );
}

/** Trova (e cachea) l'id squadra dato il nome (in italiano o inglese). */
export async function getTeamId(name, key) {
  const en = toEnglish(name);
  return cached(
    `af:team:${en.toLowerCase()}`,
    async () => {
      const res = await afGet(`/teams?search=${encodeURIComponent(en)}`, key);
      // Match esatto se possibile, altrimenti il primo nazionale
      const exact = res.find((t) => t.team?.name?.toLowerCase() === en.toLowerCase());
      const team = exact || res.find((t) => t.team?.national) || res[0];
      if (!team) throw new Error(`squadra "${en}" non trovata su API-Football`);
      return { id: team.team.id, name: team.team.name, national: !!team.team.national };
    },
    TTL.meta
  );
}

/**
 * Ultimi N risultati di una squadra (per il motore Dixon-Coles).
 * Normalizza in { date, homeId, homeName, awayId, awayName, gh, ga }.
 * Solo partite concluse con punteggio valido.
 */
export async function getRecentFixtures(teamId, key, last = 30) {
  return cached(
    `af:fixtures:${teamId}:${last}`,
    async () => {
      const res = await afGet(`/fixtures?team=${teamId}&last=${last}`, key);
      return res
        .filter((f) => f.goals?.home != null && f.goals?.away != null)
        .map((f) => ({
          date: f.fixture?.date,
          homeId: f.teams?.home?.id,
          homeName: f.teams?.home?.name,
          awayId: f.teams?.away?.id,
          awayName: f.teams?.away?.name,
          gh: f.goals.home,
          ga: f.goals.away,
          league: f.league?.name,
        }));
    },
    TTL.history
  );
}

/** Cerca la prossima/ultima partita tra due squadre (per id fixture e formazioni). */
export async function getH2HFixtures(idA, idB, key, last = 10) {
  return cached(
    `af:h2h:${idA}:${idB}`,
    async () => {
      const res = await afGet(`/fixtures/headtohead?h2h=${idA}-${idB}&last=${last}`, key);
      return res.map((f) => ({
        id: f.fixture?.id,
        date: f.fixture?.date,
        homeName: f.teams?.home?.name,
        awayName: f.teams?.away?.name,
        gh: f.goals?.home,
        ga: f.goals?.away,
        status: f.fixture?.status?.short,
      }));
    },
    TTL.history
  );
}

/** Formazioni (probabili o ufficiali) per un fixture id. */
export async function getLineups(fixtureId, key) {
  return cached(
    `af:lineup:${fixtureId}`,
    async () => {
      const res = await afGet(`/fixtures/lineups?fixture=${fixtureId}`, key);
      return res.map((l) => ({
        team: l.team?.name,
        formation: l.formation,
        coach: l.coach?.name,
        startXI: (l.startXI || []).map((p) => ({
          name: p.player?.name,
          pos: p.player?.pos,
          number: p.player?.number,
        })),
      }));
    },
    TTL.lineup
  );
}

/** Infortuni/squalifiche di una squadra nella stagione. */
export async function getInjuries(teamId, key) {
  return cached(
    `af:injuries:${teamId}`,
    async () => {
      const res = await afGet(`/injuries?team=${teamId}&season=${SEASON}`, key);
      return res.map((i) => ({
        player: i.player?.name,
        reason: i.player?.reason,
        type: i.player?.type,
        date: i.fixture?.date,
      }));
    },
    TTL.injuries
  );
}

/** Classifica del girone Mondiali per una squadra. */
export async function getStandings(teamId, key) {
  const leagueId = await getWorldCupLeagueId(key);
  return cached(
    `af:standings:${leagueId}:${teamId}`,
    async () => {
      const res = await afGet(`/standings?league=${leagueId}&season=${SEASON}`, key);
      const groups = res[0]?.league?.standings || [];
      for (const g of groups) {
        if (g.some((row) => row.team?.id === teamId)) {
          return {
            group: g[0]?.group,
            table: g.map((row) => ({
              rank: row.rank,
              team: row.team?.name,
              teamId: row.team?.id,
              points: row.points,
              played: row.all?.played,
              win: row.all?.win,
              draw: row.all?.draw,
              lose: row.all?.lose,
              gf: row.all?.goals?.for,
              ga: row.all?.goals?.against,
            })),
          };
        }
      }
      return null;
    },
    TTL.standings
  );
}

/**
 * Statistiche aggregate dei giocatori di una squadra nella stagione torneo.
 * Usate per le props (tiri, tiri in porta, falli, cartellini, minuti).
 */
export async function getPlayersStats(teamId, key, maxPlayers = 12) {
  const leagueId = await getWorldCupLeagueId(key).catch(() => null);
  return cached(
    `af:players:${teamId}`,
    async () => {
      const path = leagueId
        ? `/players?team=${teamId}&season=${SEASON}&league=${leagueId}`
        : `/players?team=${teamId}&season=${SEASON}`;
      const res = await afGet(path, key);
      return res.slice(0, maxPlayers).map((row) => {
        const s = (row.statistics || [])[0] || {};
        const games = s.games || {};
        return {
          name: row.player?.name,
          age: row.player?.age,
          pos: games.position,
          appearances: games.appearences,
          minutes: games.minutes,
          rating: games.rating ? +(+games.rating).toFixed(2) : null,
          goals: s.goals?.total || 0,
          assists: s.goals?.assists || 0,
          shotsTotal: s.shots?.total || 0,
          shotsOn: s.shots?.on || 0,
          foulsCommitted: s.fouls?.committed || 0,
          yellow: s.cards?.yellow || 0,
          red: s.cards?.red || 0,
        };
      });
    },
    TTL.history
  );
}

export { SEASON };
