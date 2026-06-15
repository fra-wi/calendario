// ——— Paniere selezioni + Registro & calibrazione ———
import { useState, useEffect } from "react";
import { T, voteColor } from "./theme.js";
import { Card, Label, Vote } from "./components.jsx";
import { api } from "./api.js";

// ——— Paniere: costruisci la schedina (quota a mano, persistente in localStorage) ———
export function Selezioni({ picks, onOdds, onTogglePlay, onDelete, onClear }) {
  const valStatus = (p) => {
    const cur = parseFloat(p.quotaAgg), orig = parseFloat(p.quotaOrig);
    if (!cur || !orig) return null;
    const diff = (cur - orig) / orig;
    if (diff >= -0.005) return { c: T.win, t: `↑ ${cur} (valore tenuto/cresciuto)` };
    if (diff >= -0.06) return { c: T.draw, t: `↓ ${cur} (calo lieve)` };
    return { c: T.loss, t: `↓ ${cur} (valore evaporato)` };
  };
  const giocate = picks.filter((p) => p.gioca);
  const combo = giocate.reduce((acc, p) => acc * (parseFloat(p.quotaAgg) || parseFloat(p.quotaOrig) || 1), 1);
  const votoMedio = giocate.length ? giocate.reduce((s, p) => s + (p.voto || 0), 0) / giocate.length : 0;
  const deboli = giocate.filter((p) => (p.voto || 0) < 6).length;

  let consiglio;
  if (!giocate.length) consiglio = "Spunta «gioca» sulle selezioni che vuoi valutare per la schedina.";
  else if (giocate.length === 1) consiglio = "Singola: la scelta più solida. Stake che puoi permetterti di perdere.";
  else if (giocate.length <= 3 && !deboli) consiglio = `Multipla corta da ${giocate.length}: accettabile se ogni voto è alto. Ogni evento aggiunto moltiplica il margine del bookmaker.`;
  else if (deboli) consiglio = `Attenzione: ${deboli} selezione/i sotto voto 6 abbassano il valore di tutta la schedina. Toglile o giocale a parte.`;
  else consiglio = `Multipla da ${giocate.length}: più eventi = molto più rischio. Meglio spezzarla in singole o coppie ad alto voto.`;

  return (
    <Card title="Paniere selezioni · costruisci la schedina" full>
      {!picks.length && (
        <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalkDim }}>
          Tocca il <b style={{ color: T.signal }}>+</b> sui mercati o sulle props per aggiungere qui le selezioni — anche da partite diverse. Poi inserisci la quota aggiornata del tuo bookmaker e scegli quali giocare.
        </div>
      )}
      {picks.map((p) => {
        const vs = valStatus(p);
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px dashed ${T.line}` }}>
            <Vote v={p.voto} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Barlow',sans-serif", fontWeight: 600, fontSize: 14, color: T.chalk, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.mercato} {p.quotaOrig ? <span style={{ color: T.chalkDim, fontWeight: 400 }}>(analisi @{p.quotaOrig})</span> : null}
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: T.chalkDim }}>{p.match}</div>
              {vs && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: vs.c, marginTop: 2 }}>{vs.t}</div>}
            </div>
            <input value={p.quotaAgg || ""} onChange={(e) => onOdds(p.id, e.target.value)} placeholder="quota agg." inputMode="decimal"
              style={{ width: 74, background: T.bg, border: `1px solid ${vs ? vs.c : T.panelEdge}`, borderRadius: 6, padding: "6px 8px", color: T.chalk, fontFamily: "'IBM Plex Mono',monospace", fontSize: 13 }} />
            <button onClick={() => onTogglePlay(p.id)} style={{ background: p.gioca ? T.win + "33" : "none", border: `1px solid ${p.gioca ? T.win : T.line}`, color: p.gioca ? T.win : T.chalkDim, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
              {p.gioca ? "gioca ✓" : "gioca"}
            </button>
            <button onClick={() => onDelete(p.id)} style={{ background: "none", border: "none", color: T.chalkDim, cursor: "pointer", fontSize: 16, padding: "0 2px", flexShrink: 0 }}>×</button>
          </div>
        );
      })}
      {picks.length > 0 && (
        <div style={{ marginTop: 14, padding: 14, background: T.bg, border: `1px solid ${T.panelEdge}`, borderRadius: 10 }}>
          <Label>La tua schedina</Label>
          {giocate.length > 0 && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 15, fontWeight: 600, color: T.chalk }}>{giocate.length} selezioni</span>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 24, fontWeight: 700, color: T.signal }}>quota {combo.toFixed(2)}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: voteColor(votoMedio) }}>voto medio {votoMedio.toFixed(1)}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: T.chalkDim }}>10€ → {(combo * 10).toFixed(0)}€</span>
            </div>
          )}
          <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalk, lineHeight: 1.5 }}>{consiglio}</div>
          <button onClick={onClear} style={{ marginTop: 10, background: "none", border: `1px solid ${T.line}`, color: T.chalkDim, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>svuota paniere</button>
        </div>
      )}
    </Card>
  );
}

// ——— Registro & calibrazione: bilancio, hit-rate per voto, Brier score ———
export function Registro() {
  const [led, setLed] = useState(null);
  const [cal, setCal] = useState(null);
  const [form, setForm] = useState({ match: "", market: "", odds: "", stake: "1", vote: "" });

  const reload = async () => {
    try { setLed(await api.ledger()); } catch {}
    try { setCal(await api.calibration()); } catch {}
  };
  useEffect(() => { reload(); }, []);

  const add = async () => {
    if (!form.market || !form.odds) return;
    await api.addPlay(form);
    setForm({ match: "", market: "", odds: "", stake: "1", vote: "" });
    reload();
  };
  const settle = async (id, result) => { await api.settlePlay(id, result); reload(); };

  const inp = { background: T.bg, border: `1px solid ${T.panelEdge}`, borderRadius: 6, padding: "6px 8px", color: T.chalk, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
  const s = led?.summary;
  return (
    <Card title="Registro & calibrazione · la verifica onesta" full>
      {/* Riepilogo bilancio */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
        <Metric k="Bilancio (unità)" v={s ? (s.profit > 0 ? "+" : "") + s.profit : "—"} c={s && s.profit > 0 ? T.win : s && s.profit < 0 ? T.loss : T.chalk} />
        <Metric k="ROI" v={s?.roi != null ? s.roi + "%" : "—"} c={s && s.roi > 0 ? T.win : T.loss} />
        <Metric k="Hit-rate" v={s?.hitRate != null ? s.hitRate + "%" : "—"} />
        <Metric k="Giocate regolate" v={s?.nSettled ?? 0} />
        <Metric k="Brier score" v={cal?.brier != null ? cal.brier : "—"} c={cal?.brier != null && cal.brier < (cal.brierBase ?? 0.25) ? T.win : T.chalk} />
      </div>

      {/* Hit-rate per fascia di voto */}
      {led?.byVoteBand && (
        <>
          <Label>Hit-rate per fascia di voto</Label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(led.byVoteBand).map(([band, b]) => (
              <div key={band} style={{ background: T.bg, border: `1px solid ${T.panelEdge}`, borderRadius: 8, padding: "8px 12px", minWidth: 90 }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: T.chalkDim }}>voto {band}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, fontWeight: 700, color: b.hitRate != null ? voteColor(b.hitRate / 10) : T.chalkDim }}>{b.hitRate != null ? b.hitRate + "%" : "—"}</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim }}>{b.n} giocate · {b.profit > 0 ? "+" : ""}{b.profit}u</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Curva di affidabilità del modello */}
      {cal?.reliability?.length > 0 && (
        <>
          <Label>Curva di affidabilità (modello dà X% → si avvera Y%)</Label>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
            {cal.reliability.map((r, i) => (
              <div key={i} style={{ background: T.bg, border: `1px solid ${T.panelEdge}`, borderRadius: 6, padding: "6px 8px", minWidth: 70, textAlign: "center" }} title={`${r.n} previsioni`}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim }}>{r.range}</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 16, fontWeight: 700, color: T.chalk }}>{(r.hitRate * 100).toFixed(0)}%</div>
              </div>
            ))}
          </div>
        </>
      )}
      {cal?.note && <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 12, color: T.chalkDim, marginBottom: 14 }}>{cal.note}</div>}

      {/* Aggiungi giocata */}
      <Label>Segna una giocata</Label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input style={{ ...inp, flex: 2, minWidth: 140 }} placeholder="partita" value={form.match} onChange={(e) => setForm({ ...form, match: e.target.value })} />
        <input style={{ ...inp, flex: 1, minWidth: 100 }} placeholder="mercato" value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} />
        <input style={{ ...inp, width: 70 }} placeholder="quota" value={form.odds} onChange={(e) => setForm({ ...form, odds: e.target.value })} />
        <input style={{ ...inp, width: 60 }} placeholder="stake" value={form.stake} onChange={(e) => setForm({ ...form, stake: e.target.value })} />
        <input style={{ ...inp, width: 60 }} placeholder="voto" value={form.vote} onChange={(e) => setForm({ ...form, vote: e.target.value })} />
        <button onClick={add} style={{ background: T.signal, color: "#1A130F", border: "none", borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 14 }}>+ segna</button>
      </div>

      {/* Elenco giocate */}
      {(led?.plays || []).slice().reverse().map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px dashed ${T.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontFamily: "'Barlow',sans-serif", fontSize: 13, color: T.chalk }}>{p.market}</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.chalkDim }}> · {p.match} @{p.odds} · {p.stake}u{p.vote ? ` · voto ${p.vote}` : ""}</span>
          </div>
          {p.result === "pending" ? (
            <>
              <button onClick={() => settle(p.id, "win")} style={pillBtn(T.win)}>vinta</button>
              <button onClick={() => settle(p.id, "loss")} style={pillBtn(T.loss)}>persa</button>
              <button onClick={() => settle(p.id, "void")} style={pillBtn(T.chalkDim)}>void</button>
            </>
          ) : (
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: p.result === "win" ? T.win : p.result === "loss" ? T.loss : T.chalkDim }}>{p.result}</span>
          )}
        </div>
      ))}
    </Card>
  );
}

function Metric({ k, v, c = T.chalk }) {
  return (
    <div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: T.chalkDim, letterSpacing: "0.1em", textTransform: "uppercase" }}>{k}</div>
      <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 26, color: c }}>{v}</div>
    </div>
  );
}
const pillBtn = (c) => ({ background: "none", border: `1px solid ${c}`, color: c, borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 });
