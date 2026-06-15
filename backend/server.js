// ——— Server LAVAGNA '26 PRO ———
// Express su porta 3001. Centralizza tutte le chiamate API, nasconde le chiavi,
// espone il motore predittivo. Ogni endpoint ha cache e gestione errori: se
// un'API è giù o ha finito i crediti, NON va in crash — risponde con l'errore.

import "dotenv/config";
import express from "express";
import cors from "cors";

import { analyzeMatch } from "./src/analysis.js";
import { fetchFixtures } from "./src/sources/espn.js";
import {
  getTeamId, getPlayersStats, getInjuries, getStandings, getH2HFixtures, getLineups,
  getRateRemaining,
} from "./src/sources/apiFootball.js";
import { fetchOdds } from "./src/sources/oddsApi.js";
import { buildProps, votePropWithOdds } from "./src/engine/props.js";
import {
  calibration, settlePrediction, addPlay, settlePlay, ledger,
} from "./src/engine/calibration.js";
import { tacticalNote, llmAvailable } from "./src/llm/anthropic.js";
import { toEnglish, toItalian } from "./src/lib/nameMap.js";

const app = express();
app.use(cors());
app.use(express.json());

// Le chiavi vivono SOLO lato server (da .env)
const KEYS = {
  odds: process.env.ODDS_API_KEY || "",
  apiFootball: process.env.API_FOOTBALL_KEY || "",
};

// Helper: wrappa un handler async e gira gli errori in JSON (mai crash)
const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(502).json({ error: e.message || "errore interno", source: "backend" });
  }
};

// ——— Stato/diagnostica ———
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    keys: {
      odds: !!KEYS.odds,
      apiFootball: !!KEYS.apiFootball,
      anthropic: llmAvailable(),
    },
    apiFootballRateRemaining: getRateRemaining(),
    now: new Date().toISOString(),
  });
});

// ——— Calendario Mondiali (ESPN) ———
app.get("/api/fixtures", h(async (req, res) => {
  const list = await fetchFixtures();
  res.json({ source: "ESPN", verified: true, fixtures: list });
}));

// ——— Analisi completa partita (cuore: motore + quote + voti) ———
app.get("/api/match", h(async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "parametri 'a' e 'b' richiesti" });
  const neutral = req.query.neutral !== "false";
  const data = await analyzeMatch(a, b, KEYS, { neutral });
  res.json(data);
}));

// ——— Quote reali (solo The Odds API, senza motore) ———
app.get("/api/odds", h(async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "parametri 'a' e 'b' richiesti" });
  if (!KEYS.odds) return res.status(400).json({ error: "ODDS_API_KEY non configurata" });
  const data = await fetchOdds(a, b, KEYS.odds);
  res.json(data);
}));

// ——— Giocatori chiave + props (API-Football) ———
app.get("/api/players", h(async (req, res) => {
  const { team, opponent } = req.query;
  if (!team) return res.status(400).json({ error: "parametro 'team' richiesto" });
  if (!KEYS.apiFootball) return res.json({ source: null, players: [], props: [], note: "API_FOOTBALL_KEY non configurata" });
  const t = await getTeamId(team, KEYS.apiFootball);
  const players = await getPlayersStats(t.id, KEYS.apiFootball);
  const props = buildProps(players);
  res.json({
    source: "API-Football",
    team: toItalian(t.name),
    opponent: opponent ? toItalian(opponent) : null,
    players: players.slice(0, 4),
    props,
  });
}));

// ——— Voto di una prop quando l'utente inserisce la quota a mano ———
app.post("/api/props/vote", h(async (req, res) => {
  const { prop, odds } = req.body || {};
  if (!prop || prop.pModel == null) return res.status(400).json({ error: "prop con pModel richiesta" });
  res.json(votePropWithOdds(prop, Number(odds)));
}));

// ——— Contesto: H2H, infortuni, classifica girone (API-Football) ———
app.get("/api/context", h(async (req, res) => {
  const { a, b } = req.query;
  if (!a || !b) return res.status(400).json({ error: "parametri 'a' e 'b' richiesti" });
  if (!KEYS.apiFootball) return res.json({ source: null, note: "API_FOOTBALL_KEY non configurata" });

  const [ta, tb] = await Promise.all([
    getTeamId(a, KEYS.apiFootball),
    getTeamId(b, KEYS.apiFootball),
  ]);
  const [injA, injB, standings, h2h] = await Promise.all([
    getInjuries(ta.id, KEYS.apiFootball).catch(() => []),
    getInjuries(tb.id, KEYS.apiFootball).catch(() => []),
    getStandings(ta.id, KEYS.apiFootball).catch(() => null),
    getH2HFixtures(ta.id, tb.id, KEYS.apiFootball).catch(() => []),
  ]);

  // Prova a recuperare le formazioni dalla prossima partita tra le due
  let lineups = null;
  const upcoming = (h2h || []).find((f) => f.status === "NS" || f.status === "TBD");
  if (upcoming?.id) {
    lineups = await getLineups(upcoming.id, KEYS.apiFootball).catch(() => null);
  }

  res.json({
    source: "API-Football",
    injuries: { a: injA, b: injB },
    standings,
    h2h,
    lineups,
  });
}));

// ——— Nota tattica qualitativa (LLM opzionale, MAI numeri) ———
app.post("/api/note", h(async (req, res) => {
  if (!llmAvailable()) return res.json({ note: null, available: false });
  const note = await tacticalNote(req.body || {});
  res.json({ note, available: true, source: "Anthropic (solo testo)" });
}));

// ——— Calibrazione & registro ———
app.get("/api/calibration", h(async (req, res) => {
  res.json(await calibration());
}));

app.post("/api/predictions/:id/settle", h(async (req, res) => {
  const { won } = req.body || {};
  res.json(await settlePrediction(req.params.id, !!won));
}));

app.get("/api/ledger", h(async (req, res) => {
  res.json(await ledger());
}));

app.post("/api/plays", h(async (req, res) => {
  res.json(await addPlay(req.body || {}));
}));

app.post("/api/plays/:id/settle", h(async (req, res) => {
  const { result } = req.body || {};
  res.json(await settlePlay(req.params.id, result));
}));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`⚽ LAVAGNA '26 PRO backend → http://localhost:${PORT}`);
  console.log(`   The Odds API: ${KEYS.odds ? "✓" : "—"} · API-Football: ${KEYS.apiFootball ? "✓" : "—"} · LLM note: ${llmAvailable() ? "✓" : "—"}`);
});
