// Test rapido del motore voti (esegui: npm run test:engine).
// Non chiama nessuna API: usa dati sintetici per verificare che la
// matematica sia coerente e deterministica.

import assert from 'node:assert';
import { computeAnalysis } from './engine.js';

const formA = {
  source: 'TheSportsDB',
  team: 'Argentina',
  n: 5,
  matches: [],
  avgScored: 2.2,
  avgConceded: 0.6,
  weightedForm: 12.4,
};
const formB = {
  source: 'TheSportsDB',
  team: 'Iran',
  n: 5,
  matches: [],
  avgScored: 1.0,
  avgConceded: 1.4,
  weightedForm: 4.2,
};
const odds = {
  source: 'The Odds API',
  bookmakers: 8,
  median: { home: 1.35, draw: 4.6, away: 9.0, over: 1.9, under: 1.95 },
};

const res = computeAnalysis({ teamA: 'Argentina', teamB: 'Iran', formA, formB, odds });

console.log('Forza A:', res.estimate.strengthA, '| Forza B:', res.estimate.strengthB);
console.log('Lambda A:', res.estimate.lambdaA, '| Lambda B:', res.estimate.lambdaB);
console.table(
  res.markets.map((m) => ({
    mercato: m.label,
    quota: m.odd,
    'impl %': m.impliedPct,
    'stim %': m.estimatedPct,
    voto: m.vote,
  }))
);
console.log('GG/NG:', res.ggNoGol.map((g) => `${g.label} ${g.estimatedPct}%`).join('  '));
console.log('Mercato migliore:', res.best);

// --- asserzioni di sanità ---
const probsSum =
  res.markets.find((m) => m.key === '1').estimatedPct +
  res.markets.find((m) => m.key === 'X').estimatedPct +
  res.markets.find((m) => m.key === '2').estimatedPct;
assert.ok(Math.abs(probsSum - 100) < 0.5, '1X2 stimate devono sommare ~100%');

const over = res.markets.find((m) => m.key === 'over').estimatedPct;
const under = res.markets.find((m) => m.key === 'under').estimatedPct;
assert.ok(Math.abs(over + under - 100) < 0.5, 'Over+Under devono sommare ~100%');

for (const m of res.markets) {
  assert.ok(m.vote >= 1 && m.vote <= 10, `voto ${m.key} fuori range`);
}
assert.ok(res.estimate.strengthA > res.estimate.strengthB, 'Argentina deve risultare più forte');

// determinismo: due esecuzioni identiche
const res2 = computeAnalysis({ teamA: 'Argentina', teamB: 'Iran', formA, formB, odds });
assert.deepStrictEqual(res, res2, 'il motore deve essere deterministico');

console.log('\n✓ Tutti i controlli superati.');
