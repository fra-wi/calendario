// ——— Orchestratore analisi partita ———
// Mette insieme fonti (quote + risultati storici) e motore Dixon-Coles per
// produrre il payload completo di una partita: forze stimate, gol attesi,
// matrice dei mercati con p_modello/p_implicita/voto, fonti tracciate.
// Nessun numero proviene da un LLM.

import { getTeamId, getRecentFixtures } from "./sources/apiFootball.js";
import { fetchRecentForm } from "./sources/theSportsDb.js";
import { fetchOdds } from "./sources/oddsApi.js";
import { toEnglish, toItalian } from "./lib/nameMap.js";
import { fitDixonColes, expectedGoals, scoreMatrix } from "./engine/dixonColes.js";
import { deriveMarkets } from "./engine/markets.js";
import { evaluateAll } from "./engine/value.js";
import { logPrediction } from "./engine/calibration.js";

// Per il fallback TheSportsDB usiamo il nome squadra come id stabile.
function nameId(name) {
  return "n:" + (name || "").trim().toLowerCase();
}

/** Normalizza una lista di partite per il motore (id numerici o nomi). */
function normalizeFixtures(list) {
  const out = [];
  for (const f of list || []) {
    if (f.gh == null || f.ga == null) continue;
    const homeId = f.homeId != null ? f.homeId : nameId(f.homeName);
    const awayId = f.awayId != null ? f.awayId : nameId(f.awayName);
    out.push({ homeId, awayId, gh: f.gh, ga: f.ga, date: f.date || f.isoDate, homeName: f.homeName, awayName: f.awayName });
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
async function gatherTeam(name, afKey) {
  const en = toEnglish(name);
  // 1) API-Football
  if (afKey) {
    try {
      const team = await getTeamId(en, afKey);
      const fixtures = await getRecentFixtures(team.id, afKey, 40);
      if (fixtures.length >= 3) {
        return { id: team.id, name: team.name, source: "API-Football", fixtures };
      }
    } catch {
      // continua col fallback
    }
  }
  // 2) TheSportsDB
  try {
    const tsdb = await fetchRecentForm(en);
    if (tsdb && tsdb.fixtures?.length) {
      return { id: nameId(en), name: en, source: "TheSportsDB", fixtures: tsdb.fixtures };
    }
  } catch {}
  return { id: nameId(en), name: en, source: null, fixtures: [] };
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

  // 1) Risultati storici di entrambe (in parallelo) + quote reali
  const [teamA, teamB, odds] = await Promise.all([
    gatherTeam(a, keys.apiFootball),
    gatherTeam(b, keys.apiFootball),
    keys.odds ? fetchOdds(a, b, keys.odds).catch((e) => ({ found: false, source: "The Odds API", reason: e.message })) : Promise.resolve(null),
  ]);

  // 2) Dataset comune per il motore (unione, deduplicata per data+squadre)
  const merged = [...normalizeFixtures(teamA.fixtures), ...normalizeFixtures(teamB.fixtures)];
  const seen = new Set();
  const dataset = merged.filter((f) => {
    const k = `${f.date}|${f.homeId}|${f.awayId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

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
    odds: odds && odds.found ? { nBook: odds.nBook, commence_time: odds.commence_time } : null,
  };

  if (!model.ok) {
    // Nessuna stima possibile: campo vuoto, mai inventato.
    result.engine = { ok: false, reason: model.reason };
    result.markets = [];
    return result;
  }

  // 4) Gol attesi + matrice + mercati
  const eg = expectedGoals(model, teamA.id, teamB.id, { neutral });
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
    strengthA: model.teams[teamA.id],
    strengthB: model.teams[teamB.id],
    fit: model.fit,
  };
  result.markets = rows; // ciascuna: { market, odds, pModel, pImplied, edge, vote, hasOdds }
  result.exact = exact; // risultati esatti più probabili
  result.best = best; // ★ miglior valore (o null se nessun valore)
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
