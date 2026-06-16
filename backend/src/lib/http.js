// ——— Fetch robusto con timeout e gestione errori ———
// Regola del progetto: timeout 8s di default e nessun crash se un'API è giù.
// Ogni chiamata torna i dati oppure lancia un Error con messaggio leggibile;
// chi chiama decide se è fatale o se passare a un fallback.

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * GET JSON con timeout duro (AbortController).
 * @param {string} url
 * @param {object} opts - { timeout, headers }
 * @returns {Promise<any>} corpo JSON parsato
 */
export async function fetchJson(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT_MS, headers = {} } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    // Conserviamo gli header utili (rate-limit) sul risultato grezzo quando serve
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`risposta non-JSON da ${hostOf(url)} (HTTP ${res.status})`);
    }
    if (!res.ok) {
      const raw = json?.message || json?.error || `HTTP ${res.status}`;
      const msg = typeof raw === "string" ? raw : JSON.stringify(raw);
      const err = new Error(`${hostOf(url)}: ${msg}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return { json, headers: res.headers };
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`timeout ${timeout}ms su ${hostOf(url)}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Variante che ritorna solo il corpo JSON (quando non servono gli header). */
export async function getJson(url, opts = {}) {
  const { json } = await fetchJson(url, opts);
  return json;
}

/** Estrae l'host da una URL per messaggi d'errore puliti. */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "fonte";
  }
}

/** Mediana di un array di numeri (ignora valori non finiti). Null se vuoto. */
export function median(arr) {
  const nums = (arr || []).filter((x) => Number.isFinite(x));
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return +m.toFixed(3);
}
