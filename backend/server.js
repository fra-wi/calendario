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
import { getWorldCupStandings, getTeamScorerProps } from "./src/sources/footballData.js";
import { getKeyPlayersStats } from "./src/sources/sofascore.js";
import { getEspnPlayerStats } from "./src/sources/espnPlayers.js";
import { buildProps, votePropWithOdds } from "./src/engine/props.js";
import {
  calibration, settlePrediction, addPlay, settlePlay, ledger,
} from "./src/engine/calibration.js";
import { tacticalNote, llmAvailable } from "./src/llm/anthropic.js";
import { runDiagnostics } from "./src/diag.js";
import { toEnglish, toItalian } from "./src/lib/nameMap.js";

const app = express();
app.use(cors());
app.use(express.json());

// Le chiavi vivono SOLO lato server (da .env)
const KEYS = {
  odds: process.env.ODDS_API_KEY || "",
  apiFootball: process.env.API_FOOTBALL_KEY || "",
  footballData: process.env.FOOTBALL_DATA_KEY || "",
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
      footballData: !!KEYS.footballData,
      anthropic: llmAvailable(),
    },
    apiFootballRateRemaining: getRateRemaining(),
    now: new Date().toISOString(),
  });
});

// ——— Diagnostica fonti: interroga ogni API e dice cosa risponde davvero ———
app.get("/api/diag", h(async (req, res) => {
  const a = req.query.a || "Francia";
  const b = req.query.b || "Senegal";
  res.json(await runDiagnostics(KEYS, a, b));
}));

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

  // 1) Sofascore (la fonte più ricca per i singoli) — funziona se la rete non è bloccata
  try {
    const sofa = await getKeyPlayersStats(team, 4);
    if (sofa.players.length) {
      return res.json({
        source: "Sofascore",
        team: toItalian(team),
        opponent: opponent ? toItalian(opponent) : null,
        players: sofa.players,
        props: buildProps(sofa.players),
      });
    }
  } catch { /* fallback */ }

  // 2) ESPN box-score (tiri, falli, cartellini dalle partite del Mondiale) — gratis, funziona ovunque
  try {
    const espn = await getEspnPlayerStats(team, 6);
    if (espn.players.length) {
      return res.json({
        source: `ESPN box-score (${espn.nEvents} gare WC)`,
        team: toItalian(team),
        opponent: opponent ? toItalian(opponent) : null,
        players: espn.players,
        props: buildProps(espn.players),
      });
    }
  } catch { /* fallback */ }

  // 3) API-Football (se il piano copre la stagione)
  if (KEYS.apiFootball) {
    try {
      const t = await getTeamId(team, KEYS.apiFootball);
      const players = await getPlayersStats(t.id, KEYS.apiFootball);
      if (players.length) {
        return res.json({
          source: "API-Football",
          team: toItalian(t.name),
          opponent: opponent ? toItalian(opponent) : null,
          players: players.slice(0, 4),
          props: buildProps(players),
        });
      }
    } catch { /* niente */ }
  }

  // 3) football-data.org: props "Marcatore" dai gol/partita reali (gratis, funziona ovunque)
  if (KEYS.footballData) {
    try {
      const sc = await getTeamScorerProps(KEYS.footballData, team);
      if (sc.props.length) {
        return res.json({
          source: sc.source,
          team: toItalian(team),
          opponent: opponent ? toItalian(opponent) : null,
          players: sc.players,
          props: sc.props,
        });
      }
    } catch { /* niente */ }
  }

  res.json({ source: null, players: [], props: [], note: "Statistiche giocatori complete non disponibili gratis (Sofascore/FBref bloccati). Marcatori da football-data se la squadra ha già segnato; tiri/falli/cartellini richiedono ESPN o API-Football a pagamento." });
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

  let injuries = { a: [], b: [] }, h2h = [], standings = null, lineups = null;
  const usedSources = [];

  // API-Football: infortuni, H2H, formazioni, classifiche (se la chiave c'è)
  if (KEYS.apiFootball) {
    try {
      const [ta, tb] = await Promise.all([
        getTeamId(a, KEYS.apiFootball),
        getTeamId(b, KEYS.apiFootball),
      ]);
      const [injA, injB, st, hh] = await Promise.all([
        getInjuries(ta.id, KEYS.apiFootball).catch(() => []),
        getInjuries(tb.id, KEYS.apiFootball).catch(() => []),
        getStandings(ta.id, KEYS.apiFootball).catch(() => null),
        getH2HFixtures(ta.id, tb.id, KEYS.apiFootball).catch(() => []),
      ]);
      injuries = { a: injA, b: injB };
      h2h = hh;
      standings = st;
      const upcoming = (hh || []).find((f) => f.status === "NS" || f.status === "TBD");
      if (upcoming?.id) lineups = await getLineups(upcoming.id, KEYS.apiFootball).catch(() => null);
      usedSources.push("API-Football");
    } catch {
      // se API-Football è giù si prosegue con football-data per le classifiche
    }
  }

  // football-data.org: classifica girone (fallback o fonte unica)
  if (!standings && KEYS.footballData) {
    standings = await getWorldCupStandings(KEYS.footballData, a).catch(() => null);
    if (standings) usedSources.push("football-data.org");
  }

  res.json({
    source: usedSources.join(" + ") || null,
    note: usedSources.length ? undefined : "Nessuna fonte contesto configurata (serve API_FOOTBALL_KEY o FOOTBALL_DATA_KEY)",
    injuries,
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
