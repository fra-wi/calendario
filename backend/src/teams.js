// =====================================================================
// Anagrafica nazionali: mappa nomi Italiano -> Inglese + ranking di
// riferimento usato come PARAMETRO del modello voti.
//
// ⚠️ TRASPARENZA: i punti "fifa" qui sotto NON sono un dato live. Sono un
// ranking di riferimento approssimato, mantenuto a mano, usato solo come
// stima di forza iniziale per il motore deterministico (fasce avversari e
// baseline). I dati FATTUALI (risultati, quote, calendario) arrivano sempre
// e solo dalle API. Aggiorna questi valori a mano quando vuoi raffinarli.
//
// Formato: [nomeItaliano, nomeInglese, puntiRiferimento, ...alias]
// Gli alias coprono le varianti usate da ESPN / The Odds API / TheSportsDB.
// =====================================================================

const RAW = [
  // Top mondiale
  ['Argentina', 'Argentina', 1862],
  ['Spagna', 'Spain', 1855],
  ['Francia', 'France', 1852],
  ['Inghilterra', 'England', 1820],
  ['Brasile', 'Brazil', 1788],
  ['Portogallo', 'Portugal', 1778],
  ['Paesi Bassi', 'Netherlands', 1758, 'Olanda', 'Holland'],
  ['Belgio', 'Belgium', 1740],
  ['Italia', 'Italy', 1718],
  ['Germania', 'Germany', 1715],
  ['Croazia', 'Croatia', 1700],
  ['Marocco', 'Morocco', 1698],
  ['Colombia', 'Colombia', 1690],
  // Fascia alta
  ['Uruguay', 'Uruguay', 1678],
  ['Stati Uniti', 'USA', 1660, 'United States', 'United States of America'],
  ['Messico', 'Mexico', 1655],
  ['Svizzera', 'Switzerland', 1648],
  ['Senegal', 'Senegal', 1645],
  ['Giappone', 'Japan', 1640],
  ['Danimarca', 'Denmark', 1638],
  ['Iran', 'Iran', 1620, 'IR Iran'],
  ['Corea del Sud', 'South Korea', 1610, 'Korea Republic', 'Korea'],
  ['Australia', 'Australia', 1600],
  ['Ecuador', 'Ecuador', 1598],
  ['Austria', 'Austria', 1595],
  ['Ucraina', 'Ukraine', 1590],
  ['Svezia', 'Sweden', 1585],
  ['Serbia', 'Serbia', 1580],
  ['Turchia', 'Turkey', 1575, 'Türkiye', 'Turkiye'],
  ['Norvegia', 'Norway', 1568],
  ['Polonia', 'Poland', 1565],
  ['Egitto', 'Egypt', 1560],
  ['Nigeria', 'Nigeria', 1558],
  ['Ungheria', 'Hungary', 1556],
  ['Algeria', 'Algeria', 1555],
  ['Wales', 'Wales', 1550, 'Galles'],
  ['Cechia', 'Czechia', 1548, 'Repubblica Ceca', 'Czech Republic'],
  ['Perù', 'Peru', 1545],
  ['Scozia', 'Scotland', 1544],
  ['Grecia', 'Greece', 1542],
  ['Cile', 'Chile', 1540],
  // Fascia media
  ['Tunisia', 'Tunisia', 1535],
  ['Canada', 'Canada', 1530],
  ['Romania', 'Romania', 1528],
  ['Qatar', 'Qatar', 1525],
  ['Camerun', 'Cameroon', 1520],
  ['Slovenia', 'Slovenia', 1519],
  ['Ghana', 'Ghana', 1518],
  ['Costa d’Avorio', 'Ivory Coast', 1515, 'Cote d’Ivoire', "Cote d'Ivoire", 'Côte d’Ivoire'],
  ['Panama', 'Panama', 1514],
  ['Slovacchia', 'Slovakia', 1512],
  ['Costa Rica', 'Costa Rica', 1510],
  ['Saudita', 'Saudi Arabia', 1505, 'Arabia Saudita'],
  ['Albania', 'Albania', 1504],
  ['Jamaica', 'Jamaica', 1500, 'Giamaica'],
  ['Paraguay', 'Paraguay', 1500],
  ['Macedonia del Nord', 'North Macedonia', 1496],
  ['Mali', 'Mali', 1495],
  ['Venezuela', 'Venezuela', 1490],
  ['Sudafrica', 'South Africa', 1490, 'Sud Africa'],
  ['Islanda', 'Iceland', 1488],
  ['Burkina Faso', 'Burkina Faso', 1486],
  ['Uzbekistan', 'Uzbekistan', 1485],
  ['Iraq', 'Iraq', 1480],
  ['Honduras', 'Honduras', 1478],
  ['Capo Verde', 'Cape Verde', 1472, 'Cabo Verde'],
  ['Emirati Arabi Uniti', 'United Arab Emirates', 1470, 'UAE'],
  ['Nuova Zelanda', 'New Zealand', 1468],
  ['Giordania', 'Jordan', 1465],
  ['Bolivia', 'Bolivia', 1460],
  ['Curaçao', 'Curacao', 1390],
  ['Haiti', 'Haiti', 1380],
];

// Normalizza un nome: niente accenti, minuscolo, spazi compattati.
function norm(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove gli accenti combinanti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Costruisce le strutture dati una sola volta.
export const TEAMS = RAW.map(([it, en, fifa, ...aliases]) => ({ it, en, fifa, aliases }));

const BY_NORM = new Map();
for (const t of TEAMS) {
  for (const name of [t.it, t.en, ...t.aliases]) {
    BY_NORM.set(norm(name), t);
  }
}

// Trova la squadra a partire da un nome qualsiasi (it/en/alias). null se ignota.
export function resolveTeam(name) {
  if (!name) return null;
  return BY_NORM.get(norm(name)) || null;
}

// Nome inglese canonico (per le API in inglese). Se ignoto, ritorna l'input.
export function toEnglish(name) {
  const t = resolveTeam(name);
  return t ? t.en : name;
}

// Nome italiano per la UI. Se ignoto, ritorna l'input.
export function toItalian(name) {
  const t = resolveTeam(name);
  return t ? t.it : name;
}

// Due nomi si riferiscono alla stessa nazionale?
export function namesMatch(a, b) {
  const ra = resolveTeam(a);
  const rb = resolveTeam(b);
  if (ra && rb) return ra.en === rb.en;
  return norm(a) === norm(b);
}

// Soglie fasce (sui punti di riferimento). Vedi nota in testa al file.
export function tierOf(name) {
  const t = resolveTeam(name);
  if (!t) return 'media'; // avversario non in anagrafica: fascia neutra
  if (t.fifa >= 1690) return 'top';
  if (t.fifa >= 1540) return 'media';
  return 'debole';
}

// Peso forma per fascia avversario: vincere contro i forti vale di più.
export function tierWeight(tier) {
  return { top: 1.0, media: 0.6, debole: 0.3 }[tier] ?? 0.6;
}

// Forza normalizzata 0..1 dal ranking di riferimento (per la baseline modello).
export function fifaNorm(name) {
  const t = resolveTeam(name);
  if (!t) return 0.5; // ignota: forza media
  const MIN = 1450;
  const MAX = 1880;
  return Math.max(0, Math.min(1, (t.fifa - MIN) / (MAX - MIN)));
}
