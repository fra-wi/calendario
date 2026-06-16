// ——— LLM opzionale: SOLO note testuali qualitative (mai numeri) ———
// Principio cardine del progetto: nessun dato fattuale da LLM. Questo modulo
// produce esclusivamente testo descrittivo (una breve nota tattica) a partire
// da numeri GIÀ calcolati dal motore. Se ANTHROPIC_API_KEY manca, è disattivato.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

let client = null;
function getClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export function llmAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Genera una nota tattica qualitativa (2-3 frasi) a partire dai dati del motore.
 * Riceve SOLO numeri già calcolati; il modello li commenta, non li produce.
 * @param {object} ctx - { a, b, lambda, mu, topMarkets, best }
 * @returns {Promise<string|null>}
 */
export async function tacticalNote(ctx) {
  const c = getClient();
  if (!c) return null;

  // Diamo al modello i numeri del motore e gli chiediamo SOLO prosa.
  const facts = [
    `Partita: ${ctx.a} vs ${ctx.b}.`,
    ctx.lambda != null ? `Gol attesi (modello Dixon-Coles): ${ctx.a} ${ctx.lambda}, ${ctx.b} ${ctx.mu}.` : "",
    ctx.best ? `Miglior mercato di valore secondo il modello: ${ctx.best.market} (quota ${ctx.best.odds}, modello ${(ctx.best.pModel * 100).toFixed(0)}% vs implicita ${(ctx.best.pImplied * 100).toFixed(0)}%).` : "Nessun mercato di chiaro valore.",
  ].filter(Boolean).join("\n");

  const system =
    "Sei un analista calcistico. Ti vengono forniti numeri GIÀ calcolati da un " +
    "modello statistico. Scrivi SOLO una breve nota tattica qualitativa in italiano " +
    "(massimo 3 frasi). NON inventare né citare nuovi numeri, statistiche, risultati, " +
    "infortuni o formazioni: usa solo ciò che ti è dato. Niente promesse di vincita. " +
    "Tono sobrio e professionale.";

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: `Dati del modello:\n${facts}\n\nScrivi la nota tattica.` }],
    });
    const text = (res.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text || null;
  } catch (e) {
    // L'LLM è opzionale: in caso di errore non blocchiamo nulla.
    return null;
  }
}
