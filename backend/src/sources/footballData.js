// ——— Fonte: football-data.org (gratuita e legittima) ———
// Copre i Mondiali (competizione "WC"). Fornisce TUTTE le partite del torneo in
// una richiesta: un dataset connesso ideale per la stima congiunta Dixon-Coles,
// più le classifiche dei gironi. Header X-Auth-Token. Dati reali, nessun LLM.

import { fetchJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const BASE = "https://api.football-data.org/v4";

async function fdGet(path, key) {
  if (!key) throw new Error("FOOTBALL_DATA_KEY mancante");
  const { json } = await fetchJson(`${BASE}${path}`, {
    headers: { "X-Auth-Token": key },
    timeout: 8000,
  });
  if (json && json.message && json.errorCode) {
    throw new Error(`football-data.org: ${json.message}`);
  }
  return json;
}

/**
 * Tutte le partite del Mondiale, normalizzate per il motore.
 * Solo quelle concluse (FINISHED) hanno punteggio.
 * @returns {Array} [{ date, homeId, awayId, gh, ga, homeName, awayName, group }]
 */
export async function getWorldCupMatches(key) {
  return cached(
    "fd:wc-matches",
    async () => {
      const j = await fdGet(`/competitions/WC/matches`, key);
      const matches = (j.matches || [])
        .filter((m) => m.status === "FINISHED" && m.score?.fullTime?.home != null)
        .map((m) => ({
          date: m.utcDate,
          homeId: m.homeTeam?.id,
          awayId: m.awayTeam?.id,
          gh: m.score.fullTime.home,
          ga: m.score.fullTime.away,
          homeName: m.homeTeam?.name,
          awayName: m.awayTeam?.name,
          group: m.group,
        }))
        .filter((m) => m.homeId != null && m.awayId != null);
      return matches;
    },
    10 * 60 * 1000
  );
}

/** Classifica del girone Mondiale per una squadra (per nome). */
export async function getWorldCupStandings(key, teamName) {
  const en = toEnglish(teamName).toLowerCase();
  return cached(
    "fd:wc-standings",
    async () => fdGet(`/competitions/WC/standings`, key),
    10 * 60 * 1000
  ).then((j) => {
    for (const st of j.standings || []) {
      if (st.type !== "TOTAL") continue;
      const rows = st.table || [];
      if (rows.some((r) => (r.team?.name || "").toLowerCase().includes(en) || en.includes((r.team?.shortName || "").toLowerCase()))) {
        return {
          group: st.group ? st.group.replace("GROUP_", "Girone ") : "Girone",
          table: rows.map((r) => ({
            rank: r.position,
            team: r.team?.name,
            teamId: r.team?.id,
            points: r.points,
            played: r.playedGames,
            win: r.won,
            draw: r.draw,
            lose: r.lost,
            gf: r.goalsFor,
            ga: r.goalsAgainst,
          })),
        };
      }
    }
    return null;
  });
}

/** Numero di partite Mondiali concluse disponibili (per la diagnostica). */
export async function countWorldCupMatches(key) {
  const m = await getWorldCupMatches(key);
  return m.length;
}
