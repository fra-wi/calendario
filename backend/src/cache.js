// =====================================================================
// Cache in memoria con TTL (default 10 minuti).
// Serve a non martellare le API esterne e a rispettarne i rate limit.
// IMPORTANTE: vengono memorizzati SOLO i risultati positivi. Se il
// "producer" lancia un errore (fonte giù/timeout), l'eccezione si propaga
// e nulla viene messo in cache: al giro dopo si riprova davvero.
// =====================================================================

const store = new Map();
const DEFAULT_TTL = 10 * 60 * 1000; // 10 minuti in millisecondi

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key); // scaduto: lo rimuoviamo
    return null;
  }
  return entry.value;
}

export function cacheSet(key, value, ttl = DEFAULT_TTL) {
  store.set(key, { value, expires: Date.now() + ttl });
  return value;
}

// Ritorna il valore dalla cache, oppure esegue `producer` e lo memorizza.
// Se `producer` fallisce, l'errore si propaga (nessuna cache di errori).
export async function cached(key, producer, ttl = DEFAULT_TTL) {
  const hit = cacheGet(key);
  if (hit !== null) return hit;
  const value = await producer();
  return cacheSet(key, value, ttl);
}
