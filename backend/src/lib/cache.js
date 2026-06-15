// ——— Cache in memoria con TTL ———
// Ogni endpoint API viene messo in cache 10 minuti (configurabile per voce).
// Serve a: (1) non bruciare crediti/rate-limit, (2) rispondere veloce.
// È volutamente semplice (Map in RAM): si svuota al riavvio del processo.

const store = new Map(); // chiave -> { value, expires }

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minuti

/** Legge dalla cache se la voce non è scaduta, altrimenti null. */
export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

/** Scrive in cache con TTL (default 10 min). */
export function cacheSet(key, value, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

/**
 * Wrapper comodo: ritorna il valore in cache, oppure esegue `producer()`,
 * lo mette in cache e lo ritorna. Gli errori NON vengono messi in cache.
 */
export async function cached(key, producer, ttlMs = DEFAULT_TTL_MS) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await producer();
  // non cachiamo null/undefined: lascia ritentare alla prossima richiesta
  if (value !== null && value !== undefined) cacheSet(key, value, ttlMs);
  return value;
}

/** Svuota tutta la cache (utile in test/debug). */
export function cacheClear() {
  store.clear();
}
