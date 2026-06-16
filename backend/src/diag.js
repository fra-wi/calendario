// ——— Diagnostica fonti dati ———
// Interroga ogni fonte e riporta, in modo leggibile, cosa risponde davvero:
// status, conteggi, errori, e (per API-Football) il PIANO e le richieste.
// Serve a capire perché una partita mostra pochi dati, senza tirare a indovinare.

import { getJson } from "./lib/http.js";
import { toEnglish } from "./lib/nameMap.js";
import {
  getStatus, getTeamId, getRecentFixtures, getWorldCupLeagueId,
} from "./sources/apiFootball.js";
import { fetchRecentForm } from "./sources/theSportsDb.js";
import { getWorldCupMatches } from "./sources/footballData.js";
import { fetchFixtures } from "./sources/espn.js";

const probe = async (name, fn) => {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t0, ...detail };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: e.message };
  }
};

/**
 * Esegue tutte le probe. `a`/`b` sono due nazionali di prova (default Francia/Senegal).
 */
export async function runDiagnostics(keys, a = "Francia", b = "Senegal") {
  const enA = toEnglish(a), enB = toEnglish(b);

  const probes = await Promise.all([
    // 1) The Odds API — quanti eventi Mondiali nel feed quote
    probe("The Odds API", async () => {
      if (!keys.odds) return { skipped: "ODDS_API_KEY mancante" };
      const list = await getJson(
        `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${encodeURIComponent(keys.odds)}&regions=eu&markets=h2h&oddsFormat=decimal`,
        { timeout: 8000 }
      );
      const n = Array.isArray(list) ? list.length : 0;
      return {
        eventiNelFeed: n,
        esempi: (Array.isArray(list) ? list.slice(0, 5) : []).map((e) => `${e.home_team} vs ${e.away_team}`),
      };
    }),

    // 2) API-Football — piano + capacità di restituire risultati recenti
    probe("API-Football /status", async () => {
      if (!keys.apiFootball) return { skipped: "API_FOOTBALL_KEY mancante" };
      return await getStatus(keys.apiFootball);
    }),
    probe(`API-Football team+fixtures (${enA})`, async () => {
      if (!keys.apiFootball) return { skipped: "API_FOOTBALL_KEY mancante" };
      const team = await getTeamId(enA, keys.apiFootball);
      const fixtures = await getRecentFixtures(team.id, keys.apiFootball, 10);
      return {
        teamId: team.id,
        teamName: team.name,
        risultatiRecenti: fixtures.length,
        ultimo: fixtures[0] ? `${fixtures[0].homeName} ${fixtures[0].gh}-${fixtures[0].ga} ${fixtures[0].awayName} (${fixtures[0].date?.slice(0, 10)})` : null,
      };
    }),
    probe("API-Football World Cup league", async () => {
      if (!keys.apiFootball) return { skipped: "API_FOOTBALL_KEY mancante" };
      const id = await getWorldCupLeagueId(keys.apiFootball);
      return { leagueId: id, season: 2026 };
    }),

    // 3) football-data.org — partite Mondiali concluse (dataset per il motore)
    probe("football-data.org Mondiale", async () => {
      if (!keys.footballData) return { skipped: "FOOTBALL_DATA_KEY mancante" };
      const wc = await getWorldCupMatches(keys.footballData);
      const present = (name) => wc.some((m) => (m.homeName + " " + m.awayName).toLowerCase().includes(name.toLowerCase()));
      return {
        partiteConcluse: wc.length,
        contiene_A: present(enA),
        contiene_B: present(enB),
        esempi: wc.slice(0, 3).map((m) => `${m.homeName} ${m.gh}-${m.ga} ${m.awayName}`),
      };
    }),

    // 4) TheSportsDB — quante partite storiche per le due squadre
    probe(`TheSportsDB (${enA})`, async () => {
      const f = await fetchRecentForm(enA);
      return f ? { partite: f.nMatches, gfAvg: f.gfAvg, gsAvg: f.gsAvg } : { partite: 0, nota: "nessun dato" };
    }),
    probe(`TheSportsDB (${enB})`, async () => {
      const f = await fetchRecentForm(enB);
      return f ? { partite: f.nMatches, gfAvg: f.gfAvg, gsAvg: f.gsAvg } : { partite: 0, nota: "nessun dato" };
    }),

    // 4) ESPN — calendario
    probe("ESPN calendario", async () => {
      const fx = await fetchFixtures();
      return { partite: fx.length, esempi: fx.slice(0, 3).map((f) => `${f.a} vs ${f.b} ${f.data}`) };
    }),
  ]);

  // Sintesi: quante partite storiche totali avrebbe il motore per A vs B
  const af = probes.find((p) => p.name.startsWith("API-Football team"));
  const tsdbA = probes.find((p) => p.name.startsWith("TheSportsDB") && p.name.includes(enA));
  const tsdbB = probes.find((p) => p.name.startsWith("TheSportsDB") && p.name.includes(enB));
  const fd = probes.find((p) => p.name === "football-data.org Mondiale");
  // Il motore UNISCE tutte le fonti (torneo + storia ampia per-squadra): somma approssimata
  const fdN = fd?.ok ? fd.partiteConcluse : 0;
  const afN = af?.risultatiRecenti || 0;
  const tsA = tsdbA?.partite || 0;
  const tsB = tsdbB?.partite || 0;
  // se API-Football funziona dà la storia ampia, altrimenti TheSportsDB
  const histTot = afN >= 3 ? afN * 2 : tsA + tsB;
  const partiteStimate = fdN + histTot;

  return {
    testMatch: `${enA} vs ${enB}`,
    probes,
    sintesi: {
      quoteOk: probes.find((p) => p.name === "The Odds API")?.eventiNelFeed > 0,
      apiFootballPiano: probes.find((p) => p.name === "API-Football /status")?.plan || "n/d",
      footballDataPartite: fd?.ok ? fd.partiteConcluse : 0,
      datasetUsatoDalMotore: partiteStimate,
      verdetto:
        partiteStimate >= 6
          ? "Dati storici sufficienti per il motore."
          : "Dati storici INSUFFICIENTI: il motore non può stimare le forze. Aggiungi FOOTBALL_DATA_KEY (gratis) o un piano dati con la stagione 2026.",
    },
  };
}
