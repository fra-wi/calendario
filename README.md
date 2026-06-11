# LAVAGNA '26 ⚽

Analisi **pre-match** dei Mondiali di calcio 2026 orientata alle scommesse, con
**voti di valore 1–10** sui mercati.

> **Regola fondamentale del progetto:** _nessun dato fattuale è generato da un
> LLM_. Risultati, quote, calendario e statistiche arrivano **solo** da API
> verificabili. L'AI (opzionale) produce **solo** giudizi qualitativi, mai numeri.

---

## Cosa fa

- Mostra le **prossime partite** dei Mondiali (calendario ESPN).
- Per ogni squadra: **ultime 5 partite** (esito, avversario, punteggio, data) e
  **medie gol** calcolate matematicamente (TheSportsDB).
- **Quote mediane reali** tra tutti i bookmaker per 1 / X / 2 / Over 2.5 /
  Under 2.5 (The Odds API).
- Un **motore voti deterministico** (NON AI) che, per ogni mercato, confronta la
  **probabilità implicita** (dalle quote) con la **probabilità stimata** (modello
  semplice sui dati reali) e calcola un voto di valore 1–10.
- (Opzionale) **classifica del girone** ufficiale (football-data.org).
- (Opzionale) **note qualitative AI** (Anthropic Claude) — solo parole, mai cifre.

---

## Architettura

```
calendario/
├── backend/     Node.js + Express (porta 3001) — chiama le API e nasconde le chiavi
│   ├── server.js
│   └── src/
│       ├── sources.js   le 4 fonti dati (ESPN, TheSportsDB, Odds API, football-data)
│       ├── engine.js    motore voti deterministico (probabilità + Poisson)
│       ├── teams.js     mappa nomi IT→EN + ranking di riferimento del modello
│       ├── ai.js        note qualitative opzionali (Claude)
│       ├── cache.js     cache in memoria (10 min)
│       └── http.js      fetch con timeout 8s
└── frontend/    Vite + React (porta 5173) — estetica "lavagna tattica"
    └── src/
        ├── App.jsx
        ├── theme.css
        └── components/  TeamCard, MarketsBoard, GroupContext, AINotes
```

---

## Requisiti

- **Node.js 18+** (serve la `fetch` nativa).

## Avvio rapido

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env        # poi inserisci le chiavi (vedi sotto)
npm run dev                 # avvia su http://localhost:3001
```

`backend/.env`:

```env
ODDS_API_KEY=7fba1f13a9f6f847222678e157f611ae   # The Odds API (necessaria per i voti)
FOOTBALL_DATA_KEY=                               # opzionale (classifiche gironi)
ANTHROPIC_API_KEY=                               # opzionale (note AI, a pagamento)
PORT=3001
```

> Solo `ODDS_API_KEY` è davvero necessaria per i voti di valore. Senza
> `FOOTBALL_DATA_KEY` la card "contesto girone" resta nascosta; senza
> `ANTHROPIC_API_KEY` l'app funziona **identica**, solo senza le note AI.

### 2) Frontend (in un secondo terminale)

```bash
cd frontend
npm install
npm run dev                 # avvia su http://localhost:5173 (proxy → :3001)
```

Apri **http://localhost:5173**.

---

## Come funziona il motore voti (trasparenza totale)

Per ogni mercato:

1. **Probabilità implicita** = `1 / quota mediana`, normalizzata togliendo il
   margine del bookmaker (ogni `1/q` diviso per la somma delle `1/q` del mercato).
2. **Probabilità stimata** = modello semplice sui **dati reali**:
   - differenza di **forma pesata** (V=3, P=1, S=0 sulle ultime 5, pesate
     1.0 / 0.6 / 0.3 per fascia avversario top / media / debole);
   - differenza **gol fatti/subiti** medi;
   - **costante pareggio** che si riduce al crescere del divario;
   - **modello di Poisson** sulle medie gol per Over/Under e Gol/NoGol.
3. **Voto** = `clamp(1, 10, 5.5 + 25 × (prob_stimata − prob_implicita))`.

L'app mostra **sempre entrambe le probabilità** accanto al voto. Il mercato
migliore è evidenziato con ★. Colori: **verde ≥7**, **giallo 5–6**, **rosso <5**.

> ⚠️ Il **ranking di riferimento** in `backend/src/teams.js` è un _parametro
> statico del modello_ mantenuto a mano (stima di forza iniziale e fasce
> avversari), **non** un dato live. I dati fattuali arrivano solo dalle API.

---

## Endpoint backend

| Endpoint | Descrizione | Fonte |
|---|---|---|
| `GET /api/fixtures` | prossime partite | ESPN |
| `GET /api/form/:team` | ultime 5 + medie gol | TheSportsDB |
| `GET /api/odds?a=&b=` | quote mediane + n. bookmaker | The Odds API |
| `GET /api/standings/:team` | classifica girone (null se chiave assente) | football-data.org |
| `GET /api/analysis?a=&b=` | analisi completa aggregata + voti (+ note AI) | tutte |
| `GET /api/teams` | anagrafica nazionali (per il selettore manuale) | — |
| `GET /api/config` | quali funzioni opzionali sono attive | — |

Test del solo motore voti (senza rete): `cd backend && npm run test:engine`.

---

## Gestione errori

Ogni `fetch` ha **timeout 8s** e **cache 10 min**. Se una fonte è giù, l'endpoint
risponde con `{ "ok": false, "error": "...", "source": "..." }` e la UI mostra un
**messaggio chiaro** indicando la fonte: **mai** dati inventati o placeholder finti.
Il motore voti resta deterministico e funziona anche con dati parziali (senza
quote reali mostra solo le stime del modello, senza voti).

---

## AI opzionale

Se `ANTHROPIC_API_KEY` è presente, viene fatta **una** chiamata a
`claude-sonnet-4-6` per partita. Riceve i dati **già verificati** e restituisce
**solo** giudizi qualitativi (forma, nota tattica, sintesi). Mai numeri. L'API
Anthropic è a pagamento: per questo la funzione è opzionale e il motore voti
**non** ne dipende.

---

## Note

- `backend/.env` non è versionato (vedi `.gitignore`): inserisci tu le chiavi.
- Gioca responsabilmente — **nessun modello garantisce vincite**.
