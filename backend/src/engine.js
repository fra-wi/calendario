// =====================================================================
// MOTORE VOTI — deterministico, NON AI.
// Per ogni mercato confronta la probabilità IMPLICITA (dalle quote reali,
// tolto il margine) con la probabilità STIMATA (modello semplice sui dati
// reali) e calcola un voto di valore 1-10:
//
//     voto = clamp(1, 10, 5.5 + 25 × (prob_stimata − prob_implicita))
//
// Tutto è ricavato da numeri verificati: nessun giudizio dell'AI entra qui.
// =====================================================================

import { fifaNorm } from './teams.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

// Poisson: P(X = k) con media lambda
function poissonPMF(k, lambda) {
  const fact = [1, 1, 2, 6, 24, 120][k] ?? Infinity;
  return (Math.exp(-lambda) * lambda ** k) / fact;
}
// P(X <= 2) — serve per Under 2.5
function poissonLE2(lambda) {
  return poissonPMF(0, lambda) + poissonPMF(1, lambda) + poissonPMF(2, lambda);
}

// -------- probabilità IMPLICITE dalle quote (margine rimosso) --------
// Normalizza dividendo ogni 1/quota per la somma delle 1/quota del mercato.
function impliedFromOdds(odds) {
  if (!odds) return null;
  const { home, draw, away, over, under } = odds.median;
  const out = {};

  if (home && draw && away) {
    const r1 = 1 / home;
    const rX = 1 / draw;
    const r2 = 1 / away;
    const s = r1 + rX + r2; // > 1 per via del margine del bookmaker
    out.p1 = r1 / s;
    out.pX = rX / s;
    out.p2 = r2 / s;
  }
  if (over && under) {
    const ro = 1 / over;
    const ru = 1 / under;
    const st = ro + ru;
    out.pOver = ro / st;
    out.pUnder = ru / st;
  }
  return out;
}

// -------- forza squadra 0..1 da forma + gol + ranking di riferimento -----
function teamStrength(form, name) {
  const fNorm = fifaNorm(name); // baseline da ranking (0..1)
  let formNorm = 0.5; // neutro se manca la forma
  let gdNorm = 0.5;
  if (form && form.n > 0) {
    // forma pesata normalizzata: max teorico = 3 punti × peso 1.0 × n partite
    formNorm = clamp(form.weightedForm / (3 * form.n), 0, 1);
    const gd = form.avgScored - form.avgConceded; // diff gol media (~ -3..3)
    gdNorm = clamp((gd + 3) / 6, 0, 1);
  }
  // pesi del modello: ranking 40%, forma 35%, differenza reti 25%
  return clamp(0.4 * fNorm + 0.35 * formNorm + 0.25 * gdNorm, 0, 1);
}

// -------- probabilità STIMATE dal modello sui dati reali --------
function estimate(teamA, teamB, formA, formB) {
  const sA = teamStrength(formA, teamA);
  const sB = teamStrength(formB, teamB);
  const d = sA - sB; // differenza di forza in [-1, 1]

  // 1X2: costante pareggio che si riduce quando il divario cresce,
  // split vittoria/sconfitta via logistica sulla differenza di forza.
  const pDraw = clamp(0.3 - 0.22 * Math.abs(d), 0.12, 0.3);
  const pAdec = 1 / (1 + Math.exp(-3.5 * d)); // quota della parte "decisiva" ad A
  const p1 = (1 - pDraw) * pAdec;
  const p2 = (1 - pDraw) * (1 - pAdec);
  const pX = pDraw;

  // Gol attesi (lambda) dal modello: media tra attacco proprio e difesa
  // avversaria, poi inclinata dalla differenza di forza. Default 1.25 se
  // mancano le medie reali (forma non disponibile).
  const gfA = formA?.avgScored ?? 1.25;
  const gaA = formA?.avgConceded ?? 1.25;
  const gfB = formB?.avgScored ?? 1.25;
  const gaB = formB?.avgConceded ?? 1.25;
  const baseA = (gfA + gaB) / 2;
  const baseB = (gfB + gaA) / 2;
  const lambdaA = clamp(baseA * (1 + 0.35 * d), 0.2, 4.2);
  const lambdaB = clamp(baseB * (1 - 0.35 * d), 0.2, 4.2);

  // Over/Under 2.5: somma di due Poisson indipendenti = Poisson(lambdaA+lambdaB)
  const lambdaTot = lambdaA + lambdaB;
  const pUnder = poissonLE2(lambdaTot);
  const pOver = 1 - pUnder;

  // Gol/NoGol (BTTS): entrambe segnano almeno 1
  const gg = (1 - Math.exp(-lambdaA)) * (1 - Math.exp(-lambdaB));
  const ng = 1 - gg;

  return {
    p1,
    pX,
    p2,
    pOver,
    pUnder,
    gg,
    ng,
    lambdaA: round(lambdaA, 2),
    lambdaB: round(lambdaB, 2),
    strengthA: round(sA, 3),
    strengthB: round(sB, 3),
    usedFormA: !!(formA && formA.n > 0),
    usedFormB: !!(formB && formB.n > 0),
  };
}

// voto di valore dalla differenza (stimata − implicita)
function voteFor(est, impl) {
  return round(clamp(5.5 + 25 * (est - impl), 1, 10), 1);
}

// =====================================================================
// API principale del motore
// =====================================================================
export function computeAnalysis({ teamA, teamB, formA, formB, odds }) {
  const est = estimate(teamA, teamB, formA, formB);
  const impl = impliedFromOdds(odds);

  // Costruisco la griglia mercati. Il voto esiste solo se c'è la quota reale.
  const markets = [];

  const add = (key, label, oddVal, estProb, implProb) => {
    const m = {
      key,
      label,
      odd: oddVal ?? null,
      estimatedPct: round(estProb * 100, 1),
      impliedPct: implProb != null ? round(implProb * 100, 1) : null,
      vote: implProb != null ? voteFor(estProb, implProb) : null,
    };
    markets.push(m);
  };

  const md = odds?.median || {};
  add('1', 'Vittoria A (1)', md.home, est.p1, impl?.p1);
  add('X', 'Pareggio (X)', md.draw, est.pX, impl?.pX);
  add('2', 'Vittoria B (2)', md.away, est.p2, impl?.p2);
  add('over', 'Over 2.5', md.over, est.pOver, impl?.pOver);
  add('under', 'Under 2.5', md.under, est.pUnder, impl?.pUnder);

  // Gol/NoGol: il modello la stima, ma non abbiamo quota -> nessun voto.
  // La mostriamo come informazione, senza fingere quote inesistenti.
  const ggNoGol = [
    { key: 'gg', label: 'Gol (GG)', estimatedPct: round(est.gg * 100, 1) },
    { key: 'ng', label: 'NoGol (NG)', estimatedPct: round(est.ng * 100, 1) },
  ];

  // mercato migliore = voto più alto tra quelli con quota
  let best = null;
  for (const m of markets) {
    if (m.vote != null && (best === null || m.vote > best.vote)) best = m;
  }

  return {
    estimate: est,
    implied: impl,
    markets,
    ggNoGol,
    best: best ? best.key : null,
    hasOdds: !!impl && impl.p1 != null,
  };
}
