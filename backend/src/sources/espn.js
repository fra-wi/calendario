// ——— Fonte: ESPN hidden API (senza chiave) ———
// Calendario Mondiali 2026 e verifica incrociata delle partite in programma.

import { getJson } from "../lib/http.js";
import { cached } from "../lib/cache.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

/** Prossime partite (finestra ~30 giorni). Ordinate per data. */
export async function fetchFixtures() {
  return cached(
    "espn:fixtures",
    async () => {
      const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 86400000);
      const j = await getJson(
        `${BASE}/scoreboard?limit=80&dates=${fmt(now)}-${fmt(end)}`,
        { timeout: 6000 }
      );
      const evs = j.events || [];
      return evs
        .map((e) => {
          const comp = (e.competitions || [])[0] || {};
          const cs = comp.competitors || [];
          const home = cs.find((c) => c.homeAway === "home") || cs[0] || {};
          const away = cs.find((c) => c.homeAway === "away") || cs[1] || {};
          const d = new Date(e.date);
          return {
            a: home.team?.displayName || "?",
            b: away.team?.displayName || "?",
            iso: e.date,
            data: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
            stage: e.season?.slug || comp.notes?.[0]?.headline || "Mondiali 2026",
            venue: comp.venue?.fullName || null,
            status: comp.status?.type?.state || "pre",
          };
        })
        .filter((f) => f.a !== "?" && f.b !== "?")
        .sort((x, y) => new Date(x.iso) - new Date(y.iso))
        .slice(0, 16);
    },
    10 * 60 * 1000
  );
}
