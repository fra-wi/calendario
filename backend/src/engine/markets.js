// ——— Dalla matrice dei punteggi a TUTTI i mercati ———
// Ogni probabilità qui è del MODELLO Dixon-Coles (deterministica).
// teamA = righe (i gol), teamB = colonne (j gol). "1" = vince A.

/**
 * Calcola le probabilità di tutti i mercati dalla matrice P(i,j).
 * @param {object} sm - output di scoreMatrix: { matrix, maxGoals, lambda, mu }
 * @returns {object} dizionario mercato -> probabilità [0..1]
 */
export function deriveMarkets(sm) {
  const { matrix, maxGoals } = sm;
  let p1 = 0, pX = 0, p2 = 0; // 1X2
  let gol = 0, nogol = 0; // GG/NoGol
  const overP = {}; // P(total > linea) per linea .5
  const exact = []; // risultati esatti
  const totals = {}; // P(total == n)

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = matrix[i][j];
      if (p <= 0) continue;
      // 1X2
      if (i > j) p1 += p;
      else if (i === j) pX += p;
      else p2 += p;
      // GG/NoGol
      if (i > 0 && j > 0) gol += p;
      else nogol += p;
      // totale gol
      const tot = i + j;
      totals[tot] = (totals[tot] || 0) + p;
      // risultati esatti (teniamo i più probabili dopo)
      exact.push({ score: `${i}-${j}`, i, j, p });
    }
  }

  // Over/Under per le linee classiche
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  for (const line of lines) {
    let over = 0;
    for (const [tot, p] of Object.entries(totals)) {
      if (Number(tot) > line) over += p;
    }
    overP[line] = over;
  }

  // Multigol (range totali gol più comuni nei palinsesti)
  const sumRange = (lo, hi) => {
    let s = 0;
    for (const [tot, p] of Object.entries(totals)) {
      const t = Number(tot);
      if (t >= lo && t <= hi) s += p;
    }
    return s;
  };
  const multigol = {
    "1-2": sumRange(1, 2),
    "1-3": sumRange(1, 3),
    "2-3": sumRange(2, 3),
    "2-4": sumRange(2, 4),
    "3-5": sumRange(3, 5),
  };

  // Risultati esatti top 6
  exact.sort((a, b) => b.p - a.p);
  const topExact = exact.slice(0, 6).map((e) => ({ score: e.score, p: e.p }));

  // Dizionario mercati con chiavi coerenti con la UI / The Odds API
  const markets = {
    "1": p1,
    X: pX,
    "2": p2,
    "1X": p1 + pX,
    "12": p1 + p2,
    X2: pX + p2,
    Gol: gol,
    NoGol: nogol,
  };
  for (const line of lines) {
    markets[`Over ${line}`] = overP[line];
    markets[`Under ${line}`] = 1 - overP[line];
  }
  for (const [k, v] of Object.entries(multigol)) markets[`Multigol ${k}`] = v;

  return { markets, exact: topExact, totals };
}

/**
 * Raggruppamenti per il de-vigging (normalizzazione del margine bookmaker):
 * mercati mutuamente esclusivi ed esaustivi che vanno normalizzati insieme.
 */
export const MARKET_GROUPS = {
  "1x2": ["1", "X", "2"],
  ou05: ["Over 0.5", "Under 0.5"],
  ou15: ["Over 1.5", "Under 1.5"],
  ou25: ["Over 2.5", "Under 2.5"],
  ou35: ["Over 3.5", "Under 3.5"],
  ou45: ["Over 4.5", "Under 4.5"],
  btts: ["Gol", "NoGol"],
};

/** Trova il gruppo a cui appartiene un mercato (per il de-vigging). */
export function groupOf(market) {
  for (const [g, members] of Object.entries(MARKET_GROUPS)) {
    if (members.includes(market)) return members;
  }
  return null;
}
