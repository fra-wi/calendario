// ——— Estetica LAVAGNA: gesso su ardesia verde, arancio segnale ———
// Stessa palette e font dell'artefatto originale.
export const T = {
  bg: "#101B14",
  panel: "#16241B",
  panelEdge: "#23362A",
  chalk: "#F0EDE2",
  chalkDim: "#9DAA9F",
  line: "#3D5C49",
  signal: "#FF5C39",
  win: "#5BC689",
  draw: "#D9B64A",
  loss: "#E0654F",
};

export const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{background:${T.bg}}
@keyframes chalkPulse{0%,100%{opacity:.35}50%{opacity:.75}}
@keyframes slideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}
.section-card{animation:slideIn .35s ease both}
input:focus,button:focus-visible{outline:2px solid ${T.signal};outline-offset:2px}
::placeholder{color:${T.chalkDim};opacity:.6}
`;

// Colore voto: verde ≥7, giallo ≥5, rosso sotto
export const voteColor = (v) => (v >= 7 ? T.win : v >= 5 ? T.draw : T.loss);
