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
