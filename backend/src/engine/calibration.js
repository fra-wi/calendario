// ——— Calibrazione & registro (la verifica onesta del modello) ———
// Il paper "Game Plan" insiste sul rigore predittivo: logghiamo ogni previsione
// e, a risultato noto, calcoliamo il Brier score e la curva di affidabilità
// (quanto spesso si avvera ciò a cui il modello assegna X%). Persistito su file.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_FILE = fileURLToPath(new URL("../../data/predictions.json", import.meta.url));

async function load() {
  try {
    const txt = await readFile(DATA_FILE, "utf8");
    return JSON.parse(txt);
  } catch {
    return { predictions: [], plays: [] };
  }
}

async function save(db) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

/**
 * Logga una previsione del modello (prima della partita).
 * @param {object} rec - { match, market, pModel, odds, vote }
 */
export async function logPrediction(rec) {
  const db = await load();
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    match: rec.match,
    market: rec.market,
    pModel: rec.pModel,
    odds: rec.odds ?? null,
    vote: rec.vote ?? null,
    settled: false,
    won: null, // true/false a risultato noto
  };
  db.predictions.push(entry);
  await save(db);
  return entry;
}

/** Segna l'esito di una previsione (won = true/false) per la calibrazione. */
export async function settlePrediction(id, won) {
  const db = await load();
  const p = db.predictions.find((x) => x.id === id);
  if (!p) throw new Error("previsione non trovata");
  p.settled = true;
  p.won = !!won;
  p.settledAt = new Date().toISOString();
  await save(db);
  return p;
}

/**
 * Brier score e curva di affidabilità sulle previsioni regolate.
 * Brier = media( (pModel - esito)^2 ); 0 = perfetto, 0.25 = come il caso a 50%.
 */
export async function calibration() {
  const db = await load();
  const settled = db.predictions.filter((p) => p.settled && p.pModel != null);
  if (!settled.length) {
    return { n: 0, brier: null, reliability: [], note: "nessuna previsione regolata: la calibrazione comparirà man mano." };
  }
  // Brier score
  let sum = 0;
  for (const p of settled) {
    const o = p.won ? 1 : 0;
    sum += (p.pModel - o) ** 2;
  }
  const brier = +(sum / settled.length).toFixed(4);

  // Curva di affidabilità: bucket di probabilità da 0-10% … 90-100%
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${i * 10 + 10}%`,
    lo: i / 10, hi: (i + 1) / 10,
    n: 0, sumP: 0, won: 0,
  }));
  for (const p of settled) {
    const idx = Math.min(9, Math.floor(p.pModel * 10));
    const b = buckets[idx];
    b.n++; b.sumP += p.pModel; if (p.won) b.won++;
  }
  const reliability = buckets
    .filter((b) => b.n > 0)
    .map((b) => ({
      range: b.range,
      n: b.n,
      pModelMedio: +(b.sumP / b.n).toFixed(3),
      hitRate: +(b.won / b.n).toFixed(3),
    }));

  // Brier di riferimento "no-skill": prevedendo sempre la frequenza base
  const base = settled.filter((p) => p.won).length / settled.length;
  const brierBase = +(base * (1 - base)).toFixed(4);

  return { n: settled.length, brier, brierBase, reliability };
}

// ——— Registro giocate (bilancio in unità, hit-rate per fascia di voto) ———

/** Aggiunge una giocata segnata dall'utente. */
export async function addPlay(play) {
  const db = await load();
  const entry = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    createdAt: new Date().toISOString(),
    match: play.match || "",
    market: play.market || "",
    odds: Number(play.odds) || null,
    stake: Number(play.stake) || 1, // in unità
    vote: play.vote ?? null,
    result: play.result || "pending", // "win" | "loss" | "void" | "pending"
  };
  db.plays.push(entry);
  await save(db);
  return entry;
}

/** Aggiorna l'esito di una giocata. */
export async function settlePlay(id, result) {
  const db = await load();
  const p = db.plays.find((x) => x.id === id);
  if (!p) throw new Error("giocata non trovata");
  p.result = result;
  await save(db);
  return p;
}

/** Bilancio in unità + hit-rate per fascia di voto. */
export async function ledger() {
  const db = await load();
  const plays = db.plays || [];
  let profit = 0, staked = 0, wins = 0, settled = 0;
  // fasce di voto: <6, 6-7, 7-8, 8+
  const bands = {
    "<6": { n: 0, win: 0, profit: 0 },
    "6-7": { n: 0, win: 0, profit: 0 },
    "7-8": { n: 0, win: 0, profit: 0 },
    "8+": { n: 0, win: 0, profit: 0 },
  };
  const bandOf = (v) => (v == null ? "<6" : v >= 8 ? "8+" : v >= 7 ? "7-8" : v >= 6 ? "6-7" : "<6");

  for (const p of plays) {
    if (p.result === "pending") continue;
    settled++;
    staked += p.stake;
    const b = bands[bandOf(p.vote)];
    b.n++;
    let pl = 0;
    if (p.result === "win") { pl = p.stake * (p.odds - 1); wins++; b.win++; }
    else if (p.result === "loss") { pl = -p.stake; }
    // void: 0
    profit += pl;
    b.profit += pl;
  }
  return {
    plays,
    summary: {
      nSettled: settled,
      staked: +staked.toFixed(2),
      profit: +profit.toFixed(2),
      roi: staked > 0 ? +((profit / staked) * 100).toFixed(1) : null,
      hitRate: settled > 0 ? +((wins / settled) * 100).toFixed(1) : null,
    },
    byVoteBand: Object.fromEntries(
      Object.entries(bands).map(([k, b]) => [
        k,
        { n: b.n, hitRate: b.n ? +((b.win / b.n) * 100).toFixed(1) : null, profit: +b.profit.toFixed(2) },
      ])
    ),
  };
}
