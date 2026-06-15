// ——— Fonte: The Odds API (quote reali) ———
// Restituisce, per una partita, la MEDIANA tra bookmaker di ogni mercato.
// Mercati: 1X2 (h2h) + Over/Under TUTTE le linee (totals) in una richiesta;
// GG/NoGol (btts) + doppia chance (double_chance) con una richiesta per-evento.
// ~4 crediti a partita. Tutto orientato a (teamA, teamB) scelti dall'utente.

import { getJson, median } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const SPORT = "soccer_fifa_world_cup";
const BASE = "https://api.the-odds-api.com/v4";

/** True se la stringa contiene il nome della nazionale (match "morbido"). */
function matches(haystack, team) {
  const h = (haystack || "").toLowerCase();
  const t = toEnglish(team).toLowerCase();
  return h.includes(t) || t.includes(h);
}

/**
 * Trova l'evento The Odds API che corrisponde a (a vs b), in qualunque ordine.
 * Ritorna l'evento grezzo + il flag `inverted` (true se nel feed a=away, b=home).
 */
async function findEvent(events, a, b) {
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    const home = e.home_team, away = e.away_team;
    if (matches(home, a) && matches(away, b)) return { event: e, inverted: false };
    if (matches(home, b) && matches(away, a)) return { event: e, inverted: true };
  }
  return null;
}

/**
 * Quote complete per una partita.
 * @returns {object|null} { found, source, nBook, commence_time, h2h, totals, btts, doubleChance }
 *   - h2h: { "1","X","2" } mediane (orientate ad a=1, b=2)
 *   - totals: { [linea]: { over, under } } per ogni linea disponibile
 *   - btts: { gol, nogol }
 *   - doubleChance: { "1X","12","X2" }
 */
export async function fetchOdds(a, b, key) {
  if (!key) throw new Error("ODDS_API_KEY mancante");
  const cacheKey = `odds:${toEnglish(a)}:${toEnglish(b)}`;

  return cached(cacheKey, async () => {
    // 1) Mercati principali per tutti gli eventi del torneo (1 richiesta, 1 credito-base)
    const list = await getJson(
      `${BASE}/sports/${SPORT}/odds/?apiKey=${encodeURIComponent(key)}` +
        `&regions=eu&markets=h2h,totals&oddsFormat=decimal`,
      { timeout: 8000 }
    );
    const match = await findEvent(list, a, b);
    if (!match) {
      return { found: false, source: "The Odds API", reason: "partita non trovata nel feed quote" };
    }
    const { event, inverted } = match;

    // Accumulatori per mercato
    const h2hA = [], h2hX = [], h2hB = [];
    const totals = {}; // linea -> { over:[], under:[] }

    for (const bk of event.bookmakers || []) {
      for (const m of bk.markets || []) {
        if (m.key === "h2h") {
          for (const o of m.outcomes || []) {
            if (o.name === event.home_team) (inverted ? h2hB : h2hA).push(o.price);
            else if (o.name === event.away_team) (inverted ? h2hA : h2hB).push(o.price);
            else h2hX.push(o.price); // pareggio
          }
        }
        if (m.key === "totals") {
          for (const o of m.outcomes || []) {
            const line = String(o.point);
            if (!totals[line]) totals[line] = { over: [], under: [] };
            if (/over/i.test(o.name)) totals[line].over.push(o.price);
            if (/under/i.test(o.name)) totals[line].under.push(o.price);
          }
        }
      }
    }

    // Riduci a mediana
    const totalsMed = {};
    for (const [line, v] of Object.entries(totals)) {
      totalsMed[line] = { over: median(v.over), under: median(v.under) };
    }

    const result = {
      found: true,
      source: "The Odds API",
      nBook: (event.bookmakers || []).length,
      commence_time: event.commence_time,
      teams: { home: event.home_team, away: event.away_team, inverted },
      h2h: { "1": median(h2hA), X: median(h2hX), "2": median(h2hB) },
      totals: totalsMed,
      btts: { gol: null, nogol: null },
      doubleChance: { "1X": null, "12": null, X2: null },
    };

    // 2) Mercati extra per-evento: GG/NoGol e doppia chance (best-effort, ~2 crediti)
    try {
      const ev = await getJson(
        `${BASE}/sports/${SPORT}/events/${event.id}/odds/?apiKey=${encodeURIComponent(key)}` +
          `&regions=eu&markets=btts,double_chance&oddsFormat=decimal`,
        { timeout: 8000 }
      );
      const gg = [], ng = [], dc1x = [], dc12 = [], dcx2 = [];
      for (const bk of ev?.bookmakers || []) {
        for (const m of bk.markets || []) {
          if (m.key === "btts") {
            for (const o of m.outcomes || []) {
              if (/yes|s[iì]/i.test(o.name)) gg.push(o.price);
              else if (/no/i.test(o.name)) ng.push(o.price);
            }
          }
          if (m.key === "double_chance") {
            for (const o of m.outcomes || []) {
              const n = (o.name || "").toLowerCase();
              const hasHome = n.includes((event.home_team || "").toLowerCase());
              const hasAway = n.includes((event.away_team || "").toLowerCase());
              const hasDraw = /draw|x/.test(n);
              if (hasHome && hasAway) dc12.push(o.price);
              else if (hasDraw && hasHome) (inverted ? dcx2 : dc1x).push(o.price);
              else if (hasDraw && hasAway) (inverted ? dc1x : dcx2).push(o.price);
            }
          }
        }
      }
      result.btts = { gol: median(gg), nogol: median(ng) };
      result.doubleChance = { "1X": median(dc1x), "12": median(dc12), X2: median(dcx2) };
    } catch {
      // se l'endpoint extra fallisce, i campi restano null: campo vuoto, mai inventato
    }

    return result;
  });
}
