// Piccolo wrapper sulle chiamate al backend. Il proxy di Vite gira /api -> :3001.

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const getConfig = () => getJSON('/api/config');
export const getTeams = () => getJSON('/api/teams');
export const getFixtures = () => getJSON('/api/fixtures');
export const getAnalysis = (a, b) =>
  getJSON(`/api/analysis?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
