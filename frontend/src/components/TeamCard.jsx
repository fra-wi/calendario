// Card squadra: pallini forma V/P/S (con avversario + data), medie gol,
// voto di forma pesata. Tutto verificato da TheSportsDB; se la fonte
// fallisce mostriamo un messaggio chiaro, mai dati finti.

const OUTCOME_LABEL = { V: 'Vittoria', P: 'Pareggio', S: 'Sconfitta' };

function shortDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-'); // YYYY-MM-DD
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
  return iso;
}

export default function TeamCard({ team, form }) {
  return (
    <div className="card">
      <div className="team-name">{team.it}</div>

      {form?.ok ? (
        <>
          <span className="verified">✓ verificati (TheSportsDB)</span>

          <div className="form-dots">
            {form.matches.map((m, i) => (
              <div
                className={`dot ${m.outcome}`}
                key={i}
                title={`${OUTCOME_LABEL[m.outcome]} ${m.scored}-${m.conceded} vs ${
                  m.opponentIt || m.opponent
                } · fascia ${m.opponentTier}`}
              >
                <div className="circle">{m.outcome}</div>
                <div className="opp">{m.opponentIt || m.opponent}</div>
                <div className="day">{shortDate(m.date)}</div>
              </div>
            ))}
          </div>

          <div className="goal-avgs">
            <span>
              <span className="lbl">Gol fatti </span>
              <b>{form.avgScored.toFixed(2)}</b>
            </span>
            <span>
              <span className="lbl">Gol subiti </span>
              <b>{form.avgConceded.toFixed(2)}</b>
            </span>
            <span>
              <span className="lbl">Partite </span>
              <b>{form.n}</b>
            </span>
          </div>

          <div className="form-score">
            <span className="muted" title="V=3, P=1, S=0 · pesati per fascia avversario (top 1.0 / media 0.6 / debole 0.3)">
              Forma pesata
            </span>
            <span className="num">{form.weightedForm.toFixed(2)}</span>
          </div>
        </>
      ) : (
        <div className="notice" style={{ marginTop: 12 }}>
          <span className="src">Forma non disponibile · {form?.source || 'TheSportsDB'}</span>
          {form?.error || 'Fonte non raggiungibile'}
        </div>
      )}
    </div>
  );
}
