// ——— Value vote: modello vs quote reali ———
// Il voto NON misura la probabilità di vincere, ma il VALORE atteso: quanto la
// probabilità del modello supera quella implicita nella quota, depurata dal
// margine del bookmaker (de-vigging). Una giocata di valore perde comunque spesso.

import { groupOf } from "./markets.js";

const K = 25; // sensibilità del voto all'edge (un +10% di edge ≈ +2.5 al voto)

/** Appiattisce l'oggetto quote di oddsApi in una mappa mercato -> quota. */
export function flattenOdds(odds) {
  const out = {};
  if (!odds || !odds.found) return out;
  if (odds.h2h) {
    if (odds.h2h["1"]) out["1"] = odds.h2h["1"];
    if (odds.h2h.X) out["X"] = odds.h2h.X;
    if (odds.h2h["2"]) out["2"] = odds.h2h["2"];
  }
  for (const [line, v] of Object.entries(odds.totals || {})) {
    if (v.over) out[`Over ${line}`] = v.over;
    if (v.under) out[`Under ${line}`] = v.under;
  }
  if (odds.btts) {
    if (odds.btts.gol) out["Gol"] = odds.btts.gol;
    if (odds.btts.nogol) out["NoGol"] = odds.btts.nogol;
  }
  if (odds.doubleChance) {
    for (const k of ["1X", "12", "X2"]) if (odds.doubleChance[k]) out[k] = odds.doubleChance[k];
  }
  return out;
}

/**
 * Probabilità implicita de-viggata di un mercato, usando le quote del suo gruppo.
 * Restituisce null se mancano le quote del gruppo.
 */
function deviggedImplied(market, oddsMap) {
  // Doppia chance: gruppo speciale (i tre esiti sommano a 2)
  if (["1X", "12", "X2"].includes(market)) {
    const o1x = oddsMap["1X"], o12 = oddsMap["12"], ox2 = oddsMap["X2"];
    const present = [o1x, o12, ox2].filter(Boolean);
    if (!oddsMap[market] || present.length < 2) {
      // fallback: ricava la doppia chance dal de-vigging dell'1X2
      return impliedFrom1x2DoubleChance(market, oddsMap);
    }
    const sum = present.reduce((s, o) => s + 1 / o, 0);
    // normalizza così che la somma dei tre faccia 2 (ogni esito conta due volte)
    const factor = present.length === 3 ? sum / 2 : sum / (present.length); // best effort
    return 1 / oddsMap[market] / factor;
  }

  const group = groupOf(market);
  if (!group) return oddsMap[market] ? 1 / oddsMap[market] : null; // mercato isolato
  const present = group.filter((m) => oddsMap[m]);
  if (!oddsMap[market] || present.length < 2) return null;
  const overround = present.reduce((s, m) => s + 1 / oddsMap[m], 0);
  return 1 / oddsMap[market] / overround;
}

/** Ricava la doppia chance implicita dal de-vigging dell'1X2 (fallback). */
function impliedFrom1x2DoubleChance(market, oddsMap) {
  const o1 = oddsMap["1"], oX = oddsMap["X"], o2 = oddsMap["2"];
  if (!o1 || !oX || !o2) return null;
  const ov = 1 / o1 + 1 / oX + 1 / o2;
  const p1 = 1 / o1 / ov, pX = 1 / oX / ov, p2 = 1 / o2 / ov;
  if (market === "1X") return p1 + pX;
  if (market === "12") return p1 + p2;
  if (market === "X2") return pX + p2;
  return null;
}

/**
 * Voto valore 1-10 per un singolo mercato.
 * @returns {object} { market, odds, pModel, pImplied, edge, vote, hasOdds }
 */
export function valueVote(market, pModel, oddsMap) {
  const odds = oddsMap[market] ?? null;
  const pImplied = deviggedImplied(market, oddsMap);
  if (pImplied == null) {
    // Nessuna quota reale: niente confronto di valore. Mostriamo solo p_modello.
    return {
      market, odds: null, pModel: round(pModel), pImplied: null,
      edge: null, vote: null, hasOdds: false,
    };
  }
  const edge = pModel - pImplied;
  const vote = clamp(1, 10, 5.5 + K * edge);
  return {
    market,
    odds,
    pModel: round(pModel),
    pImplied: round(pImplied),
    edge: round(edge),
    vote: +vote.toFixed(1),
    hasOdds: true,
    // quota equa secondo il modello (utile a colpo d'occhio)
    fairOdds: pModel > 0 ? +(1 / pModel).toFixed(2) : null,
  };
}

/**
 * Valuta tutti i mercati del modello contro le quote reali.
 * @param {object} modelMarkets - mercato -> p_modello
 * @param {object} odds - output di oddsApi.fetchOdds
 * @returns {object} { rows[], best, hasRealOdds }
 */
export function evaluateAll(modelMarkets, odds) {
  const oddsMap = flattenOdds(odds);
  const hasRealOdds = Object.keys(oddsMap).length > 0;
  // Mercati che esponiamo in lavagna, nell'ordine della UI
  const order = [
    "1", "X", "2", "1X", "12", "X2",
    "Over 1.5", "Under 1.5", "Over 2.5", "Under 2.5", "Over 3.5", "Under 3.5",
    "Gol", "NoGol",
    "Multigol 1-2", "Multigol 1-3", "Multigol 2-3", "Multigol 2-4",
  ];
  const rows = order
    .filter((m) => modelMarkets[m] != null)
    .map((m) => valueVote(m, modelMarkets[m], oddsMap));

  // miglior valore: voto più alto tra i mercati con quota reale
  const withOdds = rows.filter((r) => r.hasOdds && r.vote != null);
  withOdds.sort((a, b) => b.vote - a.vote);
  const best = withOdds[0]?.vote >= 6 ? withOdds[0] : null; // ★ solo se c'è vero valore

  return { rows, best, hasRealOdds };
}

const clamp = (lo, hi, x) => Math.max(lo, Math.min(hi, x));
const round = (x) => (x == null ? null : +(+x).toFixed(4));

export { K };
