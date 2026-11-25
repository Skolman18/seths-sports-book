# Seth's Sports Book — standalone app

A standalone twin of the hosted "my-big-board-ranker" app: a 2027 NFL Draft
consensus big board ranker plus a College Football Top 25 builder. Built with
TypeScript + React + Vite, dependency-light (React only, no UI framework, no
backend).

> **This copy never talks to the Google Sheet.** The live app's Submit writes
> Seth's ranks into the Sheet as Source 11. That write is intentionally **not**
> replicated here — there are no credentials, tokens, or secrets anywhere in
> this repo, and there never should be. In this copy, Submit downloads your
> ranks as CSV + JSON, and the README below explains how to paste them into the
> Sheet as Source 11 by hand.

## Run it

```bash
npm install
npm run dev      # local dev server (default http://localhost:5173)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```

Requires Node 18+.

## What's in here

```
.
├── README.md
├── index.html
├── package.json / tsconfig.json / vite.config.ts
├── data/
│   ├── players.json   # 355 players (extracted Nov 25, 2026 — DO NOT EDIT by hand)
│   ├── sources.json   # 16 consensus sources
│   └── notes.md       # extraction notes and quirks
└── src/
    ├── main.tsx / App.tsx / styles.css
    ├── data.ts        # player/source types + bundled data, sorted by consensusAvg
    ├── fbs.ts         # static ESPN spine: 138 FBS team ids, team->conference,
    │                  # school->ESPN team id (for draft-board logos)
    ├── Logo.tsx       # logo chip with initials-badge fallback
    ├── DraftBoard.tsx # Tab 1 — NFL Draft Board ranker
    └── Top25.tsx      # Tab 2 — College Football Top 25 builder
```

## Data

### `data/players.json` — 355 players, extracted Nov 25, 2026 from the Google Sheet "2027 NFL Draft - Consensus Big Board"

Each player: `name`, `school`, `position`, `consensusRank`, `consensusAvg`,
`numSources`, `best`, `worst`, `sources` (keyed `"Source N"`, blank ranks omitted).

Quirks that matter (full detail in `data/notes.md`):

- **Sort by `consensusAvg`, not by rank number.** Tied ranks mean only 306
  unique rank values across 344 ranked players (Sheets `RANK()` skips numbers).
- **11 unranked placeholder rows** have `consensusRank: null` and
  `consensusAvg: null` (mostly K/P depth plus Malachi Toney and Keelon Russell).
- The `Info` scouting-notes column was **not** extracted.
- "My Rank" (column T) was entirely blank at extraction time — Seth had not
  ranked anyone yet. The My Board tab is a blank worksheet; nothing to replicate
  beyond its structure (summarized in `data/notes.md`).

### `data/sources.json` — 16 sources, in sheet order

Source 7 is Todd McShay (partial — only 20 players, full top 50 not yet
published as of Nov 15, 2026). Source 8 is Mike Renner, CBS Top 150. Source 10
is an unnamed 1–300 big board, author unknown — ask Seth who it is. Source 11
is Seth's Board (82 players, submitted Nov 8, 2026).

### Top 25 data — fetched at runtime, not bundled

There is **no** College Football Top 25 tab in the Sheet, so there was nothing
to extract. Tab 2 fetches everything live from public ESPN endpoints, no API key:

- **AP Top 25 + Receiving Votes:**
  `https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings`
  — the `type: "ap"` entry, `ranks[25]` plus `others` (votes, sorted desc).
- **Team bank (138 FBS teams):**
  `https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000`
  filtered to the static FBS id list in `src/fbs.ts`; conferences from the
  static team→conference map in the same file.
- **Records:**
  `https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/types/2/groups/80/standings/0`
  — one call, overall record inline per team. If it fails, records fall back
  to the AP poll's `recordSummary` for ranked/RV teams and blank elsewhere.

If the AP poll fetch fails, the tab shows a graceful error and keeps any saved
custom rankings — it never wipes them.

## Tab 1 — NFL Draft Board ranker

- Tap a player in the name bank to place them at No. 1, then No. 2, etc.
  (Tapping a placed player removes them.) Drag rows or use the ↑ / ↓ arrows
  to reorder; numbers renumber automatically.
- Name bank: search by name or school, filter by position. Every player shows
  a school logo chip (`a.espncdn.com` team logos; initials badge if a logo
  fails to load) plus consensus rank and average.
- Progress count (X / 355) with a progress bar, one-tap **Start from consensus
  top 50**, and **Export as text list** (also downloads a `.txt`).
- **Submit** downloads `seths-draft-board.csv` and `seths-draft-board.json`
  (rank, player, school, position, consensus rank/avg, # sources).
- Your board persists in `localStorage` (`ssb-draft-board-v1`) in this browser.
- Theme: light beige / tannish-white background, warm white cards, black
  accents — Submit, Export, buttons, active tab, and progress bar are black
  with white text. Logos are never recolored.

### How to paste draft-board ranks into the Sheet as Source 11

1. In the app, build your board and click **Submit — download CSV + JSON**.
2. Open `seths-draft-board.csv` (or the JSON if you prefer) and copy the
   `My Rank` column values in player order.
3. In the Google Sheet "2027 NFL Draft - Consensus Big Board", go to the
   **Consensus** tab. Source 11 is the "Seth's Board" column (column U in the
   Nov 25, 2026 layout — verify the header still reads "Seth's Board" before
   pasting; the sheet has 16 sources in J–S and U–Z with "My Rank" in T).
4. For each player on your board, paste that player's My Rank into the Source 11
   cell on that player's row. **Do not type in the position tabs** (QB–P) —
   they are formula-driven views of Consensus.
5. Players you didn't rank stay blank in Source 11. The consensus averages
   recompute from the source columns automatically.
6. The old Source 11 values (82 players, Nov 8, 2026) are replaced by your new
   board — that is the point of a resubmission. If you only want to update part
   of the board, paste only those rows and leave the rest as-is.

## Tab 2 — College Football Top 25 builder

- Starts from the live AP Top 25 fetched at runtime (see above). The AP poll
  refreshes Sundays at 8pm CT; **Refresh poll** checks for a new poll.
- **Your custom rankings are never wiped without asking.** If a new poll is
  available after you have customized, the app shows a prompt: load the new
  poll as a starting point, or keep your rankings. If you haven't customized,
  the new poll loads automatically. Same poll date = nothing changes.
- Drag / arrow reorder, team bank by conference tabs (ACC, Big 12, Big Ten,
  SEC, American, Mountain West, Sun Belt, Pac-12, CUSA, MAC, FBS Indep.) with
  records + logos for all 138 FBS teams. Add teams from the bank (goes to
  Receiving Votes once the Top 25 is full); remove teams from either list;
  promote a Receiving Votes team into the Top 25 when there is room.
- Receiving Votes sits at the bottom, sorted by vote count.
- **Submit** renders a shareable "Seth's Top 25" card and downloads it as a
  PNG (`seths-top-25.png`): near-black background with warm golden-brown
  bokeh glow, black "SSB" badge with a gold football, gold-bordered panel with
  "SETH'S SPORTS BOOK" in silver-gray caps over a huge metallic silver 3D
  "TOP 25", date line with the current poll date, six small squares (four
  filled, two empty), "CFP SELECTION DAY: DECEMBER 6, 2026", a 5×5 grid of
  team-color tiles with thin gold borders, centered logos, and small black
  rank-number badges overlapping each tile's top-left corner, plus an italic
  footer naming Seth's No. 1 team.
- Your custom Top 25 persists in `localStorage` (`ssb-top25-v1`) in this browser.

## What this copy does not do (on purpose)

- No Google Sheet read or write, no Google credentials, no service account.
- No GitHub push, no deploy. Run it locally or host the `dist/` output
  anywhere static.
- No analytics, no tracking, no backend of any kind.
