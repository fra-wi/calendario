// ——— Motore predittivo Dixon-Coles ———
// Estensione del modello di Poisson (Dixon & Coles, 1997), standard accademico
// per le quote calcio. Ispirato anche a Tuyls, Hassabis et al., "Game Plan"
// (JAIR 71, 2021): apprendimento statistico delle forze di squadra senza dati di
// tracking. Tutto deterministico: nessun numero proviene da un LLM.
//
// Idee implementate:
//  - forza d'attacco e difesa di ogni nazionale stimata in JOINT da tutti i
//    risultati (così la forza è RELATIVA agli avversari affrontati);
//  - DECADIMENTO TEMPORALE: le partite recenti pesano di più (half-life ~9 mesi);
//  - correzione Dixon-Coles τ per i punteggi bassi (0-0,1-0,0-1,1-1);
//  - regolarizzazione L2 (ridge) per non sovrastimare squadre con pochi dati;
//  - vantaggio campo γ (azzerabile per i campi neutri del Mondiale).

const HALF_LIFE_DAYS = 9 * 30; // ~9 mesi
const XI = Math.LN2 / HALF_LIFE_DAYS; // tasso di decadimento esponenziale
const MAX_GOALS = 10; // dimensione della matrice dei punteggi
const RIDGE = 0.05; // forza della regolarizzazione L2 verso 0

/** Poisson PMF. */
function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // log per stabilità, poi exp
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

/** Correzione Dixon-Coles τ per i 4 punteggi bassi correlati. */
function tau(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/** Peso temporale: la partita di `daysAgo` giorni fa pesa exp(-ξ·giorni). */
function timeWeight(isoDate, refMs) {
  if (!isoDate) return 0.5;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 0.5;
  const days = Math.max(0, (refMs - t) / 86400000);
  return Math.exp(-XI * days);
}

/**
 * Adatta i parametri Dixon-Coles a un dataset di partite.
 * @param {Array} matches - [{ homeId, awayId, gh, ga, date }]
 * @param {object} opts - { refDate }
 * @returns {object} modello { attack, defense, gamma, rho, teams, index, fit }
 */
export function fitDixonColes(matches, opts = {}) {
  const refMs = opts.refDate ? new Date(opts.refDate).getTime() : Date.now();

  // 1) Indicizza le squadre presenti nel dataset
  const index = new Map(); // teamId -> idx
  const ids = [];
  const addTeam = (id) => {
    if (id == null) return;
    if (!index.has(id)) {
      index.set(id, ids.length);
      ids.push(id);
    }
  };
  const data = [];
  for (const m of matches) {
    if (m.gh == null || m.ga == null || m.homeId == null || m.awayId == null) continue;
    addTeam(m.homeId);
    addTeam(m.awayId);
    data.push({
      h: m.homeId, a: m.awayId, gh: m.gh, ga: m.ga,
      w: timeWeight(m.date, refMs),
      names: { h: m.homeName, a: m.awayName },
    });
  }
  const N = ids.length;
  if (N < 2 || data.length < 3) {
    return { ok: false, reason: "dati storici insufficienti per stimare le forze" };
  }

  // 2) Parametri: attack[N], defense[N], gamma, rho.  Init neutro.
  let attack = new Array(N).fill(0);
  let defense = new Array(N).fill(0);
  let gamma = 0.25; // ln(vantaggio campo) iniziale (~1.28x)
  let rho = -0.05;

  // Negative log-likelihood pesata + ridge (da MINIMIZZARE).
  const nll = (att, def, g, r) => {
    let s = 0;
    for (const d of data) {
      const ih = index.get(d.h), ia = index.get(d.a);
      const lam = Math.exp(att[ih] - def[ia] + g);
      const mu = Math.exp(att[ia] - def[ih]);
      const t = tau(d.gh, d.ga, lam, mu, r);
      const tt = t > 1e-9 ? t : 1e-9; // guardia: τ deve restare positivo
      // log-verosimiglianza Poisson (senza i fattoriali, costanti)
      const ll = Math.log(tt) + (d.gh * Math.log(lam) - lam) + (d.ga * Math.log(mu) - mu);
      s -= d.w * ll;
    }
    // ridge: penalizza forze estreme (regolarizza le squadre con pochi match)
    for (let i = 0; i < N; i++) s += RIDGE * (att[i] * att[i] + def[i] * def[i]);
    return s;
  };

  // 3) Ottimizzazione: discesa del gradiente (gradiente numerico) con Adam.
  const theta = [...attack, ...defense, gamma, rho];
  const P = theta.length;
  const m = new Array(P).fill(0), v = new Array(P).fill(0);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const lr = 0.05;
  const h = 1e-4;
  const unpack = (th) => ({
    att: th.slice(0, N),
    def: th.slice(N, 2 * N),
    g: th[2 * N],
    r: Math.max(-0.2, Math.min(0.2, th[2 * N + 1])), // ρ in range sicuro
  });
  const cost = (th) => {
    const { att, def, g, r } = unpack(th);
    return nll(att, def, g, r);
  };

  const ITER = 250;
  for (let it = 0; it < ITER; it++) {
    const base = cost(theta);
    // gradiente numerico (differenze in avanti: P+1 valutazioni)
    const grad = new Array(P);
    for (let p = 0; p < P; p++) {
      const old = theta[p];
      theta[p] = old + h;
      grad[p] = (cost(theta) - base) / h;
      theta[p] = old;
    }
    // passo Adam
    for (let p = 0; p < P; p++) {
      m[p] = b1 * m[p] + (1 - b1) * grad[p];
      v[p] = b2 * v[p] + (1 - b2) * grad[p] * grad[p];
      const mh = m[p] / (1 - Math.pow(b1, it + 1));
      const vh = v[p] / (1 - Math.pow(b2, it + 1));
      theta[p] -= (lr * mh) / (Math.sqrt(vh) + eps);
    }
    // vincolo di identificabilità: media(attack)=0 e media(defense)=0
    let ma = 0, md = 0;
    for (let i = 0; i < N; i++) { ma += theta[i]; md += theta[N + i]; }
    ma /= N; md /= N;
    for (let i = 0; i < N; i++) { theta[i] -= ma; theta[N + i] -= md; }
    // mantieni γ ≥ 0 (il vantaggio campo non è negativo) e ρ nel range
    if (theta[2 * N] < 0) theta[2 * N] = 0;
    theta[2 * N + 1] = Math.max(-0.2, Math.min(0.2, theta[2 * N + 1]));
  }

  const fin = unpack(theta);
  attack = fin.att; defense = fin.def; gamma = fin.g; rho = fin.r;

  // mappa idTeam -> { attack, defense } leggibile
  const teams = {};
  for (let i = 0; i < N; i++) {
    teams[ids[i]] = {
      attack: +attack[i].toFixed(4),
      defense: +defense[i].toFixed(4),
    };
  }

  return {
    ok: true,
    teams,
    index: Object.fromEntries(index),
    gamma: +gamma.toFixed(4),
    rho: +rho.toFixed(4),
    fit: { nMatches: data.length, nTeams: N, halfLifeDays: HALF_LIFE_DAYS },
    _arr: { attack, defense, ids },
  };
}

/**
 * Lambda/mu attesi per una partita teamA (casa) vs teamB (ospite).
 * @param {object} model - output di fitDixonColes
 * @param {object} opts - { neutral } (true → niente vantaggio campo: Mondiale)
 */
export function expectedGoals(model, idA, idB, opts = {}) {
  const ta = model.teams[idA], tb = model.teams[idB];
  if (!ta || !tb) return null;
  // Fattore di vantaggio campo per ciascuna squadra (0 = neutro, 1 = casa piena).
  // Default: partita non-neutra → A jhomeFactor 1; neutra → 0 per entrambe.
  // Le nazioni ospitanti (USA/Messico/Canada) ricevono un fattore parziale.
  const fA = opts.homeFactorA ?? (opts.neutral ? 0 : 1);
  const fB = opts.homeFactorB ?? 0;
  const lambda = Math.exp(ta.attack - tb.defense + fA * model.gamma);
  const mu = Math.exp(tb.attack - ta.defense + fB * model.gamma);
  return { lambda: +lambda.toFixed(3), mu: +mu.toFixed(3) };
}

/**
 * Matrice dei punteggi esatti P(i,j) con correzione Dixon-Coles, rinormalizzata.
 * @returns {object} { matrix, lambda, mu, rho, maxGoals }
 */
export function scoreMatrix(lambda, mu, rho, maxGoals = MAX_GOALS) {
  const matrix = [];
  let total = 0;
  for (let i = 0; i <= maxGoals; i++) {
    matrix[i] = [];
    for (let j = 0; j <= maxGoals; j++) {
      const p = tau(i, j, lambda, mu, rho) * poisson(i, lambda) * poisson(j, mu);
      const pp = Math.max(0, p); // guardia numerica
      matrix[i][j] = pp;
      total += pp;
    }
  }
  // rinormalizza (la coda oltre maxGoals e la correzione τ alterano la somma)
  if (total > 0) {
    for (let i = 0; i <= maxGoals; i++)
      for (let j = 0; j <= maxGoals; j++) matrix[i][j] /= total;
  }
  return { matrix, lambda, mu, rho, maxGoals };
}

export { MAX_GOALS, poisson };
