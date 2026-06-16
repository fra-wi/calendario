// ——— Fonte: Sofascore (endpoint JSON strutturati) ———
// Restituisce la storia AMPIA di una nazionale: le ultime ~30 partite di TUTTE
// le competizioni (amichevoli, qualificazioni, Nations League, Mondiale…).
// Dati reali presi dal JSON di Sofascore, nessun LLM. API non ufficiale: la
// trattiamo come best-effort (può essere bloccata da Cloudflare in alcune reti).

import { getJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const BASE = "https://api.sofascore.com/api/v1";
// Header "da browser" per ridurre i blocchi
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://www.sofascore.com/",
};

/** Trova l'id squadra Sofascore per una nazionale (per nome). */
export async function searchTeam(name) {
  const en = toEnglish(name);
  return cached(
    `sofa:team:${en.toLowerCase()}`,
    async () => {
      const j = await getJson(`${BASE}/search/all?q=${encodeURIComponent(en)}`, { headers: HEADERS, timeout: 8000 });
      const teams = (j.results || [])
        .filter((r) => r.type === "team" && r.entity)
        .map((r) => r.entity)
        .filter((e) => (e.sport?.name || "Football") === "Football");
      // preferisci la nazionale con match di nome esatto
      const exact = teams.find((e) => e.national && e.name?.toLowerCase() === en.toLowerCase());
      const nat = teams.find((e) => e.national);
      const t = exact || nat || teams[0];
      if (!t) return null;
      return { id: t.id, name: t.name };
    },
    24 * 60 * 60 * 1000
  );
}

const num = (x) => (Number.isFinite(+x) ? +x : 0);

/** Rosa della nazionale (per scegliere i giocatori chiave delle props). */
export async function getSquad(name) {
  const team = await searchTeam(name);
  if (!team) return { teamId: null, players: [] };
  return cached(
    `sofa:squad:${team.id}`,
    async () => {
      const j = await getJson(`${BASE}/team/${team.id}/players`, { headers: HEADERS, timeout: 8000 });
      const players = (j.players || []).map((p) => p.player).filter(Boolean);
      return { teamId: team.id, players };
    },
    24 * 60 * 60 * 1000
  );
}

/** Medie di un giocatore dalle sue ultime `last` partite (per le props). */
export async function getPlayerAverages(playerId, meta = {}, last = 5) {
  return cached(
    `sofa:pstats:${playerId}`,
    async () => {
      let events = [];
      try {
        const ev = await getJson(`${BASE}/player/${playerId}/events/last/0`, { headers: HEADERS, timeout: 8000 });
        events = (ev.events || []).filter((e) => e.status?.type === "finished").slice(0, last);
      } catch { return null; }

      let apps = 0, minutes = 0, shots = 0, on = 0, fouls = 0, yellow = 0, red = 0, goals = 0, assists = 0, rating = 0, nR = 0;
      for (const e of events) {
        try {
          const st = await getJson(`${BASE}/event/${e.id}/player/${playerId}/statistics`, { headers: HEADERS, timeout: 8000 });
          const s = st.statistics || {};
          apps++;
          minutes += num(s.minutesPlayed);
          // nomi di campo difensivi (Sofascore usa nomi stile Opta): più candidati
          shots += num(s.totalShots ?? s.shots);
          on += num(s.onTargetScoringAttempt ?? s.shotsOnTarget ?? s.shotOnTarget);
          fouls += num(s.fouls ?? s.foulsCommitted);
          yellow += num(s.yellowCards ?? s.yellowCard);
          red += num(s.redCards ?? s.redCard);
          goals += num(s.goals);
          assists += num(s.goalAssist ?? s.assists);
          if (s.rating) { rating += num(s.rating); nR++; }
        } catch { /* salta l'evento */ }
      }
      if (!apps) return null;
      // formato identico a apiFootball.getPlayersStats → riusabile da buildProps
      return {
        name: meta.name, pos: meta.pos, age: meta.age,
        appearances: apps, minutes,
        rating: nR ? +(rating / nR).toFixed(2) : null,
        goals, assists,
        shotsTotal: shots, shotsOn: on,
        foulsCommitted: fouls, yellow, red,
      };
    },
    30 * 60 * 1000
  );
}

/**
 * Statistiche dei giocatori chiave di una nazionale (per le props).
 * Sceglie fino a `max` giocatori dando priorità ai ruoli offensivi.
 * @returns {object} { source, teamId, players[] } — players nel formato di buildProps
 */
export async function getKeyPlayersStats(name, max = 4) {
  const squad = await getSquad(name);
  if (!squad.teamId || !squad.players.length) return { source: "Sofascore", teamId: null, players: [] };
  const rank = (pos) => (pos === "F" ? 0 : pos === "M" ? 1 : pos === "D" ? 2 : 3);
  const chosen = [...squad.players].sort((a, b) => rank(a.position) - rank(b.position)).slice(0, max);
  const players = [];
  for (const p of chosen) {
    const avg = await getPlayerAverages(p.id, { name: p.name, pos: p.position }, 5);
    if (avg) players.push(avg);
  }
  return { source: "Sofascore", teamId: squad.teamId, players };
}

/** Solo per diagnostica: nomi dei campi statistici grezzi di un evento. */
export async function sampleStatKeys(name) {
  const squad = await getSquad(name);
  const p = squad.players?.[0];
  if (!p) return { keys: [], nota: "nessun giocatore" };
  const ev = await getJson(`${BASE}/player/${p.id}/events/last/0`, { headers: HEADERS, timeout: 8000 });
  const e = (ev.events || []).find((x) => x.status?.type === "finished");
  if (!e) return { keys: [], nota: "nessun evento concluso" };
  const st = await getJson(`${BASE}/event/${e.id}/player/${p.id}/statistics`, { headers: HEADERS, timeout: 8000 });
  return { player: p.name, keys: Object.keys(st.statistics || {}) };
}

/**
 * Ultime partite concluse di una nazionale (tutte le competizioni).
 * @returns {Array} [{ date, homeName, awayName, gh, ga }]
 */
export async function getRecentMatches(name, pages = 2) {
  const team = await searchTeam(name);
  if (!team) return { source: "Sofascore", teamId: null, fixtures: [] };

  return cached(
    `sofa:matches:${team.id}`,
    async () => {
      const out = [];
      // page 0 = batch più recente; prendiamo un paio di pagine per ~60 partite
      for (let p = 0; p < pages; p++) {
        try {
          const j = await getJson(`${BASE}/team/${team.id}/events/last/${p}`, { headers: HEADERS, timeout: 8000 });
          for (const e of j.events || []) {
            const finished = e.status?.type === "finished";
            const gh = e.homeScore?.current, ga = e.awayScore?.current;
            if (!finished || gh == null || ga == null) continue;
            out.push({
              date: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : null,
              homeName: e.homeTeam?.name,
              awayName: e.awayTeam?.name,
              gh, ga,
            });
          }
        } catch {
          break; // se una pagina fallisce, ci teniamo quelle prese
        }
      }
      return { source: "Sofascore", teamId: team.id, fixtures: out };
    },
    10 * 60 * 1000
  );
}
