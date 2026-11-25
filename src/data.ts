// Shared types + bundled draft-board data.
// players.json / sources.json live in ../data/ and are imported as JSON
// (Vite bundles them; they ship with the app, no network needed for Tab 1).
import playersJson from '../data/players.json'
import sourcesJson from '../data/sources.json'

export interface Player {
  name: string
  school: string
  position: string
  consensusRank: number | null
  consensusAvg: number | null
  numSources: number
  best: number | null
  worst: number | null
  sources: Record<string, number>
}

export interface Source {
  number: number
  name: string
  columnHeader: string
  type: string
  date: string
  notes: string
}

export const PLAYERS: Player[] = playersJson as Player[]
export const SOURCES: Source[] = sourcesJson as Source[]

// Ranked players sorted by consensus average (NOT by rank number —
// tied ranks mean only 306 unique rank values across 344 ranked players).
export const RANKED_PLAYERS: Player[] = PLAYERS.filter(
  (p) => p.consensusAvg !== null,
).sort((a, b) => (a.consensusAvg as number) - (b.consensusAvg as number))

export const UNRANKED_PLAYERS: Player[] = PLAYERS.filter(
  (p) => p.consensusAvg === null,
)

export const POSITIONS: string[] = Array.from(
  new Set(PLAYERS.map((p) => p.position)),
).sort()

export function logoUrlForTeamId(teamId: string): string {
  return `https://a.espncdn.com/i/teamlogos/ncaa/500/${teamId}.png`
}

export function initialsFor(name: string): string {
  return name
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}
