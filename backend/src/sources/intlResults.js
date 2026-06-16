// ——— Fonte: risultati internazionali (dataset pubblico) ———
// CSV pubblico con TUTTE le partite tra nazionali (amichevoli, qualificazioni,
// Nations League, Mondiali…), aggiornato in continuo. Niente chiave, ospitato su
// GitHub raw (raggiungibile anche dai datacenter, a differenza di Sofascore).
// È la "spina dorsale" del motore: dati reali, nessun LLM.
// Fonte: github.com/martj42/international_results

import { cached } from "../lib/cache.js";

const URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";

async function fetchText(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} da raw.githubusercontent.com`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Parsea il CSV (date,home_team,away_team,home_score,away_score,...) tenendo
 * solo le partite degli ultimi `monthsBack` mesi con punteggio valido.
 * Esportata a parte per poterla testare senza rete.
 */
export function parseResults(text, monthsBack = 36, now = new Date()) {
  const lines = text.split(/\r?\n/);
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(","); // i nomi nazionali non contengono virgole
    if (c.length < 5) continue;
    const date = c[0], home = c[1], away = c[2];
    const gh = Number(c[3]), ga = Number(c[4]);
    if (!date || !home || !away || !Number.isFinite(gh) || !Number.isFinite(ga)) continue;
    if (new Date(date) < cutoff) continue;
    out.push({ date, homeName: home, awayName: away, gh, ga });
  }
  return out;
}

/** Scarica e parsea i risultati internazionali recenti (con cache lunga). */
export async function getInternationalResults(monthsBack = 36) {
  return cached(
    `intl:results:${monthsBack}`,
    async () => parseResults(await fetchText(URL), monthsBack),
    6 * 60 * 60 * 1000 // 6h: il file è grande e cambia di rado
  );
}
