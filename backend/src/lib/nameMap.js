// ——— Mappa nomi nazionali: italiano → inglese ———
// Le API lavorano in inglese; l'utente scrive in italiano. ~60 voci.
// Esportiamo anche l'inverso (EN→IT) per le label a schermo.

export const NAME_MAP = {
  italia: "Italy", messico: "Mexico", sudafrica: "South Africa", spagna: "Spain",
  germania: "Germany", francia: "France", inghilterra: "England", olanda: "Netherlands",
  "paesi bassi": "Netherlands", portogallo: "Portugal", brasile: "Brazil", argentina: "Argentina",
  "stati uniti": "USA", usa: "USA", svizzera: "Switzerland", belgio: "Belgium", croazia: "Croatia",
  marocco: "Morocco", giappone: "Japan", "corea del sud": "South Korea", "arabia saudita": "Saudi Arabia",
  egitto: "Egypt", norvegia: "Norway", svezia: "Sweden", danimarca: "Denmark", polonia: "Poland",
  austria: "Austria", scozia: "Scotland", galles: "Wales", irlanda: "Ireland", turchia: "Turkey",
  grecia: "Greece", tunisia: "Tunisia", algeria: "Algeria", senegal: "Senegal", ghana: "Ghana",
  nigeria: "Nigeria", camerun: "Cameroon", colombia: "Colombia", uruguay: "Uruguay", cile: "Chile",
  peru: "Peru", "perù": "Peru", ecuador: "Ecuador", paraguay: "Paraguay", canada: "Canada",
  australia: "Australia", "nuova zelanda": "New Zealand", iran: "Iran", qatar: "Qatar",
  giordania: "Jordan", uzbekistan: "Uzbekistan", "costa rica": "Costa Rica", panama: "Panama",
  honduras: "Honduras", giamaica: "Jamaica", haiti: "Haiti", curacao: "Curacao",
  "capo verde": "Cape Verde", "costa d'avorio": "Ivory Coast", "repubblica ceca": "Czech Republic",
  serbia: "Serbia", ungheria: "Hungary", romania: "Romania", russia: "Russia", ucraina: "Ukraine",
  finlandia: "Finland", islanda: "Iceland", slovacchia: "Slovakia", slovenia: "Slovenia",
  bulgaria: "Bulgaria", "bosnia": "Bosnia and Herzegovina", albania: "Albania",
  "nuova caledonia": "New Caledonia", venezuela: "Venezuela", bolivia: "Bolivia",
  "emirati arabi uniti": "United Arab Emirates", iraq: "Iraq", oman: "Oman", bahrain: "Bahrain",
  kuwait: "Kuwait", "corea del nord": "North Korea", thailandia: "Thailand", "vietnam": "Vietnam",
  "indonesia": "Indonesia", india: "India", cina: "China PR", "mali": "Mali", "burkina faso": "Burkina Faso",
  "rd congo": "DR Congo", angola: "Angola", "guinea": "Guinea", "zambia": "Zambia", "kenya": "Kenya",
};

// Inverso EN(lowercase) → IT con la maiuscola "bella" già pronta.
const INVERSE = {};
for (const [it, en] of Object.entries(NAME_MAP)) {
  // Tiene la prima occorrenza (così "Netherlands" → "olanda" e non "paesi bassi")
  const key = en.toLowerCase();
  if (!INVERSE[key]) INVERSE[key] = it.charAt(0).toUpperCase() + it.slice(1);
}

/** Italiano → inglese. Se non trovato, restituisce l'input ripulito (passthrough). */
export function toEnglish(name) {
  if (!name) return "";
  const key = name.trim().toLowerCase();
  return NAME_MAP[key] || name.trim();
}

/** Inglese → italiano (best effort, per le label). */
export function toItalian(name) {
  if (!name) return "";
  return INVERSE[name.trim().toLowerCase()] || name.trim();
}
