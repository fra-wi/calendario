// Contesto girone: classifica ufficiale da football-data.org (opzionale).
// Renderizzata solo se la fonte ha risposto con dati validi.

export default function GroupContext({ standings }) {
  if (!standings?.ok) return null;
  return (
    <div className="card">
      <table className="standings">
        <thead>
          <tr>
            <th>#</th>
            <th style={{ textAlign: 'left' }}>Squadra</th>
            <th>G</th>
            <th>V</th>
            <th>N</th>
            <th>P</th>
            <th>GF</th>
            <th>GS</th>
            <th>DR</th>
            <th>Pt</th>
          </tr>
        </thead>
        <tbody>
          {standings.table.map((r) => (
            <tr key={r.position} className={r.highlight ? 'hl' : ''}>
              <td>{r.position}</td>
              <td className="team">{r.teamIt || r.team}</td>
              <td>{r.played}</td>
              <td>{r.won}</td>
              <td>{r.draw}</td>
              <td>{r.lost}</td>
              <td>{r.goalsFor}</td>
              <td>{r.goalsAgainst}</td>
              <td>{r.goalDifference}</td>
              <td className="pts">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="source">
        Girone {standings.group} · fonte: football-data.org (classifica ufficiale)
      </div>
    </div>
  );
}
