# Seth's Sports Book — data extraction notes

Extracted 2026-11-25 from Google Sheet "2027 NFL Draft - Consensus Big Board"
(sheet id `1MV6Nsjm99GtM8xRXzI5rFM9qa0if_CSRU6arwLct-KM`). Read-only; sheet not modified.

## Tabs found (17)

`Consensus`, `My Board`, `QB`, `RB`, `WR`, `TE`, `OT`, `IOL`, `EDGE`, `DT`, `LB`, `CB`, `S`, `K`, `P`, `Sources`, `README`

**No "College Football Top 25" tab exists in this sheet** — there is no AP Top 25 / Receiving Votes data to extract. The app's Top 25 builder will need to fetch the AP poll at runtime as planned. (The position tabs QB–P are formula-driven views of the Consensus tab — "do NOT type in them" per README — so they were not extracted separately.)

## Consensus tab — `players.json`

- **355 players** total; **344 ranked** (consensus ranks 1–344), **11 unranked** (see quirks).
- Columns: A Rank, B Player, C School, D Info (long scouting notes — NOT extracted), E Pos, F Consensus Avg, G # Sources, H Best, I Worst, J–S Sources 1–10, T "My Rank", U–Z Sources 11–16.
- Consensus Avg = mean of that player's source ranks (verified: all 344 ranked players' averages match the extracted source ranks exactly, rounded to 2dp).
- Position counts: EDGE 48, CB 44, WR 41, S 40, LB 30, DT 30, OT 24, QB 22, RB 21, TE 20, G 19, C 9, K 4, P 3.
- Sources are keyed `"Source N"` in each player's `sources` object; blank ranks are omitted. Extra fields kept per player: `numSources`, `best`, `worst`, and `myRank` (only if filled — currently none are).
- Top 5: 1 Jeremiah Smith (Ohio State, WR, 1.06, 16 sources), 2 Leonard Moore (Notre Dame, CB, 3.13), 3 Drew Mestemaker (Oklahoma State, QB, 3.81), 4 Colin Simmons (Texas, EDGE, 4.56), 5 Dylan Stewart (South Carolina, EDGE, 5.81).
- Source coverage (players ranked by each source): Source 10 (Unnamed) 280, Sources 8/9 (Renner Top 150 / Drafttek) 149 each, Sources 1/12 (Schulte / Renner Mock) 96 each, Source 11 (Seth's Board) 82, Source 4 (Tice) 60, Sources 3/5/14/15/16 32 each, Source 2 (Kiper) 25, Source 7 (McShay) 20, Sources 6/13 (Baumgardner Top 10 / Kinnan Top 10) 10 each.
- Only 5 players appear in all 16 sources; 163 players appear in exactly 1 source.

## Sources — `sources.json`

16 sources, in sheet order. Key identities:
- Source 7 — Todd McShay (The Ringer), **partial** (only 20 players have a McShay rank; full top 50 not yet published as of Nov 15, 2026).
- Source 8 — Mike Renner, CBS Top 150 (Oct 14, 2026). Source 12 is a second Renner source (CBS Mock 3 Rds, Nov 11, 2026).
- Source 10 — **Unnamed Big Board 1–300, author unknown** (no author/site in the paste). Memory says: ask Seth who it is. Source 3 (Mock #3, Nov 7) is likewise unnamed — Sources tab says "Tell me who this is from and I will rename it."
- Source 11 — Seth's Board (his own board, submitted Nov 8, 2026, 82 players ranked).
- Sources 6 and 16 are both Nick Baumgardner (The Athletic) — Top 10 mock (Oct 30) and Round 1 mock (Nov 11).
- Two extra non-numeric rows in the Sources tab were NOT counted as sources: "Seth's own takes - Nov 7, 2026" (takes recorded in the Info column only) and "Nick Baumgardner - Positional Top 5s" (Oct 27, info-only, no overall ranks).

## Data quirks

- **11 unranked players** have zero source ranks, no consensus avg, no rank — they are placeholder rows (name/school/pos only): Enow Etta (Michigan, DT), Chris Bracy (Michigan, S), Luke Drzewiecki (Minnesota, K), Hunter Green (Washington, P), David Olano (Texas A&M, K), Nolan Hauser (Clemson, K), Lucas Carneiro (Ole Miss, K), Daniel Sparks (Virginia, P), Palmer Williams (Baylor, P), Malachi Toney (Miami (FL), WR), Keelon Russell (Alabama, QB). Mostly K/P depth plus two skill players. They are included in `players.json` with `consensusRank: null`, `consensusAvg: null`, empty `sources`.
- **Tied ranks:** only 306 unique consensus-rank values across 344 ranked players (Sheets RANK() with ties, so rank numbers skip — e.g. no rank 25, 57, 70...). Sort by `consensusAvg`, not by rank number, for a clean ordering.
- **No duplicate player names.**
- **No missing schools or positions** on any row.
- **"My Rank" (column T) is entirely blank** — Seth has not entered any of his own ranks on the Consensus tab yet.
- **My Board tab values are stale vs. Consensus:** e.g. Jeremiah Smith shows avg 1.1 on My Board vs. 1.06 on Consensus; Leonard Moore 2.89 vs. 3.13. My Board's Consensus Rank/Avg columns are a snapshot from an earlier state — do not treat them as current.
- **School naming is inconsistent** in a few spots: "Cal" vs "California" both appear as separate school strings; "Miami (FL)" is used consistently for Miami.
- **Spelling note from Sources tab:** Renner spells Colin Simmons as "Collin Simmons" — the sheet uses "Colin Simmons".
- **Info column (D) not extracted** — it holds long per-player scouting notes (up to several sentences with per-source commentary). If the rebuild wants it, it can be pulled from the same Consensus range later.
- **README is outdated** relative to the current sheet: it describes sources only in J–Q (Sources 1–8) and "My Rank" in R, but the sheet now has 16 sources in J–S and U–Z with "My Rank" in T. The extraction above follows the actual current layout.

## My Board tab — summary (not replicated)

- Header: "MY BOARD — Seth's rankings". Instruction row: fill in blanks; start with Top 10, then position battles; when done, ranks get pulled into Consensus column T ("My Rank").
- **My Top 10: completely empty** (rows 1–10 blank, no players entered).
- **My Top 50:** the top 50 consensus players are pre-listed (rows 19–68, consensus ranks 1–50 with schools/positions/averages), but the "My Rank" column is blank for all 50 — Seth has not ranked any of them yet.
- **Position battles** (all pre-listed with consensus data, all "My Rank" blank — none ranked yet):
  - QB top 8 (Mestemaker, Chambliss, Manning, Carr, Mensah, D. Moore, A. Simmons, Maiava)
  - OT top 8 (Seaton, Goosby, Lauck, Heard, Z. Williams, Siani, C. Smith, Link) — prompt: "is Williams really OT1?"
  - EDGE top 8 + Jordan Ross as a 9th row (Ross vs Pierre vs Traore vs Heldt)
  - TE top 6 (Jamari Johnson, Trey'Dez Green, Luke Reynolds, Overmyer, T. Carter Jr., Peter Clarke) — prompt: "is Reynolds TE1?"
  - S top 8 (T. Johnson, Bolden, Lopa, McClain, Perich, McDonald, Benefield, Myrick) — prompt: "is McClain SAF1?"
  - LB top 6 (Cole, Viliamu-Asa, Uluave, S. Brown, Biles, O. Chambliss) — prompt: "Omosigho Top 32?" (note: Omosigho himself is not in the listed 6)
  - WR top 10 (Smith, Becker, Coleman, Marsh, Duff, R. Harris, Alexander, Miller, Wingo, Coleman-Williams) — prompt: "is Harris Top 50?"
  - CB top 8 (Moore, Hampton, Robinson IV, K. Jones, E. Washington II, Z. Brown, Collins, Swain)
  - RB top 8 (Baugh, Lacy, Hardy, Bishop, Frazier, Parker, I. Brown, Fletcher Jr.)
  - DT top 8 (Echoles, Gilliam, Stone, Thompkins, A'Mauri Washington, Moten Sr., Gadson, Holmes Jr.)
  - IOL split into two sections: G top 4 (G. Johnson, C. Green, Siereveld, Knapp) and C top 4 (Pieper, Boswell, Winter, B. Moore)
- Bottom row: "DONE? Tell me in chat and I'll pull your ranks into Consensus column T and re-sort a My Board view for you."
- Net: the My Board tab is a **blank worksheet awaiting Seth's input** — nothing to replicate beyond its structure, which is summarized above.

## Files

- `players.json` — 355 player objects
- `sources.json` — 16 sources
- `notes.md` — this file
