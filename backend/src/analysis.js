// ——— Orchestratore analisi partita ———
// Mette insieme fonti (quote + risultati storici) e motore Dixon-Coles per
// produrre il payload completo di una partita: forze stimate, gol attesi,
// matrice dei mercati con p_modello/p_implicita/voto, fonti tracciate.
// Nessun numero proviene da un LLM.

import { getTeamId, getRecentFixtures } from "./sources/apiFootball.js";
import { fetchRecentForm } from "./sources/theSportsDb.js";
import { getRecentMatches as sofaRecentMatches } from "./sources/sofascore.js";
import { getInternationalResults } from "./sources/intlResults.js";
import { getWorldCupMatches } from "./sources/footballData.js";
import { fetchOdds } from "./sources/oddsApi.js";
import { toEnglish, toItalian } from "./lib/nameMap.js";
import { fitDixonColes, expectedGoals, scoreMatrix } from "./engine/dixonColes.js";
import { deriveMarkets } from "./engine/markets.js";
import { evaluateAll } from "./engine/value.js";
import { logPrediction } from "./engine/calibration.js";

// ID squadra UNIFICATO tra le fonti: nome inglese normalizzato (senza accenti).
// Così la stessa nazionale resta UNA sola anche mescolando football-data,
// TheSportsDB e API-Football → il motore stima in modo coerente.
function teamKey(name) {
  return toEnglish(name).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** Normalizza partite da QUALSIASI fonte usando il nome come chiave. */
function normAll(list) {
  const out = [];
  for (const f of list || []) {
    if (f.gh == null || f.ga == null || !f.homeName || !f.awayName) continue;
    out.push({
      date: f.date || f.isoDate,
      homeName: f.homeName, awayName: f.awayName,
      homeId: teamKey(f.homeName), awayId: teamKey(f.awayName),
      gh: f.gh, ga: f.ga,
    });
  }
  return out;
}

/** Calcola forma V/P/S (ultime 5) per una squadra dalle sue partite. */
function computeForm(fixtures, teamId, teamName) {
  const mine = (fixtures || []).filter(
    (f) => f.homeId === teamId || f.awayId === teamId ||
      f.homeName?.toLowerCase() === teamName?.toLowerCase() ||
      f.awayName?.toLowerCase() === teamName?.toLowerCase()
  );
  // ordina dalla più recente
  mine.sort((x, y) => new Date(y.date) - new Date(x.date));
  return mine.slice(0, 5).map((f) => {
    const isHome = f.homeId === teamId || f.homeName?.toLowerCase() === teamName?.toLowerCase();
    const gf = isHome ? f.gh : f.ga;
    const gs = isHome ? f.ga : f.gh;
    return {
      outcome: gf > gs ? "V" : gf === gs ? "P" : "S",
      opponent: isHome ? f.awayName : f.homeName,
      score: `${gf}-${gs}`,
      date: f.date ? new Date(f.date).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "",
    };
  });
}

/**
 * Raccoglie i risultati storici di una squadra: prima API-Football,
 * poi TheSportsDB come fallback. Ritorna { id, name, source, fixtures }.
 */
/** Statistiche squadra dalle ultime ~10 partite del dataset (gol, clean sheet, V-N-P). */
function computeTeamStats(dataset, teamId) {
  const mine = (dataset || [])
    .filter((f) => f.homeId === teamId || f.awayId === teamId)
    .sort((x, y) => new Date(y.date) - new Date(x.date))
    .slice(0, 10);
  if (!mine.length) return null;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0, cs = 0;
  for (const f of mine) {
    const home = f.homeId === teamId;
    const g = home ? f.gh : f.ga, a = home ? f.ga : f.gh;
    gf += g; ga += a;
    if (a === 0) cs++;
    if (g > a) w++; else if (g === a) d++; else l++;
  }
  const n = mine.length;
  return {
    played: n, w, d, l,
    gfAvg: +(gf / n).toFixed(2),
    gaAvg: +(ga / n).toFixed(2),
    cleanSheets: cs,
  };
}

/**
 * Giocata consigliata: NON la quota più alta, ma l'ESITO PIÙ PROBABILE (modello)
 * la cui quota reale cade nella fascia 1.6–2.1. Se nessuno è in fascia, allarga
 * a 1.5–2.5. Restituisce null se non ci sono quote reali.
 */
function recommendedBet(rows) {
  const withOdds = (rows || []).filter((r) => r.hasOdds && r.odds != null);
  if (!withOdds.length) return null;
  const inBand = (lo, hi) => withOdds.filter((r) => r.odds >= lo && r.odds <= hi);
  let pool = inBand(1.6, 2.1);
  let fascia = "1.6–2.1";
  if (!pool.length) { pool = inBand(1.5, 2.5); fascia = "1.5–2.5"; }
  if (!pool.length) return null;
  // l'esito più probabile nella fascia
  pool.sort((p, q) => q.pModel - p.pModel);
  const pick = pool[0];
  return { market: pick.market, odds: pick.odds, pModel: pick.pModel, pImplied: pick.pImplied, vote: pick.vote, edge: pick.edge, fascia };
}

/**
 * Storia AMPIA per-squadra (amichevoli, qualificazioni, Nations League, WC…):
 * le ultime ~N partite della nazionale across TUTTE le competizioni.
 * @returns {object} { source, fixtures }
 */
async function gatherTeamHistory(name, afKey) {
  const en = toEnglish(name);
  // 1) Sofascore (la fonte più ricca: ~30-60 partite di tutte le competizioni)
  try {
    const sofa = await sofaRecentMatches(en);
    if (sofa && sofa.fixtures?.length >= 3) return { source: "Sofascore", fixtures: sofa.fixtures };
  } catch { /* fallback */ }
  // 2) API-Football (se il piano copre le stagioni recenti)
  if (afKey) {
    try {
      const team = await getTeamId(en, afKey);
      const fixtures = await getRecentFixtures(team.id, afKey, 40);
      if (fixtures.length >= 3) return { source: "API-Football", fixtures };
    } catch { /* fallback */ }
  }
  // 3) TheSportsDB (ultime partite di tutte le competizioni: amichevoli/qualificazioni)
  try {
    const tsdb = await fetchRecentForm(en);
    if (tsdb && tsdb.fixtures?.length) return { source: "TheSportsDB", fixtures: tsdb.fixtures };
  } catch { /* niente */ }
  return { source: null, fixtures: [] };
}

/**
 * Costruisce il dataset storico per A vs B UNENDO tutte le fonti disponibili:
 *  - football-data.org → partite del Mondiale (dataset "connesso");
 *  - per-squadra → storia ampia (amichevoli, qualificazioni…) da API-Football/TheSportsDB.
 * Tutto identificato per NOME, così il motore vede una sola entità per nazionale.
 * @returns {object} { dataset, teamA, teamB }
 */
async function buildDataset(a, b, keys) {
  const ka = teamKey(a), kb = teamKey(b);
  const all = [];
  const sources = new Set();

  // SOLO fonti affidabili e cacheate → risultato DETERMINISTICO (a parità di quote
  // la giocata consigliata non cambia tra un lancio e l'altro):
  //  - risultati internazionali pubblici (amichevoli, qualificazioni, Nations League…)
  //    filtrati a una "ego-network" attorno ad A e B;
  //  - football-data.org per le partite del Mondiale.
  // Le fonti traballanti (Sofascore 403, TheSportsDB 0/1 partita) sono escluse: davano
  // poco e introducevano variabilità tra i lanci.
  let fdMatches = [];
  const [intl] = await Promise.all([
    getInternationalResults(36).catch(() => []),
    keys.footballData
      ? getWorldCupMatches(keys.footballData).then((m) => { fdMatches = m || []; }).catch(() => {})
      : Promise.resolve(),
  ]);

  if (intl.length) {
    const norm = normAll(intl);
    const mine = norm.filter((f) => f.homeId === ka || f.awayId === ka || f.homeId === kb || f.awayId === kb);
    const teams = new Set([ka, kb]);
    for (const f of mine) { teams.add(f.homeId); teams.add(f.awayId); }
    const ego = norm.filter((f) => teams.has(f.homeId) && teams.has(f.awayId));
    if (ego.length) { all.push(...ego); sources.add("risultati internazionali (dataset pubblico)"); }
  }
  if (fdMatches.length) { all.push(...normAll(fdMatches)); sources.add("football-data.org"); }

  // dedup (stessa data + stesse squadre + stesso punteggio)
  const seen = new Set();
  let dataset = all.filter((f) => {
    const k = `${(f.date || "").slice(0, 10)}|${f.homeId}|${f.awayId}|${f.gh}-${f.ga}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // ORDINE FISSO: rende l'indicizzazione delle squadre e la stima riproducibili
  dataset.sort((x, y) => {
    const d = (x.date || "").localeCompare(y.date || "");
    if (d) return d;
    const h = x.homeId.localeCompare(y.homeId);
    return h || x.awayId.localeCompare(y.awayId);
  });

  const src = [...sources].join(" + ") || null;
  const nameOf = (k, fb) => {
    const m = dataset.find((f) => f.homeId === k || f.awayId === k);
    return m ? (m.homeId === k ? m.homeName : m.awayName) : fb;
  };

  return {
    dataset,
    teamA: { id: ka, name: nameOf(ka, toEnglish(a)), source: src },
    teamB: { id: kb, name: nameOf(kb, toEnglish(b)), source: src },
  };
}

/**
 * Analisi completa di una partita a vs b.
 * @param {string} a, b - nomi (italiano o inglese)
 * @param {object} keys - { odds, apiFootball }
 * @param {object} opts - { neutral } default true (Mondiale campo neutro)
 */
export async function analyzeMatch(a, b, keys = {}, opts = {}) {
  const neutral = opts.neutral !== false;
  const labelA = toItalian(a), labelB = toItalian(b);

  // 1) Dataset storico (football-data.org → API-Football → TheSportsDB) + quote reali
  const [{ dataset, teamA, teamB }, odds] = await Promise.all([
    buildDataset(a, b, keys),
    keys.odds ? fetchOdds(a, b, keys.odds).catch((e) => ({ found: false, source: "The Odds API", reason: e.message })) : Promise.resolve(null),
  ]);

  // 3) Stima Dixon-Coles
  const model = fitDixonColes(dataset, { refDate: new Date() });

  const result = {
    match: { a: labelA, b: labelB, aEn: teamA.name, bEn: teamB.name },
    sources: {
      strengthA: teamA.source,
      strengthB: teamB.source,
      odds: odds?.found ? odds.source : (odds ? `${odds.source} (${odds.reason})` : "non richieste"),
      engine: "Dixon-Coles (deterministico)",
    },
    form: {
      a: computeForm(dataset, teamA.id, teamA.name),
      b: computeForm(dataset, teamB.id, teamB.name),
    },
    stats: {
      a: computeTeamStats(dataset, teamA.id),
      b: computeTeamStats(dataset, teamB.id),
    },
    odds: odds && odds.found ? { nBook: odds.nBook, commence_time: odds.commence_time } : null,
  };

  if (!model.ok) {
    // Nessuna stima possibile: campo vuoto, mai inventato.
    result.engine = { ok: false, reason: model.reason };
    result.markets = [];
    return result;
  }

  // 4) Gol attesi + matrice + mercati
  // Nazioni ospitanti 2026: giocano "in casa" anche su campo formalmente neutro.
  const HOSTS = new Set(["united states", "usa", "mexico", "canada"]);
  const hostA = HOSTS.has(teamA.id), hostB = HOSTS.has(teamB.id);
  const eg = expectedGoals(model, teamA.id, teamB.id, {
    neutral,
    homeFactorA: neutral ? (hostA ? 0.5 : 0) : undefined,
    homeFactorB: neutral ? (hostB ? 0.5 : 0) : undefined,
  });
  if (!eg) {
    result.engine = { ok: false, reason: "una delle due squadre non è nel dataset storico" };
    result.markets = [];
    return result;
  }
  const sm = scoreMatrix(eg.lambda, eg.mu, model.rho);
  const { markets: modelMarkets, exact } = deriveMarkets(sm);

  // 5) Confronto col valore (quote reali → voti)
  const { rows, best, hasRealOdds } = evaluateAll(modelMarkets, odds);

  result.engine = {
    ok: true,
    lambda: eg.lambda, // gol attesi squadra A
    mu: eg.mu, // gol attesi squadra B
    rho: model.rho,
    gamma: model.gamma,
    neutral,
    hostAdvantage: hostA ? labelA : hostB ? labelB : null,
    strengthA: model.teams[teamA.id],
    strengthB: model.teams[teamB.id],
    fit: model.fit,
  };
  result.markets = rows; // ciascuna: { market, odds, pModel, pImplied, edge, vote, hasOdds }
  result.exact = exact; // risultati esatti più probabili
  result.best = best; // ★ miglior valore (o null se nessun valore)
  result.consigliata = recommendedBet(rows); // esito più probabile in fascia 1.6–2.1
  result.hasRealOdds = hasRealOdds;

  // 6) Log delle previsioni principali per la calibrazione (dedup gestito altrove)
  if (hasRealOdds) {
    const headline = rows.filter((r) => r.hasOdds && ["1", "X", "2", "Over 2.5", "Gol"].includes(r.market));
    for (const r of headline) {
      logPrediction({
        match: `${labelA} – ${labelB}`,
        market: r.market,
        pModel: r.pModel,
        odds: r.odds,
        vote: r.vote,
      }).catch(() => {});
    }
  }

  return result;
}
