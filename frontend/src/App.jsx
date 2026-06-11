import React, { useEffect, useState } from 'react';
import { getConfig, getTeams, getFixtures, getAnalysis } from './api.js';
import TeamCard from './components/TeamCard.jsx';
import MarketsBoard from './components/MarketsBoard.jsx';
import GroupContext from './components/GroupContext.jsx';
import AINotes from './components/AINotes.jsx';

function fmtKick(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusPill({ on, label }) {
  return <span className={`pill ${on ? 'on' : 'off'}`}>{on ? '✓' : '✗'} {label}</span>;
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [teams, setTeams] = useState([]);
  const [fixtures, setFixtures] = useState(null);
  const [sel, setSel] = useState(null); // { a, b } (nomi passati al backend)
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualA, setManualA] = useState('');
  const [manualB, setManualB] = useState('');

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => setConfig({ ok: false }));
    getTeams()
      .then((d) => setTeams(d.teams || []))
      .catch(() => setTeams([]));
    getFixtures()
      .then(setFixtures)
      .catch((e) => setFixtures({ ok: false, source: 'ESPN', error: e.message }));
  }, []);

  async function loadMatch(a, b) {
    setSel({ a, b });
    setAnalysis(null);
    setLoading(true);
    try {
      const d = await getAnalysis(a, b);
      setAnalysis(d);
    } catch (e) {
      setAnalysis({ ok: false, error: e.message });
    } finally {
      setLoading(false);
    }
  }

  const upcoming = fixtures?.ok ? fixtures.fixtures.filter((f) => !f.completed) : [];

  return (
    <div className="app">
      {/* ---------------- Header ---------------- */}
      <header className="header">
        <div className="brand">
          <h1>
            LAVAGNA<span className="apos"> ’</span>26
          </h1>
          <span className="tag">analisi pre-match · Mondiali 2026</span>
        </div>
        <div className="subtitle">
          Voti di valore 1–10 sui mercati. I numeri arrivano solo dalle API: nessun dato
          inventato.
        </div>
        {config && (
          <div className="status-row">
            <StatusPill on={config.oddsConfigured} label="The Odds API (quote)" />
            <StatusPill on={config.footballDataEnabled} label="football-data (gironi)" />
            <StatusPill on={config.aiEnabled} label="note AI (opzionali)" />
          </div>
        )}
      </header>

      {/* ---------------- Selettore partita ---------------- */}
      <section className="section">
        <div className="section-title">Seleziona partita</div>
        <div className="card">
          {fixtures?.ok ? (
            upcoming.length ? (
              <div className="chips">
                {upcoming.slice(0, 30).map((f) => {
                  const active = sel && sel.a === f.homeEn && sel.b === f.awayEn;
                  return (
                    <button
                      key={f.id}
                      className={`chip ${active ? 'active' : ''}`}
                      onClick={() => loadMatch(f.homeEn, f.awayEn)}
                    >
                      {f.homeIt} <span className="vs">vs</span> {f.awayIt}
                      <span className="meta">
                        <span className="badge-espn">✓ ESPN</span>
                        {f.date ? ` · ${fmtKick(f.date)}` : ''}
                        {f.venue ? ` · ${f.venue}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="notice">
                <span className="src">ESPN</span>
                Nessuna partita in programma nei prossimi giorni. Usa la selezione manuale
                qui sotto.
              </div>
            )
          ) : (
            <div className="notice">
              <span className="src">Calendario non disponibile · {fixtures?.source || 'ESPN'}</span>
              {fixtures?.error || 'Caricamento…'} — puoi comunque scegliere la partita
              manualmente.
            </div>
          )}

          {/* selezione manuale (sempre disponibile) */}
          <div className="manual">
            <div className="field">
              <label>Squadra A</label>
              <input
                list="teamlist"
                value={manualA}
                onChange={(e) => setManualA(e.target.value)}
                placeholder="es. Argentina"
              />
            </div>
            <div className="field">
              <label>Squadra B</label>
              <input
                list="teamlist"
                value={manualB}
                onChange={(e) => setManualB(e.target.value)}
                placeholder="es. Francia"
              />
            </div>
            <button
              className="btn"
              disabled={!manualA.trim() || !manualB.trim()}
              onClick={() => loadMatch(manualA.trim(), manualB.trim())}
            >
              Analizza
            </button>
            <datalist id="teamlist">
              {teams.map((t) => (
                <option key={t.en} value={t.it} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      {/* ---------------- Analisi ---------------- */}
      {loading && (
        <div className="center spin">CARICAMENTO ANALISI…</div>
      )}

      {!loading && analysis && !analysis.ok && (
        <div className="notice">
          <span className="src">Errore analisi</span>
          {analysis.error}
        </div>
      )}

      {!loading && analysis?.ok && (
        <>
          <section className="section">
            <div className="section-title">
              {analysis.teamA.it} vs {analysis.teamB.it}
            </div>
            <div className="teams-grid">
              <TeamCard team={analysis.teamA} form={analysis.form.a} />
              <TeamCard team={analysis.teamB} form={analysis.form.b} />
            </div>
          </section>

          <section className="section">
            <div className="section-title">La lavagna · mercati</div>
            <MarketsBoard engine={analysis.engine} odds={analysis.odds} />
          </section>

          {analysis.standings?.ok && (
            <section className="section">
              <div className="section-title">Contesto girone</div>
              <GroupContext standings={analysis.standings} />
            </section>
          )}

          {analysis.ai && (
            <section className="section">
              <div className="section-title">Note qualitative AI · opzionali</div>
              <AINotes ai={analysis.ai} teamA={analysis.teamA} teamB={analysis.teamB} />
            </section>
          )}
        </>
      )}

      {!loading && !analysis && (
        <div className="center muted">
          Scegli una partita dal calendario o inseriscila manualmente per vedere l’analisi.
        </div>
      )}

      {/* ---------------- Footer ---------------- */}
      <footer className="footer">
        <div className="resp">Gioca responsabilmente — nessun modello garantisce vincite.</div>
        <div className="src-list">
          Fonti dati: ESPN (calendario/risultati) · TheSportsDB (forma) · The Odds API
          (quote mediane, tempo reale) · football-data.org (classifiche ufficiali)
          {config?.aiEnabled ? ' · Anthropic (note qualitative, mai numeri)' : ''}.
          <br />
          Motore voti deterministico: probabilità implicita dalle quote reali vs
          probabilità stimata dal modello (forma pesata + Poisson). Il ranking di
          riferimento è un parametro statico del modello, non un dato live.
        </div>
      </footer>
    </div>
  );
}
