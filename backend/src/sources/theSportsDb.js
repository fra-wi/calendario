// ——— Fonte fallback: TheSportsDB (senza chiave) ———
// Usata SOLO se API-Football non copre i risultati storici di una nazionale.
// Fornisce le ultime partite e medie gol pesate per recency.

import { getJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const KEY = "123"; // chiave pubblica di test di TheSportsDB
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

/**
 * Ultime partite + medie gol pesate per una nazionale.
 * @returns {object|null} { source, form[], fixtures[], nMatches, gfAvg, gsAvg }
 */
export async function fetchRecentForm(team) {
  const en = toEnglish(team);
  return cached(
    `tsdb:form:${en.toLowerCase()}`,
    async () => {
      // 1) trova la squadra (filtra calcio)
      const s = await getJson(
        `${BASE}/searchteams.php?t=${encodeURIComponent(en)}`,
        { timeout: 6000 }
      );
      const teams = (s.teams || []).filter((t) => t.strSport === "Soccer");
      const t = teams.find((x) => x.strTeam.toLowerCase() === en.toLowerCase()) || teams[0];
      if (!t) return null;

      // 2) ultime partite con punteggio
      const j = await getJson(`${BASE}/eventslast.php?id=${t.idTeam}`, { timeout: 6000 });
      const evs = (j.results || [])
        .filter((e) => e.intHomeScore != null && e.intAwayScore != null)
        .slice(0, 10);
      if (!evs.length) return null;

      // medie gol pesate per recency: la più recente pesa 1.0, la 10ª 0.5
      let gfW = 0, gsW = 0, wTot = 0;
      const fixtures = evs.map((e, idx) => {
        const isHome = e.idHomeTeam === t.idTeam;
        const gf = +(isHome ? e.intHomeScore : e.intAwayScore);
        const gs = +(isHome ? e.intAwayScore : e.intHomeScore);
        const w = evs.length > 1 ? 1 - 0.5 * (idx / (evs.length - 1)) : 1;
        gfW += gf * w;
        gsW += gs * w;
        wTot += w;
        const d = e.dateEvent ? e.dateEvent.split("-") : null;
        return {
          outcome: gf > gs ? "V" : gf === gs ? "P" : "S",
          opponent: isHome ? e.strAwayTeam : e.strHomeTeam,
          score: `${gf}-${gs}`,
          date: d ? `${d[2]}/${d[1]}/${d[0].slice(2)}` : "",
          // forma "grezza" utile anche al motore Dixon-Coles come fallback
          homeName: e.strHomeTeam,
          awayName: e.strAwayTeam,
          gh: +e.intHomeScore,
          ga: +e.intAwayScore,
          isoDate: e.dateEvent,
        };
      });

      return {
        source: "TheSportsDB",
        form: fixtures.slice(0, 5).map(({ outcome, opponent, score, date }) => ({
          outcome, opponent, score, date,
        })),
        fixtures, // tutte, per il motore
        nMatches: evs.length,
        gfAvg: +(gfW / wTot).toFixed(2),
        gsAvg: +(gsW / wTot).toFixed(2),
      };
    },
    10 * 60 * 1000
  );
}
