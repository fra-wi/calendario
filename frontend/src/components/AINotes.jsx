// Note qualitative AI (opzionali): SOLO giudizi a parole, mai numeri.
// Renderizzate solo se il backend ha restituito note (chiave Anthropic attiva).

export default function AINotes({ ai, teamA, teamB }) {
  if (!ai) return null;
  return (
    <div className="card">
      <div className="ai-grid">
        {ai.formaA && (
          <div className="ai-note">
            <h4>Forma {teamA.it}</h4>
            <p>{ai.formaA}</p>
          </div>
        )}
        {ai.formaB && (
          <div className="ai-note">
            <h4>Forma {teamB.it}</h4>
            <p>{ai.formaB}</p>
          </div>
        )}
        {ai.tattica && (
          <div className="ai-note ai-full">
            <h4>Nota tattica</h4>
            <p>{ai.tattica}</p>
          </div>
        )}
        {ai.sintesi && (
          <div className="ai-note ai-full">
            <h4>Sintesi</h4>
            <p>{ai.sintesi}</p>
          </div>
        )}
      </div>
      <div className="source">
        Giudizi qualitativi (nessun numero) · {ai.source}. I numeri restano quelli
        verificati dalle API.
      </div>
    </div>
  );
}
