import { useState, useEffect, useRef } from "react";
import { T, FONT_CSS } from "./theme.js";
import { api } from "./api.js";
import { TeamCard, MarketsCard, PropsCard, ContextCard } from "./components.jsx";
import { Selezioni, Registro } from "./panier.jsx";

export default function App() {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [fixtures, setFixtures] = useState(null);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [health, setHealth] = useState(null);

  // stati delle sezioni
  const [match, setMatch] = useState({ loading: false, data: null, error: null });
  const [playersA, setPlayersA] = useState({ loading: false, data: null });
  const [playersB, setPlayersB] = useState({ loading: false, data: null });
  const [context, setContext] = useState({ loading: false, data: null });
  const runId = useRef(0);

  // ——— paniere selezioni: persistente in localStorage ———
  const [picks, setPicks] = useState(() => {
    try { return JSON.parse(localStorage.getItem("lavagna_picks") || "[]"); } catch { return []; }
  });
  const savePicks = (next) => { setPicks(next); try { localStorage.setItem("lavagna_picks", JSON.stringify(next)); } catch {} };
  const matchLabel = () => `${teamA || "?"} – ${teamB || "?"}`;
  const isAdded = (key) => picks.some((p) => p.key === key);
  const addPick = (pick) => {
    if (picks.some((p) => p.key === pick.key)) { savePicks(picks.filter((p) => p.key !== pick.key)); return; }
    savePicks([{ id: Date.now() + "" + Math.floor(Math.random() * 999), match: matchLabel(), quotaAgg: "", gioca: false, ...pick }, ...picks]);
  };
  const setPickOdds = (id, q) => savePicks(picks.map((p) => (p.id === id ? { ...p, quotaAgg: q } : p)));
  const togglePlay = (id) => savePicks(picks.map((p) => (p.id === id ? { ...p, gioca: !p.gioca } : p)));
  const deletePick = (id) => savePicks(picks.filter((p) => p.id !== id));
  const clearPicks = () => savePicks([]);

  useEffect(() => { api.health().then(setHealth).catch(() => {}); }, []);

  async function analyze(a = teamA, b = teamB) {
    if (!a.trim() || !b.trim()) return;
    setTeamA(a); setTeamB(b);
    setStarted(true);
    const id = ++runId.current;
    setMatch({ loading: true, data: null, error: null });
    setPlayersA({ loading: true, data: null });
    setPlayersB({ loading: true, data: null });
    setContext({ loading: true, data: null });

    // analisi principale (motore + quote)
    api.match(a, b).then((d) => { if (runId.current === id) setMatch({ loading: false, data: d, error: null }); })
      .catch((e) => { if (runId.current === id) setMatch({ loading: false, data: null, error: e.message }); });
    // props delle due squadre
    api.players(a, b).then((d) => { if (runId.current === id) setPlayersA({ loading: false, data: d }); }).catch(() => runId.current === id && setPlayersA({ loading: false, data: null }));
    api.players(b, a).then((d) => { if (runId.current === id) setPlayersB({ loading: false, data: d }); }).catch(() => runId.current === id && setPlayersB({ loading: false, data: null }));
    // contesto
    api.context(a, b).then((d) => { if (runId.current === id) setContext({ loading: false, data: d }); }).catch(() => runId.current === id && setContext({ loading: false, data: null }));
  }

  async function loadFixtures() {
    setFixturesLoading(true);
    try { const j = await api.fixtures(); setFixtures(j.fixtures || []); }
    catch { setFixtures([]); }
    setFixturesLoading(false);
  }

  const inputStyle = { flex: 1, minWidth: 120, background: T.panel, border: `1px solid ${T.panelEdge}`, borderRadius: 8, padding: "12px 14px", color: T.chalk, fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 600 };
  const m = match.data;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "20px 14px 60px" }}>
      <style>{FONT_CSS}</style>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* Header */}
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 22, borderBottom: `2px solid ${T.line}`, paddingBottom: 14 }}>
          <h1 style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 34, color: T.chalk }}>
            LAVAGNA <span style={{ color: T.signal }}>'26</span> <span style={{ fontSize: 16, color: T.chalkDim, letterSpacing: "0.15em" }}>PRO</span>
          </h1>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.chalkDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Mondiali 2026 · motore Dixon-Coles
          </span>
        </header>

        {/* Stato fonti */}
        {health && (
          <div style={{ marginBottom: 14, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.chalkDim, letterSpacing: "0.05em" }}>
            FONTI: <span style={{ color: health.keys.odds ? T.win : T.draw }}>The Odds API {health.keys.odds ? "✓" : "—"}</span>
            {" · "}<span style={{ color: health.keys.footballData ? T.win : T.draw }}>football-data {health.keys.footballData ? "✓" : "—"}</span>
            {" · "}<span style={{ color: health.keys.apiFootball ? T.win : T.draw }}>API-Football {health.keys.apiFootball ? "✓" : "—"}</span>
            {" · "}<span style={{ color: health.keys.anthropic ? T.win : T.chalkDim }}>note LLM {health.keys.anthropic ? "✓" : "off"}</span>
            {health.apiFootballRateRemaining != null && <span style={{ color: T.chalkDim }}> · richieste API-Football rimaste: {health.apiFootballRateRemaining}</span>}
          </div>
        )}

        {/* Selettore partita */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input style={inputStyle} placeholder="Squadra A (es. Italia)" value={teamA} onChange={(e) => setTeamA(e.target.value)} />
          <div style={{ alignSelf: "center", fontFamily: "'Barlow Condensed',sans-serif", color: T.chalkDim, fontSize: 18, fontWeight: 600 }}>VS</div>
          <input style={inputStyle} placeholder="Squadra B (es. Brasile)" value={teamB} onChange={(e) => setTeamB(e.target.value)} />
          <button onClick={() => analyze()} style={{ background: T.signal, color: "#1A130F", border: "none", borderRadius: 8, padding: "12px 26px", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 19, cursor: "pointer", letterSpacing: "0.04em" }}>ANALIZZA</button>
        </div>

        {/* Calendario */}
        <div style={{ marginBottom: 24 }}>
          {!fixtures && (
            <button onClick={loadFixtures} disabled={fixturesLoading} style={{ background: "none", border: `1px dashed ${T.line}`, color: T.chalkDim, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
              {fixturesLoading ? "carico il calendario…" : "↳ carica prossime partite del Mondiale"}
            </button>
          )}
          {fixtures && fixtures.length > 0 && (
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.win, letterSpacing: "0.08em", marginBottom: 6 }}>✓ CALENDARIO ESPN</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {fixtures.map((f, i) => (
                  <button key={i} onClick={() => analyze(f.a, f.b)} style={{ background: T.panel, border: `1px solid ${T.panelEdge}`, color: T.chalk, borderRadius: 20, padding: "7px 14px", cursor: "pointer", fontFamily: "'Barlow',sans-serif", fontSize: 13 }}>
                    <b>{f.a}</b> – <b>{f.b}</b> <span style={{ color: T.chalkDim }}>· {f.data}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {fixtures && fixtures.length === 0 && (
            <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>Calendario non disponibile (host non in allowlist o nessuna partita) — inserisci le squadre a mano.</span>
          )}
        </div>

        {/* Scoreboard */}
        {started && (
          <div style={{ textAlign: "center", margin: "10px 0 24px", padding: "18px 10px", border: `1px solid ${T.panelEdge}`, borderRadius: 12, background: `repeating-linear-gradient(0deg, ${T.panel}, ${T.panel} 3px, ${T.bg} 3px, ${T.bg} 6px)` }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "clamp(28px, 7vw, 52px)", color: T.chalk, letterSpacing: "0.02em" }}>
              {teamA.toUpperCase()} <span style={{ color: T.signal }}>—</span> {teamB.toUpperCase()}
            </div>
          </div>
        )}

        {/* Sezioni */}
        {started && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
            <TeamCard name={teamA} loading={match.loading} form={m?.form?.a} strength={m?.engine?.strengthA} source={m?.sources?.strengthA} />
            <TeamCard name={teamB} loading={match.loading} form={m?.form?.b} strength={m?.engine?.strengthB} source={m?.sources?.strengthB} />
            <MarketsCard data={m} loading={match.loading} onAdd={addPick} isAdded={isAdded} matchLabel={matchLabel()} />
            <PropsCard name={teamA} data={playersA.data} loading={playersA.loading} onAdd={addPick} isAdded={isAdded} matchLabel={matchLabel()} onVote={api.voteProp} />
            <PropsCard name={teamB} data={playersB.data} loading={playersB.loading} onAdd={addPick} isAdded={isAdded} matchLabel={matchLabel()} onVote={api.voteProp} />
            <ContextCard a={teamA} b={teamB} data={context.data} loading={context.loading} />
            <Selezioni picks={picks} onOdds={setPickOdds} onTogglePlay={togglePlay} onDelete={deletePick} onClear={clearPicks} />
            <Registro />
          </div>
        )}

        {!started && (
          <>
            <p style={{ fontFamily: "'Barlow',sans-serif", fontSize: 14, color: T.chalkDim, lineHeight: 1.6, maxWidth: 600 }}>
              Inserisci due nazionali (o carica il calendario) e premi <b style={{ color: T.signal }}>Analizza</b>.
              Il backend raccoglie quote reali e risultati storici, il <b>motore Dixon-Coles</b> stima le forze e
              tutte le probabilità, e confronta ogni mercato con la quota per dare un <b>voto di valore</b>.
              I numeri non vengono mai da un'AI: se una fonte manca, il campo resta vuoto.
            </p>
            {picks.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <Selezioni picks={picks} onOdds={setPickOdds} onTogglePlay={togglePlay} onDelete={deletePick} onClear={clearPicks} />
              </div>
            )}
            <div style={{ marginTop: 20 }}><Registro /></div>
          </>
        )}

        {/* Footer gioco responsabile */}
        <footer style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${T.line}`, fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim, lineHeight: 1.6 }}>
          <p>
            <b style={{ color: T.chalk }}>I voti indicano valore atteso, non vincite.</b> Una giocata di valore perde comunque spesso:
            il valore si misura sul lungo periodo, sulla singola partita domina il caso. «Nessun mercato di valore» è un risultato corretto.
            Nessuna previsione è una promessa di vincita.
          </p>
          <p style={{ marginTop: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            18+ · Gioca responsabilmente · Il gioco può causare dipendenza · Verifica sempre la quota sul tuo bookmaker prima di puntare
          </p>
        </footer>
      </div>
    </div>
  );
}
