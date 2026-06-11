// La lavagna dei mercati: quote mediane reali + voto di valore colorato +
// confronto probabilità implicita (dalle quote) vs stimata (dal modello).
// Se le quote mancano mostriamo solo le stime, senza inventare voti.

function voteClass(v) {
  if (v == null) return 'none';
  if (v >= 7) return 'g';
  if (v >= 5) return 'y';
  return 'r';
}

function Market({ m, best }) {
  return (
    <div className={`market ${best ? 'best' : ''}`}>
      {best && <span className="star" title="Miglior valore">★</span>}
      <div className="m-label">{m.label}</div>
      <div className="m-odd">
        {m.odd != null ? m.odd.toFixed(2) : <span className="na">quota n/d</span>}
      </div>

      <div>
        <span className={`vote ${voteClass(m.vote)}`}>
          {m.vote != null ? m.vote.toFixed(1) : '—'}
        </span>
      </div>

      <div className="probs">
        <div>
          implicita{' '}
          <b>{m.impliedPct != null ? `${m.impliedPct.toFixed(1)}%` : 'n/d'}</b>
          <div className="probbar impl">
            <span style={{ width: `${m.impliedPct ?? 0}%` }} />
          </div>
        </div>
        <div>
          stimata <b>{m.estimatedPct.toFixed(1)}%</b>
          <div className="probbar est">
            <span style={{ width: `${m.estimatedPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketsBoard({ engine, odds }) {
  return (
    <div className="card">
      {!engine.hasOdds && (
        <div className="notice" style={{ marginBottom: 12 }}>
          <span className="src">Quote non disponibili · {odds?.source || 'The Odds API'}</span>
          {odds?.error || 'Nessuna quota reale per questa partita.'} Mostriamo solo le
          probabilità STIMATE dal modello: senza quote reali non calcoliamo voti di valore.
        </div>
      )}

      <div className="markets">
        {engine.markets.map((m) => (
          <Market key={m.key} m={m} best={engine.best === m.key} />
        ))}
      </div>

      {/* Gol/NoGol: il modello Poisson la stima, ma non esiste quota -> nessun voto */}
      <div className="ggng">
        <span className="muted">Modello (nessuna quota):</span>
        {engine.ggNoGol.map((g) => (
          <span key={g.key}>
            {g.label} <b>{g.estimatedPct.toFixed(1)}%</b>
          </span>
        ))}
      </div>

      <div className="source">
        {engine.hasOdds
          ? `Quote: mediana di ${odds.bookmakers} bookmaker — tempo reale (The Odds API). Probabilità implicita = 1/quota normalizzata (margine rimosso).`
          : 'Probabilità stimate dal motore deterministico (forma reale + ranking di riferimento + Poisson sulle medie gol).'}
      </div>
    </div>
  );
}
