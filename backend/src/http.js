// =====================================================================
// Wrapper su fetch con timeout (default 8 secondi).
// Se una API esterna è lenta o irraggiungibile non blocchiamo la richiesta:
// scatta l'abort e lanciamo un errore chiaro (gestito a monte dalle route).
// =====================================================================

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url);
  }
}

export async function fetchJSON(url, { timeout = 8000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} da ${hostOf(url)}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout (${timeout} ms) da ${hostOf(url)}`);
    }
    // Errori di rete / DNS / JSON malformato
    throw new Error(`Errore di rete da ${hostOf(url)}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}
