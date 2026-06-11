// =====================================================================
// NOTE QUALITATIVE AI — OPZIONALE.
// Si attiva SOLO se ANTHROPIC_API_KEY è presente. Riceve i dati GIÀ
// VERIFICATI e restituisce esclusivamente giudizi qualitativi in italiano.
// REGOLA: l'AI non produce MAI numeri/statistiche/risultati. Se la chiave
// manca o la chiamata fallisce, ritorna null e l'app funziona identica.
//
// Modello: claude-sonnet-4-6 (scelta esplicita per costo, come da richiesta;
// l'API Anthropic è a pagamento, perciò questa parte è opzionale).
// =====================================================================

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Costruisce un riassunto compatto dei SOLI dati verificati da passare all'AI.
function buildContext({ teamA, teamB, formA, formB, odds, engine }) {
  const formaTxt = (f) =>
    f && f.matches
      ? f.matches
          .map((m) => `${m.outcome} vs ${m.opponentIt || m.opponent} (${m.opponentTier}) ${m.scored}-${m.conceded}`)
          .join('; ')
      : 'non disponibile';

  return {
    partita: `${teamA} - ${teamB}`,
    formaA: formaTxt(formA),
    formaB: formaTxt(formB),
    mercati: engine.markets.map((m) => ({
      mercato: m.label,
      voto: m.vote,
    })),
    migliorMercato: engine.best,
    quoteDisponibili: !!odds,
  };
}

export async function getAINotes(payload) {
  if (!aiEnabled()) return null;

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 15000, // non blocchiamo l'analisi se l'AI è lenta
    maxRetries: 1,
  });

  const system =
    'Sei un analista tattico di calcio. Ricevi dati GIÀ VERIFICATI (forma, ' +
    'voti di valore già calcolati da un motore deterministico). Il tuo unico ' +
    'compito è interpretarli QUALITATIVAMENTE in italiano. REGOLE FERREE: ' +
    'NON inventare numeri, NON citare cifre/percentuali/quote/risultati, ' +
    'NON produrre statistiche (le mostra già l\'app). Solo valutazioni a parole. ' +
    'Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo attorno, ' +
    'con esattamente questi campi (stringhe brevi, 1-2 frasi ciascuna): ' +
    '{"formaA": "...", "formaB": "...", "tattica": "...", "sintesi": "..."}.';

  const context = buildContext(payload);

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [
        {
          role: 'user',
          content:
            'Dati verificati della partita (NON ripeterli come numeri, ' +
            'interpretali a parole):\n' +
            JSON.stringify(context, null, 2),
        },
      ],
    });

    // estraggo il testo e provo a parsare il JSON in modo difensivo
    const text = (res.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    const parsed = safeParseJSON(text);
    if (!parsed) return null;

    return {
      source: `Anthropic ${MODEL}`,
      formaA: clip(parsed.formaA),
      formaB: clip(parsed.formaB),
      tattica: clip(parsed.tattica),
      sintesi: clip(parsed.sintesi),
    };
  } catch (err) {
    // Mai bloccare l'app per un errore dell'AI opzionale.
    console.warn('[AI] nota qualitativa non disponibile:', err.message);
    return null;
  }
}

// Estrae il primo oggetto JSON valido dalla risposta (robusto a testo extra).
function safeParseJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function clip(s) {
  if (typeof s !== 'string') return null;
  return s.trim().slice(0, 400);
}
