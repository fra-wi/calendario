// =====================================================================
// LAVAGNA '26 — server backend (Express, porta 3001).
// Centralizza tutte le chiamate alle API esterne (nasconde le chiavi),
// aggrega i dati e calcola i voti con il motore deterministico.
// Filosofia: se una fonte è giù, rispondiamo con un messaggio chiaro,
// MAI con dati inventati. Nessun crash.
// =====================================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { fetchFixtures, fetchForm, fetchOdds, fetchStandings } from './src/sources.js';
import { computeAnalysis } from './src/engine.js';
import { getAINotes, aiEnabled } from './src/ai.js';
import { toEnglish, toItalian, TEAMS } from './src/teams.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Trasforma un risultato di Promise.allSettled nel formato { ok, ... }
function shape(settled, extra = {}) {
  if (settled.status === 'fulfilled') {
    if (settled.value === null) return { ok: false, optional: true, ...extra };
    return { ok: true, ...settled.value };
  }
  return { ok: false, error: settled.reason?.message || 'Errore sconosciuto', ...extra };
}

// ---------------------------------------------------------------------
// Stato configurazione: dice al frontend quali funzioni opzionali sono attive
// ---------------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    ok: true,
    oddsConfigured: !!process.env.ODDS_API_KEY,
    footballDataEnabled: !!process.env.FOOTBALL_DATA_KEY,
    aiEnabled: aiEnabled(),
  });
});

// ---------------------------------------------------------------------
// Anagrafica nazionali (per il selettore manuale del frontend)
// ---------------------------------------------------------------------
app.get('/api/teams', (req, res) => {
  res.json({
    ok: true,
    teams: TEAMS.map((t) => ({ it: t.it, en: t.en })).sort((a, b) => a.it.localeCompare(b.it)),
  });
});

// ---------------------------------------------------------------------
// Calendario / prossime partite (ESPN)
// ---------------------------------------------------------------------
app.get('/api/fixtures', async (req, res) => {
  try {
    const data = await fetchFixtures();
    res.json({ ok: true, ...data });
  } catch (err) {
    res.json({ ok: false, source: 'ESPN', error: err.message });
  }
});

// ---------------------------------------------------------------------
// Forma di una nazionale (TheSportsDB)
// ---------------------------------------------------------------------
app.get('/api/form/:team', async (req, res) => {
  try {
    const data = await fetchForm(req.params.team);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.json({ ok: false, source: 'TheSportsDB', error: err.message });
  }
});

// ---------------------------------------------------------------------
// Quote mediane reali (The Odds API)
// ---------------------------------------------------------------------
app.get('/api/odds', async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.json({ ok: false, error: 'Parametri a e b obbligatori' });
  try {
    const data = await fetchOdds(a, b);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.json({ ok: false, source: 'The Odds API', error: err.message });
  }
});

// ---------------------------------------------------------------------
// Classifica girone (football-data.org, opzionale)
// ---------------------------------------------------------------------
app.get('/api/standings/:team', async (req, res) => {
  try {
    const data = await fetchStandings(req.params.team);
    if (data === null) {
      return res.json({
        ok: false,
        optional: true,
        source: 'football-data.org',
        error: 'Chiave football-data non configurata (card opzionale)',
      });
    }
    res.json({ ok: true, ...data });
  } catch (err) {
    res.json({ ok: false, source: 'football-data.org', error: err.message });
  }
});

// ---------------------------------------------------------------------
// Analisi completa: aggrega forma + quote + classifica + motore + AI
// ---------------------------------------------------------------------
app.get('/api/analysis', async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.json({ ok: false, error: 'Parametri a e b obbligatori' });

  const enA = toEnglish(a);
  const enB = toEnglish(b);

  // Tutte le fonti in parallelo: una che fallisce non blocca le altre.
  const [formAR, formBR, oddsR, standAR, standBR] = await Promise.allSettled([
    fetchForm(a),
    fetchForm(b),
    fetchOdds(a, b),
    fetchStandings(a),
    fetchStandings(b),
  ]);

  // dati grezzi per il motore (null se la fonte ha fallito)
  const formA = formAR.status === 'fulfilled' ? formAR.value : null;
  const formB = formBR.status === 'fulfilled' ? formBR.value : null;
  const odds = oddsR.status === 'fulfilled' ? oddsR.value : null;

  // motore voti deterministico (funziona anche con dati parziali)
  const engine = computeAnalysis({ teamA: enA, teamB: enB, formA, formB, odds });

  // classifica girone: provo la squadra A, altrimenti la B
  let standings = shape(standAR, { source: 'football-data.org' });
  if (!standings.ok && !standings.optional) {
    const sb = shape(standBR, { source: 'football-data.org' });
    if (sb.ok) standings = sb;
  } else if (!standings.ok && standings.optional) {
    const sb = shape(standBR, { source: 'football-data.org' });
    if (sb.ok) standings = sb;
  }

  // note AI opzionali (mai bloccanti)
  let ai = null;
  if (aiEnabled()) {
    ai = await getAINotes({ teamA: enA, teamB: enB, formA, formB, odds, engine });
  }

  res.json({
    ok: true,
    teamA: { en: enA, it: toItalian(enA) },
    teamB: { en: enB, it: toItalian(enB) },
    form: {
      a: shape(formAR, { source: 'TheSportsDB' }),
      b: shape(formBR, { source: 'TheSportsDB' }),
    },
    odds: shape(oddsR, { source: 'The Odds API' }),
    engine,
    standings,
    ai,
    aiEnabled: aiEnabled(),
    generatedAt: new Date().toISOString(),
  });
});

// fallback 404 per /api/*
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Endpoint non trovato' }));

app.listen(PORT, () => {
  console.log(`\n⚽  LAVAGNA '26 backend in ascolto su http://localhost:${PORT}`);
  console.log(`   The Odds API : ${process.env.ODDS_API_KEY ? 'configurata ✓' : 'MANCANTE ✗ (voti non calcolabili)'}`);
  console.log(`   football-data: ${process.env.FOOTBALL_DATA_KEY ? 'attiva ✓' : 'assente (classifiche off)'}`);
  console.log(`   Anthropic AI : ${aiEnabled() ? 'attiva ✓' : 'assente (note AI off)'}\n`);
});
