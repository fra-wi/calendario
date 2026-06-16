# LAVAGNA '26 PRO

App web di **analisi pre-match dei Mondiali 2026** orientata alle scommesse di valore.
Evoluzione dell'artefatto React `lavagna26.jsx`: stessa estetica (lavagna tattica
verde ardesia, gesso, arancio segnale; font Barlow Condensed + IBM Plex Mono), ma con
**backend reale** (niente sandbox/CORS) e un **motore predittivo serio** (Dixon-Coles).

## Principio cardine

> **Nessun dato fattuale è generato da un LLM.**
> Risultati, quote, formazioni, statistiche giocatori e infortuni vengono **solo da API**.
> L'LLM (opzionale) produce solo testo qualitativo (note tattiche), **mai numeri**.
> Ogni dato mostra la sua fonte. Se una fonte manca: **campo vuoto, mai inventato**.

## Architettura

```
backend/   Node.js + Express (porta 3001)   → centralizza le API, nasconde le chiavi
  src/sources/   The Odds API · API-Football · TheSportsDB · ESPN
  src/engine/    Dixon-Coles → matrice punteggi → mercati → value vote · props · calibrazione
  src/llm/       nota tattica opzionale (solo testo)
frontend/  Vite + React (porta 5173)          → riusa look e componenti, proxy → backend
```

- **Cache in memoria 10 min** per endpoint, **timeout 8s** e gestione errori su ogni fetch:
  se un'API è giù o ha finito i crediti il server **non va in crash**, risponde con l'errore
  e il frontend mostra "dato non disponibile".

## Il motore predittivo (il cuore)

Ispirato a Tuyls, Hassabis et al., *"Game Plan: What AI can do for Football…"*, JAIR 71 (2021),
[DOI 10.1613/jair.1.12505](https://doi.org/10.1613/jair.1.12505). Implementa le parti trasferibili
senza dati di tracking, con il modello **Dixon-Coles** (estensione del Poisson, standard accademico
per le quote calcio):

- **Forza d'attacco e difesa** di ogni nazionale stimata in massima verosimiglianza dai risultati
  storici, in **stima congiunta** (la forza è relativa agli avversari affrontati → correzione qualità avversario);
- **decadimento temporale** (le partite recenti pesano di più, half-life ~9 mesi);
- **correzione Dixon-Coles** τ per i punteggi bassi (0-0, 1-0, 0-1, 1-1);
- **regolarizzazione L2** per non sovrastimare squadre con pochi dati.

Dalla **matrice dei punteggi esatti** ricava le probabilità di **tutti i mercati**: 1/X/2, doppia chance,
Over/Under (ogni linea), GG/NoGol, risultato esatto, multigol.

**Value vote 1-10**: confronta la probabilità del modello con quella implicita nelle quote reali
*depurata dal margine* (de-vigging: normalizza le 1/quota). `voto = clamp(1,10, 5.5 + k·(p_modello − p_implicita))`.
La UI mostra **sempre** `p_modello%`, `p_implicita%` e la quota accanto al voto, con ★ sul miglior valore.

**Props giocatori** (da API-Football, non da ricerca web): medie reali di tiri, tiri in porta, falli,
cartellini, minuti → distribuzione di Poisson → probabilità della prop; il valore si calcola quando
inserisci a mano la quota.

**Calibrazione** (la verifica onesta): ogni previsione è loggata e, a risultato noto, si calcolano
**Brier score** e **curva di affidabilità** (quanto spesso si avvera ciò a cui il modello dà X%).

## Installazione

Servono **Node.js 18+** (testato su Node 22).

### 1. Backend

```bash
cd backend
cp .env.example .env     # poi inserisci le tue chiavi in .env
npm install
npm run dev              # http://localhost:3001  (node --watch)
```

`.env` del backend:

```
ODDS_API_KEY=...         # The Odds API (https://the-odds-api.com)
API_FOOTBALL_KEY=...     # API-Football (endpoint diretto api-sports.io, header x-apisports-key)
ANTHROPIC_API_KEY=       # OPZIONALE, solo per le note testuali
PORT=3001
```

> Il file `.env` **non** viene committato (è in `.gitignore`). Le chiavi restano solo lato server.

### 2. Frontend

In un secondo terminale:

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Il frontend fa da **proxy** verso il backend (`/api/* → :3001`): apri solo `http://localhost:5173`.

## Fonti dati

| Fonte | Cosa fornisce | Chiave |
|---|---|---|
| **The Odds API** | quote reali, **mediana tra bookmaker**; 1X2+O/U (tutte le linee) + GG/NoGol + doppia chance | sì |
| **API-Football** (`v3.football.api-sports.io`) | risultati storici (per il motore), formazioni, infortuni, classifiche gironi, H2H, stat giocatori | sì |
| **TheSportsDB** | fallback forma/medie gol | no |
| **ESPN** | calendario Mondiali | no |

Mappa nomi nazionali **italiano→inglese** (~80 voci) per interrogare le API.

## API del backend

| Endpoint | Descrizione |
|---|---|
| `GET /api/health` | stato chiavi + rate-limit API-Football |
| `GET /api/fixtures` | calendario (ESPN) |
| `GET /api/match?a=&b=` | **analisi completa**: forze, gol attesi, mercati con voto, risultati esatti, fonti |
| `GET /api/odds?a=&b=` | sole quote reali (mediana bookmaker) |
| `GET /api/players?team=&opponent=` | giocatori chiave + props con probabilità modello |
| `POST /api/props/vote` | voto valore di una prop data la quota inserita a mano |
| `GET /api/context?a=&b=` | infortuni, classifica girone, H2H, formazioni |
| `POST /api/note` | nota tattica qualitativa (LLM opzionale, **solo testo**) |
| `GET /api/calibration` · `POST /api/predictions/:id/settle` | Brier score + curva di affidabilità |
| `GET /api/ledger` · `POST /api/plays` · `POST /api/plays/:id/settle` | registro giocate, bilancio in unità, hit-rate per voto |

## Note sull'ambiente di esecuzione

Se esegui in un ambiente con **allowlist di rete** (es. Claude Code on the web), gli host
`api.the-odds-api.com`, `v3.football.api-sports.io`, ESPN e TheSportsDB vanno aggiunti alle
impostazioni di egress, altrimenti le chiamate tornano `403` e l'app mostra correttamente
"dato non disponibile" (senza crash). In locale non c'è questa restrizione.

## Onestà e gioco responsabile

I voti indicano **valore atteso, non vincite**: una giocata di valore perde comunque spesso.
"Nessun mercato di valore in questa partita" è un output corretto. **18+**, gioca responsabilmente,
il gioco può causare dipendenza. Nessuna promessa di vincita, da nessuna parte.
