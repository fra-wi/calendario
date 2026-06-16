// ——— Client API verso il backend (porta 3001 via proxy Vite) ———
// Tutte le chiamate passano dal backend: le chiavi non toccano mai il browser.

async function getJson(url) {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({ error: "risposta non valida" }));
  if (!r.ok && j.error) throw new Error(j.error);
  return j;
}
async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ error: "risposta non valida" }));
  if (!r.ok && j.error) throw new Error(j.error);
  return j;
}

export const api = {
  health: () => getJson("/api/health"),
  fixtures: () => getJson("/api/fixtures"),
  match: (a, b, neutral = true) =>
    getJson(`/api/match?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&neutral=${neutral}`),
  players: (team, opponent) =>
    getJson(`/api/players?team=${encodeURIComponent(team)}&opponent=${encodeURIComponent(opponent || "")}`),
  context: (a, b) =>
    getJson(`/api/context?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  voteProp: (prop, odds) => postJson("/api/props/vote", { prop, odds }),
  note: (ctx) => postJson("/api/note", ctx),
  calibration: () => getJson("/api/calibration"),
  ledger: () => getJson("/api/ledger"),
  addPlay: (play) => postJson("/api/plays", play),
  settlePlay: (id, result) => postJson(`/api/plays/${id}/settle`, { result }),
};
