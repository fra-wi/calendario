// ——— Componenti UI LAVAGNA '26 PRO ———
// Riusano il look dell'artefatto, ma i dati arrivano dal backend (motore + API).
import { useState } from "react";
import { T, voteColor } from "./theme.js";

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);

// ——— Atomi ———
export function Label({ children }) {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: T.chalkDim, marginBottom: 8 }}>
      {children}
    </div>
  );
}

export function Card({ title, children, full, badge }) {
  return (
    <div className="section-card" style={{ background: T.panel, border: `1px solid ${T.panelEdge}`, borderRadius: 10, padding: "16px 16px 18px", gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Label>{title}</Label>
        {badge}
      </div>
      {children}
    </div>
  );
}

// Badge fonte: verde = dato reale verificato, grigio = mancante
export function SourceBadge({ source }) {
  if (!source) return <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim }}>fonte n/d</span>;
  const ok = !/403|non trovata|n\/d|non richieste|non configurata/i.test(source);
  return (
    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, letterSpacing: "0.06em", color: ok ? T.win : T.draw }}>
      {ok ? "✓ " : "⚠ "}{source}
    </span>
  );
}

export function Skeleton({ lines = 3, status }) {
  return (
    <div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 12, borderRadius: 4, background: T.line, opacity: 0.35, marginBottom: 10, width: `${85 - i * 15}%`, animation: `chalkPulse 1.4s ease ${i * 0.15}s infinite` }} />
      ))}
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.chalkDim }}>{status}</div>
    </div>
  );
}

export function ErrorBox({ msg, onRetry }) {
  return (
    <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.loss }}>
      {msg}{" "}
      {onRetry && (
        <button onClick={onRetry} style={{ background: "none", border: `1px solid ${T.loss}`, color: T.loss, borderRadius: 6, padding: "2px 10px", marginLeft: 6, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>Riprova</button>
      )}
    </div>
  );
}

export function Stat({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${T.line}` }}>
      <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>{k}</span>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 600, color: T.chalk }}>{v ?? "—"}</span>
    </div>
  );
}

export function FormDots({ form }) {
  if (!Array.isArray(form) || !form.length) {
    return <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim, marginBottom: 8 }}>Risultati recenti non disponibili dalle fonti.</div>;
  }
  const color = (r) => (r === "V" ? T.win : r === "P" ? T.draw : T.loss);
  return (
    <div style={{ display: "flex", gap: 8, margin: "4px 0 12px", flexWrap: "wrap" }}>
      {form.map((m, i) => (
        <div key={i} style={{ textAlign: "center", minWidth: 44 }}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", display: "inline-grid", placeItems: "center", background: color(m.outcome) + "22", border: `1.5px solid ${color(m.outcome)}`, color: color(m.outcome), fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13 }} title={`${m.opponent} ${m.score}`}>{m.outcome}</span>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, marginTop: 3, maxWidth: 56, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.opponent}{m.date ? <><br />{m.date}</> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Vote({ v }) {
  const n = Number(v) || 0;
  const c = n ? voteColor(n) : T.chalkDim;
  return (
    <span style={{ display: "inline-grid", placeItems: "center", minWidth: 30, height: 30, borderRadius: 8, background: c + "22", border: `1.5px solid ${c}`, color: c, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 16, padding: "0 4px" }}>
      {n ? n.toFixed(n % 1 ? 1 : 0) : "—"}
    </span>
  );
}

export function AddBtn({ onClick, added }) {
  return (
    <button onClick={onClick} title={added ? "Già nel paniere" : "Aggiungi al paniere"} style={{ background: added ? T.signal : "none", border: `1px solid ${added ? T.signal : T.line}`, color: added ? "#1A130F" : T.chalkDim, borderRadius: 6, width: 24, height: 24, cursor: "pointer", fontSize: 14, lineHeight: 1, fontWeight: 700, flexShrink: 0 }}>
      {added ? "✓" : "+"}
    </button>
  );
}

// ——— GIOCATA CONSIGLIATA: esito più probabile in fascia quota 1.6–2.1 ———
export function RecommendedBet({ data, loading }) {
  if (loading) {
    return (
      <div style={{ background: T.panel, border: `1px solid ${T.panelEdge}`, borderRadius: 12, padding: "18px 20px", marginBottom: 14 }}>
        <Skeleton lines={1} status="calcolo la giocata consigliata…" />
      </div>
    );
  }
  if (!data?.engine?.ok) return null;
  const c = data.consigliata;
  return (
    <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.bg})`, border: `2px solid ${T.signal}`, borderRadius: 12, padding: "16px 20px", marginBottom: 14 }}>
      <Label>Giocata consigliata · esito più probabile (quota {c?.fascia || "1.6–2.1"})</Label>
      {c ? (
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: "clamp(30px,6vw,46px)", color: T.signal, lineHeight: 1 }}>
            {c.market}
          </div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 34, color: T.chalk }}>
            @{c.odds}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, letterSpacing: "0.1em" }}>PROBABILITÀ MODELLO</div>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 28, color: T.win }}>{pct(c.pModel)}</div>
            </div>
            <Vote v={c.vote} />
          </div>
        </div>
      ) : (
        <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 14, color: T.chalkDim }}>
          Nessun esito con quota nella fascia consigliata (1.5–2.5). Guarda la lavagna mercati qui sotto.
        </div>
      )}
      <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim, marginTop: 8 }}>
        È l'esito più probabile secondo il modello con quota "giocabile", non la quota più alta. Valuta sempre tu prima di puntare.
      </div>
    </div>
  );
}

// ——— Card squadra: forma + forza attacco/difesa stimata + statistiche + fonte ———
export function TeamCard({ name, form, strength, stats, source, loading }) {
  // forza in scala leggibile: exp(attack) ~ moltiplicatore gol; mostriamo indice 0-10
  const idx = (v) => (v == null ? null : Math.max(0, Math.min(10, 5 + v * 4)).toFixed(1));
  return (
    <Card title={`Squadra · ${name}`} badge={<SourceBadge source={source} />}>
      {loading ? <Skeleton lines={4} status="carico forma e forze stimate…" /> : (
        <>
          <FormDots form={form} />
          {strength ? (
            <>
              <div style={{ display: "flex", gap: 16, margin: "6px 0 10px" }}>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, letterSpacing: "0.1em" }}>ATTACCO</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 24, color: voteColor(+idx(strength.attack)) }}>{idx(strength.attack)}</div>
                </div>
                <div>
                  <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, letterSpacing: "0.1em" }}>DIFESA</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 24, color: voteColor(+idx(strength.defense)) }}>{idx(strength.defense)}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 11, color: T.chalkDim, lineHeight: 1.4 }}>
                Indici 0-10 stimati dal modello Dixon-Coles sui risultati storici (pesati per recency e qualità avversario).
              </div>
            </>
          ) : (
            <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim }}>Forze non stimabili: dati storici insufficienti.</div>
          )}
          {stats && (
            <div style={{ marginTop: 12 }}>
              <Stat k="Bilancio (ultime 10)" v={`${stats.w}V ${stats.d}N ${stats.l}P`} />
              <Stat k="Gol fatti / partita" v={stats.gfAvg} />
              <Stat k="Gol subiti / partita" v={stats.gaAvg} />
              <Stat k="Clean sheet (su 10)" v={stats.cleanSheets} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ——— Tassello mercato: quota + p_modello + p_implicita + voto ———
function MarketTile({ m, isBest, onAdd, isAdded, matchLabel }) {
  const key = `${matchLabel}|${m.market}`;
  return (
    <div style={{ background: T.bg, borderRadius: 8, padding: "8px 6px 10px", textAlign: "center", position: "relative", border: `1px solid ${isBest ? T.signal : T.panelEdge}` }}>
      {isBest && <span style={{ position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)", color: T.signal, fontSize: 13 }}>★</span>}
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: T.chalkDim, textTransform: "uppercase", whiteSpace: "nowrap" }}>{m.market}</div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 19, fontWeight: 700, color: T.chalk, margin: "2px 0 4px" }}>{m.odds ?? "—"}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, lineHeight: 1.5 }}>
        mod <b style={{ color: T.chalk }}>{pct(m.pModel)}</b><br />
        imp <b style={{ color: m.hasOdds ? T.chalk : T.chalkDim }}>{pct(m.pImplied)}</b>
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center", marginTop: 6 }}>
        <Vote v={m.vote} />
        {onAdd && m.hasOdds && <AddBtn added={isAdded?.(key)} onClick={() => onAdd({ key, mercato: m.market, voto: m.vote, quotaOrig: m.odds })} />}
      </div>
    </div>
  );
}

// ——— Lavagna mercati: griglia + verdetto gol attesi ———
export function MarketsCard({ data, loading, onAdd, isAdded, matchLabel }) {
  return (
    <Card title="Lavagna mercati · modello vs quote reali" full badge={<SourceBadge source={data?.sources?.odds} />}>
      {loading ? <Skeleton lines={4} status="motore Dixon-Coles + quote bookmaker…" /> : !data?.engine?.ok ? (
        <ErrorBox msg={`Nessuna stima: ${data?.engine?.reason || "dati insufficienti"}.`} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, alignItems: "start" }}>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {data.markets.map((m, i) => (
                <MarketTile key={i} m={m} isBest={data.best?.market === m.market} onAdd={onAdd} isAdded={isAdded} matchLabel={matchLabel} />
              ))}
            </div>
            {!data.hasRealOdds && (
              <div style={{ marginTop: 10, fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.draw }}>
                Quote reali non disponibili: i voti di valore compaiono solo con le quote. Qui vedi solo la probabilità del modello.
              </div>
            )}
            {data.best ? (
              <div style={{ marginTop: 12, fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalk }}>
                <span style={{ color: T.signal, fontWeight: 600 }}>★ {data.best.market}</span> — miglior valore: il modello dà {pct(data.best.pModel)} contro {pct(data.best.pImplied)} implicito (quota {data.best.odds}).
              </div>
            ) : data.hasRealOdds ? (
              <div style={{ marginTop: 12, fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>
                Nessun mercato di valore in questa partita — è un esito corretto, non tutte le partite ne hanno.
              </div>
            ) : null}
          </div>
          <div>
            <Label>Gol attesi (modello)</Label>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 34, color: T.chalk }}>
              {data.engine.lambda} <span style={{ color: T.signal }}>—</span> {data.engine.mu}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: T.chalkDim, marginTop: 2 }}>
              λ/μ Dixon-Coles{data.engine.neutral ? " · campo neutro" : ""} · ρ={data.engine.rho}
            </div>
            <Label>Risultati esatti più probabili</Label>
            {(data.exact || []).slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: T.chalk }}>{e.score}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: T.chalkDim }}>{pct(e.p)}</span>
              </div>
            ))}
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, marginTop: 8 }}>
              stima su {data.engine.fit?.nMatches} partite, {data.engine.fit?.nTeams} squadre
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ——— Props giocatori: quota inserita a mano → voto valore ———
export function PropsCard({ name, data, loading, onAdd, isAdded, matchLabel, onVote }) {
  return (
    <Card title={`Props giocatori · ${name}`} badge={<SourceBadge source={data?.source} />}>
      {loading ? <Skeleton lines={4} status="medie tiri/falli/cartellini reali…" /> : (
        <>
          {(data?.props || []).length === 0 && (
            <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim }}>
              {data?.note || "Nessuna prop con medie sufficienti dalle fonti."}
            </div>
          )}
          {(data?.props || []).map((p, i) => (
            <PropRow key={i} p={p} onAdd={onAdd} isAdded={isAdded} matchLabel={matchLabel} onVote={onVote} />
          ))}
        </>
      )}
    </Card>
  );
}

function PropRow({ p, onAdd, isAdded, matchLabel, onVote }) {
  const [odds, setOdds] = useState(p.odds || "");
  const [voted, setVoted] = useState(p);
  const key = `${matchLabel}|${p.player}|${p.market}`;
  const pct2 = (x) => (x == null ? "—" : `${(x * 100).toFixed(0)}%`);
  const submit = async (val) => {
    setOdds(val);
    const q = parseFloat(val);
    if (q > 1 && onVote) {
      try { setVoted(await onVote(p, q)); } catch { /* ignore */ }
    } else {
      setVoted({ ...p, vote: null, pImplied: null });
    }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.line}` }}>
      <Vote v={voted.vote} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 600, fontSize: 16, color: T.chalk }}>
          {p.player} <span style={{ color: T.chalkDim, fontWeight: 500, fontSize: 14 }}>· {p.market}</span>
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: T.chalkDim }}>
          {p.stat}: {p.avg} · modello {pct2(p.pModel)}{voted.pImplied != null ? ` · implicita ${pct2(voted.pImplied)}` : ""}
        </div>
      </div>
      <input value={odds} onChange={(e) => submit(e.target.value)} placeholder="quota" inputMode="decimal"
        style={{ width: 64, background: T.bg, border: `1px solid ${T.panelEdge}`, borderRadius: 6, padding: "6px 8px", color: T.chalk, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }} />
      {onAdd && <AddBtn added={isAdded?.(key)} onClick={() => onAdd({ key, mercato: `${p.player} — ${p.market}`, voto: voted.vote, quotaOrig: parseFloat(odds) || null })} />}
    </div>
  );
}

// ——— Contesto: infortuni, classifica girone, H2H, formazioni ———
export function ContextCard({ a, b, data, loading }) {
  return (
    <Card title="Contesto · infortuni · girone · H2H" full badge={<SourceBadge source={data?.source} />}>
      {loading ? <Skeleton lines={4} status="infortuni, classifica, precedenti…" /> : !data || data.note ? (
        <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim }}>{data?.note || "Contesto non disponibile."}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 18 }}>
          <div>
            <Label>Indisponibili {a}</Label>
            <p style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.loss }}>
              {(data.injuries?.a || []).map((x) => x.player).join(", ") || "Nessuno segnalato"}
            </p>
            <Label>Indisponibili {b}</Label>
            <p style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.loss }}>
              {(data.injuries?.b || []).map((x) => x.player).join(", ") || "Nessuno segnalato"}
            </p>
          </div>
          <div>
            <Label>Precedenti (H2H)</Label>
            {(data.h2h || []).slice(0, 5).map((f, i) => (
              <div key={i} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: T.chalkDim, padding: "2px 0" }}>
                {f.homeName} {f.gh ?? "-"}–{f.ga ?? "-"} {f.awayName}
              </div>
            ))}
            {(!data.h2h || !data.h2h.length) && <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>Nessun precedente trovato.</div>}
          </div>
          <div>
            <Label>Girone {data.standings?.group || ""}</Label>
            {(data.standings?.table || []).map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: T.chalk, padding: "2px 0" }}>
                <span>{r.rank}. {r.team}</span>
                <span style={{ color: T.chalkDim }}>{r.points}pt</span>
              </div>
            ))}
            {!data.standings && <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>Classifica non disponibile.</div>}
          </div>
        </div>
      )}
    </Card>
  );
}
