// ——— Fonte: ESPN box-score → statistiche giocatori (tiri, falli, cartellini) ———
// ESPN risponde anche dove Sofascore è bloccato. Le etichette sono "umane"
// (Shots, Fouls Committed, Yellow Cards…), quindi le riconosciamo per PAROLA
// (substring), più robusto dei nomi tecnici. Copertura: partite del Mondiale.

import { getJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";
import { toEnglish } from "../lib/nameMap.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

/** Eventi Mondiali CONCLUSI che coinvolgono la squadra (id + data). */
export async function getTeamWcEvents(teamName) {
  const en = toEnglish(teamName).toLowerCase();
  return cached(
    `espn:events:${en}`,
    async () => {
      const start = new Date("2026-06-01");
      const end = new Date(Date.now() + 86400000);
      const j = await getJson(`${BASE}/scoreboard?limit=300&dates=${ymd(start)}-${ymd(end)}`, { timeout: 8000 });
      const evs = [];
      for (const e of j.events || []) {
        const comp = (e.competitions || [])[0] || {};
        const done = comp.status?.type?.completed;
        const names = (comp.competitors || []).map((c) => (c.team?.displayName || "").toLowerCase());
        if (done && names.some((n) => n && (n.includes(en) || en.includes(n)))) evs.push({ id: e.id, date: e.date });
      }
      // dalla più recente
      evs.sort((a, b) => new Date(b.date) - new Date(a.date));
      return evs;
    },
    10 * 60 * 1000
  );
}

/** Riconosce a quale statistica corrisponde un'etichetta ESPN. */
function classify(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("shot") && (l.includes("on goal") || l.includes("on target"))) return "shotsOn";
  if (l.includes("shot")) return "shotsTotal";
  if (l.includes("foul") && !l.includes("suffer") && !l.includes("won")) return "foulsCommitted";
  if (l.includes("yellow")) return "yellow";
  if (l.includes("red card")) return "red";
  if (l.includes("minute")) return "minutes";
  return null;
}

/** Statistiche dei giocatori di una squadra in un singolo evento. */
async function eventPlayers(eventId, teamEn) {
  const j = await getJson(`${BASE}/summary?event=${eventId}`, { timeout: 8000 });
  const out = {};
  for (const g of j.boxscore?.players || []) {
    const tn = (g.team?.displayName || "").toLowerCase();
    if (!(tn.includes(teamEn) || teamEn.includes(tn))) continue;
    for (const cat of g.statistics || []) {
      const labels = cat.labels || cat.names || cat.keys || [];
      for (const a of cat.athletes || []) {
        const name = a.athlete?.displayName;
        if (!name) continue;
        const pos = a.athlete?.position?.abbreviation || a.athlete?.position?.name;
        const rec = out[name] || (out[name] = { name, pos, s: {} });
        (a.stats || []).forEach((v, i) => {
          const k = classify(labels[i]);
          if (k) { const n = parseFloat(v); if (Number.isFinite(n)) rec.s[k] = (rec.s[k] || 0) + n; }
        });
      }
    }
  }
  return out;
}

/**
 * Medie giocatori (per le props) aggregando le ultime partite WC della squadra.
 * @returns {object} { source, players[] } — players nel formato di buildProps
 */
export async function getEspnPlayerStats(teamName, maxEvents = 6) {
  const en = toEnglish(teamName).toLowerCase();
  return cached(
    `espn:pstats:${en}`,
    async () => {
      const events = (await getTeamWcEvents(teamName)).slice(0, maxEvents);
      const agg = {};
      for (const ev of events) {
        let pls = {};
        try { pls = await eventPlayers(ev.id, en); } catch { continue; }
        for (const [name, rec] of Object.entries(pls)) {
          const a = agg[name] || (agg[name] = { name, pos: rec.pos, appearances: 0, shotsTotal: 0, shotsOn: 0, foulsCommitted: 0, yellow: 0, red: 0, minutes: 0 });
          a.appearances++;
          a.shotsTotal += rec.s.shotsTotal || 0;
          a.shotsOn += rec.s.shotsOn || 0;
          a.foulsCommitted += rec.s.foulsCommitted || 0;
          a.yellow += rec.s.yellow || 0;
          a.red += rec.s.red || 0;
          a.minutes += rec.s.minutes || 0;
        }
      }
      const players = Object.values(agg)
        .filter((p) => p.appearances > 0)
        .sort((x, y) => (y.shotsTotal + y.foulsCommitted) - (x.shotsTotal + x.foulsCommitted))
        .slice(0, 5)
        .map((p) => ({
          name: p.name, pos: p.pos, appearances: p.appearances,
          minutes: p.minutes || null, rating: null, goals: 0, assists: 0,
          shotsTotal: p.shotsTotal, shotsOn: p.shotsOn,
          foulsCommitted: p.foulsCommitted, yellow: p.yellow, red: p.red,
        }));
      return { source: "ESPN (box-score Mondiale)", players, nEvents: events.length };
    },
    30 * 60 * 1000
  );
}

/** Diagnostica: struttura grezza ed etichette del box-score (per tarare). */
export async function sampleEspn(teamName) {
  const en = toEnglish(teamName).toLowerCase();
  const events = await getTeamWcEvents(teamName);
  if (!events.length) return { nota: "nessun evento WC concluso per la squadra" };
  const j = await getJson(`${BASE}/summary?event=${events[0].id}`, { timeout: 8000 });
  const groups = j.boxscore?.players || [];
  const g = groups.find((x) => { const tn = (x.team?.displayName || "").toLowerCase(); return tn.includes(en) || en.includes(tn); }) || groups[0];
  return {
    evento: events[0].id,
    nEventiConclusi: events.length,
    hasBoxscorePlayers: groups.length > 0,
    categorie: (g?.statistics || []).map((c) => (c.labels || c.names || c.keys || [])),
    esempioAtleta: g?.statistics?.[0]?.athletes?.[0]?.athlete?.displayName || null,
  };
}
