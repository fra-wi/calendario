// ——— Props giocatori (deterministico, da API-Football) ———
// Medie REALI per partita (tiri, tiri in porta, falli, cartellini) → distribuzione
// di Poisson → probabilità della prop. Il valore si calcola SOLO se l'utente
// inserisce a mano la quota (l'API quote non copre le props). Nessun dato inventato.

import { poisson } from "./dixonColes.js";
import { valueVote } from "./value.js";

/** P(X > soglia) per un Poisson di media lambda, con soglia tipo 0.5/1.5/2.5… */
function pOver(lambda, lineHalf) {
  // soglia .5 → P(>=ceil) ; sommiamo la coda
  const kMin = Math.ceil(lineHalf);
  let cdfBelow = 0;
  for (let k = 0; k < kMin; k++) cdfBelow += poisson(k, lambda);
  return Math.max(0, Math.min(1, 1 - cdfBelow));
}

/** Per cartellino: P(almeno un giallo) ≈ 1 - e^-λ con λ = gialli/partita. */
function pAtLeastOne(rate) {
  return 1 - Math.exp(-Math.max(0, rate));
}

/**
 * Genera le props candidate per i giocatori chiave di una squadra.
 * @param {Array} players - output di apiFootball.getPlayersStats
 * @param {object} opts - { duelloMult } moltiplicatore qualitativo opzionale (default 1)
 * @returns {Array} props con probabilità del modello (e vuoto se medie assenti)
 */
export function buildProps(players, opts = {}) {
  const out = [];
  // scegli i giocatori con più minuti (più rilevanti per le props)
  const ranked = [...(players || [])]
    .filter((p) => p.appearances > 0 && p.minutes > 0)
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0))
    .slice(0, 4);

  for (const p of ranked) {
    const apps = p.appearances || 1;
    const shotsPG = p.shotsTotal / apps;
    const shotsOnPG = p.shotsOn / apps;
    const foulsPG = p.foulsCommitted / apps;
    const yellowPG = p.yellow / apps;

    const candidates = [];
    // proponi una prop solo se la media esiste ed è sensata
    if (shotsPG >= 0.8) {
      const line = nearestHalfLine(shotsPG);
      candidates.push({ market: `Tiri totali Over ${line}`, pModel: pOver(shotsPG, line), avg: round(shotsPG), stat: "tiri/partita" });
    }
    if (shotsOnPG >= 0.4) {
      const line = nearestHalfLine(shotsOnPG);
      candidates.push({ market: `Tiri in porta Over ${line}`, pModel: pOver(shotsOnPG, line), avg: round(shotsOnPG), stat: "tiri in porta/partita" });
    }
    if (foulsPG >= 0.8) {
      const line = nearestHalfLine(foulsPG);
      candidates.push({ market: `Falli commessi Over ${line}`, pModel: pOver(foulsPG, line), avg: round(foulsPG), stat: "falli/partita" });
    }
    if (yellowPG >= 0.12) {
      candidates.push({ market: `Ammonizione`, pModel: pAtLeastOne(yellowPG), avg: round(yellowPG), stat: "gialli/partita" });
    }

    const mult = opts.duelloMult || 1; // moltiplicatore duello (qualitativo, default neutro)
    for (const c of candidates) {
      out.push({
        player: p.name,
        pos: p.pos,
        market: c.market,
        pModel: round(Math.max(0, Math.min(1, c.pModel * mult))),
        avg: c.avg,
        stat: c.stat,
        source: "API-Football",
        // quota e voto restano null finché l'utente non inserisce la quota
        odds: null,
        vote: null,
      });
    }
  }
  return out;
}

/**
 * Calcola il value vote di una prop quando l'utente inserisce la quota a mano.
 * @returns {object} prop arricchita con pImplied, edge, vote
 */
export function votePropWithOdds(prop, odds) {
  if (!odds || !(odds > 1)) return { ...prop, odds: null, vote: null, pImplied: null };
  // prop a due esiti: implicita = (1/quota) senza altra gamba da normalizzare
  const v = valueVote("PROP", prop.pModel, { PROP: odds });
  // valueVote usa il de-vigging di gruppo; per le props (mercato isolato) usa 1/quota
  const pImplied = 1 / odds;
  const edge = prop.pModel - pImplied;
  const vote = Math.max(1, Math.min(10, 5.5 + 25 * edge));
  return {
    ...prop,
    odds,
    pImplied: round(pImplied),
    edge: round(edge),
    vote: +vote.toFixed(1),
  };
}

function nearestHalfLine(avg) {
  // linea .5 appena sotto la media (es. media 2.3 → linea 1.5, prop "over 1.5")
  return Math.max(0.5, Math.floor(avg) - 0.5 < 0.5 ? 0.5 : Math.floor(avg) - 0.5);
}
const round = (x) => (x == null ? null : +(+x).toFixed(3));
