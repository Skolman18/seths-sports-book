import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CONFERENCE_ORDER, TEAM_CONFERENCE } from './fbs'
import { Logo } from './Logo'
import teamBankJson from '../data/team-bank.json'

/* ------------------------------------------------------------------ */
/* ESPN public endpoints (no API key).                                 */
/*  Rankings: site.api.espn.com/.../college-football/rankings         */
/*            -> CFP "Playoff Committee Rankings" when they exist      */
/*               (weekly from early Nov), else the AP Top 25.          */
/*  Team bank: built in (data/team-bank.json, all 138 FBS teams) —    */
/*            the live ESPN teams download is 1.8 MB and failed twice  */
/*            from a browser check, so the bank no longer fetches.     */
/*  Records:  sports.core.api.espn.com/.../groups/80/standings/0      */
/*            -> one small call, overall record inline per team        */
/* ------------------------------------------------------------------ */
const RANKINGS_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings'
const STANDINGS_URL =
  'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/2026/types/2/groups/80/standings/0'

const STORAGE_KEY = 'ssb-top25-v1'
const CFP_SELECTION_DAY = 'DECEMBER 6, 2026'

export interface EspnTeam {
  id: string
  displayName: string
  abbreviation: string
  color: string
  alternateColor: string
  logo: string
  conference: string
  record: string
  /** AP points (Top 25) or votes (Receiving Votes). 0 for hand-added teams. */
  points: number
}

interface ApPoll {
  date: string
  teams: EspnTeam[]
  receivingVotes: EspnTeam[]
  /** 'CFP' once the Playoff Committee rankings exist, else 'AP'. */
  source: 'CFP' | 'AP'
}

/** The built-in team bank: all 138 FBS teams, sorted by conference. */
const STATIC_BANK: EspnTeam[] = teamBankJson as EspnTeam[]

interface SavedTop25 {
  custom: string[]
  rv: { id: string; points: number }[]
  pollDate: string
  customized: boolean
  source?: 'CFP' | 'AP'
  /** Poll date the empty-RV backfill already ran for (so a deliberate
      "clear Receiving Votes" isn't undone on the next load). */
  rvBackfilledFor?: string
}

function normalizeTeam(raw: any, points = 0, record = ''): EspnTeam {
  const t = raw.team ?? raw
  const location: string = t.location ?? ''
  const name: string = t.name ?? ''
  const displayName: string =
    t.displayName ?? [location, name].filter(Boolean).join(' ') ?? 'Unknown'
  const logos: any[] = t.logos ?? []
  const logo =
    logos.find((l) => (l.rel ?? []).includes('default'))?.href ??
    logos[0]?.href ??
    `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png`
  return {
    id: String(t.id),
    displayName,
    abbreviation: t.abbreviation ?? displayName.slice(0, 4).toUpperCase(),
    color: t.color ?? '333333',
    alternateColor: t.alternateColor ?? 'ffffff',
    logo,
    conference: t.groups?.shortName ?? TEAM_CONFERENCE[String(t.id)] ?? 'FBS',
    record: raw.recordSummary ?? record ?? '',
    points,
  }
}

/** Prefer the Playoff Committee rankings once they exist; AP before that.
    The CFP publishes no "others receiving votes", so when it has none we
    fall back to the AP poll's others (minus any team already in the Top 25),
    so Receiving Votes is never empty while the AP poll exists. */
async function fetchPoll(): Promise<ApPoll> {
  const res = await fetch(RANKINGS_URL)
  if (!res.ok) throw new Error(`Rankings fetch failed (HTTP ${res.status})`)
  const data = await res.json()
  const cfp = (data.rankings ?? []).find(
    (r: any) => r.type === 'cfp' || /playoff committee/i.test(r.name ?? ''),
  )
  const apEntry = (data.rankings ?? []).find(
    (r: any) => r.type === 'ap' || /AP Top 25/i.test(r.name ?? ''),
  )
  const entry =
    cfp ?? apEntry
  if (!entry) throw new Error('No CFP or AP rankings found in the ESPN rankings response')
  const source: 'CFP' | 'AP' = cfp ? 'CFP' : 'AP'
  const teams = (entry.ranks ?? [])
    .slice()
    .sort((a: any, b: any) => a.current - b.current)
    .map((r: any) => normalizeTeam(r, r.points ?? 0))
  const topIds = new Set(teams.map((t: EspnTeam) => t.id))
  const toRv = (rows: any[]) =>
    (rows ?? [])
      .map((r: any) => normalizeTeam(r, r.points ?? 0))
      .filter((t) => !topIds.has(t.id))
      .sort((a, b) => b.points - a.points)
  let receivingVotes = toRv(entry.others)
  if (receivingVotes.length === 0 && apEntry && apEntry !== entry) {
    receivingVotes = toRv(apEntry.others)
  }
  return { date: entry.date ?? '', teams, receivingVotes, source }
}

/** Records only — the bank itself is built in. Fails silently; records stay blank. */
async function fetchRecords(): Promise<Map<string, string>> {
  const records = new Map<string, string>()
  try {
    const res = await fetch(STANDINGS_URL)
    if (!res.ok) return records
    const s = await res.json()
    for (const entry of s.standings ?? []) {
      const ref: string = entry.team?.$ref ?? ''
      const m = ref.match(/\/teams\/(\d+)/)
      if (m) {
        const total = (entry.records ?? []).find((r: any) => r.type === 'total')
        records.set(m[1], total?.summary ?? entry.records?.[0]?.summary ?? '')
      }
    }
  } catch {
    /* records stay blank; the bank still works */
  }
  return records
}

function loadSaved(): SavedTop25 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedTop25) : null
  } catch {
    return null
  }
}

function formatPollDate(iso: string): string {
  if (!iso) return 'AP POLL'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'AP POLL'
  return d
    .toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Chicago',
    })
    .toUpperCase()
}

export function Top25() {
  const [bank, setBank] = useState<EspnTeam[]>([])
  const [records, setRecords] = useState<Map<string, string>>(new Map())
  const [poll, setPoll] = useState<ApPoll | null>(null)
  const [pollSource, setPollSource] = useState<'CFP' | 'AP'>('AP')
  const [pollError, setPollError] = useState('')
  const [pollLoading, setPollLoading] = useState(true)
  const [custom, setCustom] = useState<EspnTeam[]>([])
  const [rv, setRv] = useState<EspnTeam[]>([])
  const [rvBackfilledFor, setRvBackfilledFor] = useState('')
  const [pollDate, setPollDate] = useState('')
  const [customized, setCustomized] = useState(false)
  const [pendingPoll, setPendingPoll] = useState<ApPoll | null>(null)
  const [confTab, setConfTab] = useState('All')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [cardBusy, setCardBusy] = useState(false)
  const seededRef = useRef(false)

  /** Adopt a poll as the starting point (fresh seed or accepted refresh). */
  const adoptPoll = useCallback((ap: ApPoll, markCustomized: boolean) => {
    setCustom(ap.teams)
    setRv(ap.receivingVotes)
    setPollDate(ap.date)
    setPollSource(ap.source)
    setCustomized(markCustomized)
    setPendingPoll(null)
  }, [])

  /** Handle a freshly fetched poll against whatever the user already has. */
  const handleFreshPoll = useCallback(
    (ap: ApPoll) => {
      const saved = loadSaved()
      if (!saved || saved.custom.length === 0) {
        adoptPoll(ap, false)
        return
      }
      if (saved.pollDate && ap.date && saved.pollDate !== ap.date) {
        if (saved.customized) {
          // Never wipe custom rankings without asking.
          setPendingPoll(ap)
          setNotice(
            `A new ${ap.source === 'CFP' ? 'CFP rankings' : 'AP poll'} is out (${formatPollDate(ap.date)}). Your custom rankings are untouched — choose below whether to load it.`,
          )
        } else {
          adoptPoll(ap, false)
          setNotice(`Updated to the new ${ap.source === 'CFP' ? 'CFP rankings' : 'AP poll'} (${formatPollDate(ap.date)}).`)
        }
      }
      // Same poll date: keep the saved custom rankings as-is.
    },
    [adoptPoll],
  )

  useEffect(() => {
    // Restore saved custom rankings first so the screen never flashes empty.
    const saved = loadSaved()
    if (saved && saved.custom.length > 0) {
      setPollDate(saved.pollDate)
      setCustomized(saved.customized)
      if (saved.source) setPollSource(saved.source)
      if (saved.rvBackfilledFor) setRvBackfilledFor(saved.rvBackfilledFor)
    }
    let cancelled = false
    ;(async () => {
      try {
        const ap = await fetchPoll()
        if (cancelled) return
        setPoll(ap)
        // Resolve saved ids against the freshly fetched poll + bank data.
        if (saved && saved.custom.length > 0) {
          const resolve = (id: string, pts: number) => {
            const fromPoll =
              ap.teams.find((t) => t.id === id) ??
              ap.receivingVotes.find((t) => t.id === id)
            if (fromPoll) return { ...fromPoll, points: pts }
            return null // bank resolves it below, once loaded
          }
          const resolved = saved.custom
            .map((id) => resolve(id, 0))
            .filter((t): t is EspnTeam => t !== null)
          const resolvedRv = saved.rv
            .map((r) => resolve(r.id, r.points))
            .filter((t): t is EspnTeam => t !== null)
          if (resolved.length === saved.custom.length) {
            setCustom(resolved)
            // The CFP poll carries no Receiving Votes, so a saved list from
            // a CFP adopt can be empty — backfill it once per poll date from
            // this poll's RV (already the AP others when the CFP has none).
            // A deliberate clear isn't undone: the flag records the date.
            const resolvedIds = new Set(resolved.map((t) => t.id))
            const backfill =
              resolvedRv.length === 0 &&
              saved.rvBackfilledFor !== ap.date &&
              ap.receivingVotes.length > 0
                ? ap.receivingVotes.filter((t) => !resolvedIds.has(t.id))
                : resolvedRv
            setRv(backfill)
            if (backfill !== resolvedRv) setRvBackfilledFor(ap.date)
          }
          // If some ids are only in the bank, the bank effect below fills them.
        }
        handleFreshPoll(ap)
        seededRef.current = true
      } catch (e) {
        if (!cancelled)
          setPollError(
            e instanceof Error ? e.message : 'Could not load the rankings.',
          )
      } finally {
        if (!cancelled) setPollLoading(false)
      }
    })()
    // The bank is built in; only records come from the network (and may fail silently).
    ;(async () => {
      const records = await fetchRecords()
      if (cancelled) return
      setRecords(records)
      setBank(STATIC_BANK.map((t) => ({ ...t, record: records.get(t.id) ?? '' })))
    })()
    return () => {
      cancelled = true
    }
  }, [handleFreshPoll])

  // Once the bank loads, fill in any saved ids the poll payload didn't carry.
  useEffect(() => {
    if (bank.length === 0) return
    const saved = loadSaved()
    if (!saved || saved.custom.length === 0) return
    setCustom((cur) => {
      if (cur.length === saved.custom.length) return cur
      const merged = saved.custom
        .map((id) => cur.find((t) => t.id === id) ?? bank.find((t) => t.id === id))
        .filter((t): t is EspnTeam => Boolean(t))
      return merged.length ? merged : cur
    })
    setRv((cur) => {
      const merged = saved.rv
        .map((r) => {
          const base =
            cur.find((t) => t.id === r.id) ?? bank.find((t) => t.id === r.id)
          return base ? { ...base, points: r.points } : undefined
        })
        .filter((t): t is EspnTeam => Boolean(t))
      return merged.length ? merged : cur
    })
  }, [bank])

  // Persist custom rankings.
  useEffect(() => {
    if (!seededRef.current && custom.length === 0) return
    try {
      const saved: SavedTop25 = {
        custom: custom.map((t) => t.id),
        rv: rv.map((t) => ({ id: t.id, points: t.points })),
        pollDate,
        customized,
        source: pollSource,
        rvBackfilledFor: rvBackfilledFor || undefined,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    } catch {
      /* storage unavailable — rankings still work for the session */
    }
  }, [custom, rv, pollDate, customized, pollSource, rvBackfilledFor])

  async function refreshPoll() {
    setPollLoading(true)
    setNotice('')
    try {
      const ap = await fetchPoll()
      setPoll(ap)
      if (ap.date && pollDate && ap.date !== pollDate) {
        if (customized) {
          setPendingPoll(ap)
          setNotice(
            `A new ${ap.source === 'CFP' ? 'CFP rankings' : 'AP poll'} is out (${formatPollDate(ap.date)}). Your custom rankings are untouched — choose below whether to load it.`,
          )
        } else {
          adoptPoll(ap, false)
          setNotice(`Updated to the new ${ap.source === 'CFP' ? 'CFP rankings' : 'AP poll'} (${formatPollDate(ap.date)}).`)
        }
      } else {
        setNotice(`Already on the latest ${ap.source === 'CFP' ? 'CFP rankings' : 'AP poll'} (${formatPollDate(ap.date)}).`)
      }
    } catch (e) {
      setPollError(e instanceof Error ? e.message : 'Refresh failed.')
    } finally {
      setPollLoading(false)
    }
  }

  function markCustomized() {
    setCustomized(true)
  }

  function move(index: number, dir: -1 | 1) {
    setCustom((c) => {
      const next = [...c]
      const j = index + dir
      if (j < 0 || j >= next.length) return c
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
    markCustomized()
  }

  function removeFromCustom(id: string) {
    setCustom((c) => c.filter((t) => t.id !== id))
    markCustomized()
  }

  function addTeam(team: EspnTeam) {
    if (custom.some((t) => t.id === team.id) || rv.some((t) => t.id === team.id))
      return
    if (custom.length < 25) {
      setCustom((c) => [...c, team])
    } else {
      setRv((r) => [...r, { ...team, points: 0 }])
    }
    markCustomized()
  }

  function promoteFromRv(id: string) {
    if (custom.length >= 25) return
    setRv((r) => {
      const team = r.find((t) => t.id === id)
      if (team) setCustom((c) => [...c, team])
      return r.filter((t) => t.id !== id)
    })
    markCustomized()
  }

  function removeFromRv(id: string) {
    setRv((r) => r.filter((t) => t.id !== id))
    markCustomized()
  }

  function resetToAp() {
    if (!poll) return
    if (
      customized &&
      !window.confirm(`Reset to the current ${pollSource === 'CFP' ? 'CFP' : 'AP'} Top 25? Your custom order will be replaced.`)
    )
      return
    adoptPoll(poll, false)
    setNotice(`Reset to the current ${pollSource === 'CFP' ? 'CFP' : 'AP'} Top 25.`)
  }

  const inTop25 = useMemo(() => new Set(custom.map((t) => t.id)), [custom])
  const inRv = useMemo(() => new Set(rv.map((t) => t.id)), [rv])

  /** Live record from the standings endpoint; falls back to the poll's record
      (the poll's record is frozen at the rankings date, the bank's is current). */
  const liveRecord = (t: EspnTeam) => records.get(t.id) ?? t.record

  const bankFiltered = useMemo(() => {
    if (confTab === 'All') return bank
    return bank.filter((t) => t.conference === confTab)
  }, [bank, confTab])

  /** Bank rows: conference headers between groups when showing All. */
  const bankRows = useMemo(() => {
    type Row =
      | { kind: 'header'; conference: string }
      | { kind: 'team'; team: EspnTeam }
    const rows: Row[] = []
    let lastConf = ''
    for (const team of bankFiltered) {
      if (confTab === 'All' && team.conference !== lastConf) {
        rows.push({ kind: 'header', conference: team.conference })
        lastConf = team.conference
      }
      rows.push({ kind: 'team', team })
    }
    return rows
  }, [bankFiltered, confTab])

  const conferences = useMemo(() => {
    const present = Array.from(new Set(bank.map((t) => t.conference)))
    return ['All', ...CONFERENCE_ORDER.filter((c) => present.includes(c)), ...present.filter((c) => !CONFERENCE_ORDER.includes(c))]
  }, [bank])

  const rvSorted = useMemo(
    () => [...rv].sort((a, b) => b.points - a.points),
    [rv],
  )

  /* ---------------- Shareable card (canvas PNG) ---------------- */
  /** Load a logo for the canvas. Falls back to the built-in bank's canonical
      ESPN logo URL when the poll's URL won't load, so a bad link never
      leaves a tile blank. */
  function loadImage(src: string, fallbackSrc?: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => {
        if (fallbackSrc && fallbackSrc !== src) {
          loadImage(fallbackSrc).then(resolve)
        } else {
          resolve(null)
        }
      }
      img.src = src
    })
  }

  async function downloadCard() {
    if (custom.length === 0) return
    setCardBusy(true)
    try {
      const W = 1080
      const H = 1500
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas not supported in this browser')
      // Near-black background + warm golden-brown bokeh glow.
      ctx.fillStyle = '#0d0b09'
      ctx.fillRect(0, 0, W, H)
      let seed = 42
      const rand = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      for (let i = 0; i < 46; i++) {
        const x = rand() * W
        const y = rand() * H
        const r = 24 + rand() * 110
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        const warm = rand() > 0.5
        g.addColorStop(0, warm ? 'rgba(201,162,39,0.20)' : 'rgba(146,90,42,0.16)')
        g.addColorStop(1, 'rgba(201,162,39,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      const cx = W / 2
      // SSB badge with gold football.
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(cx, 92, 46, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c9a227'
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.save()
      ctx.translate(cx, 92)
      ctx.rotate(-Math.PI / 5)
      ctx.fillStyle = '#c9a227'
      ctx.beginPath()
      ctx.ellipse(0, 0, 30, 18, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#0d0b09'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-14, 0)
      ctx.lineTo(14, 0)
      ctx.stroke()
      for (const lx of [-9, -3, 3, 9]) {
        ctx.beginPath()
        ctx.moveTo(lx, -5)
        ctx.lineTo(lx, 5)
        ctx.stroke()
      }
      ctx.restore()
      ctx.fillStyle = '#e8e6e1'
      ctx.font = '700 34px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.fillText('SSB', cx, 100)
      // Gold-bordered panel.
      const panelX = 60
      const panelY = 168
      const panelW = W - 120
      ctx.strokeStyle = '#c9a227'
      ctx.lineWidth = 3
      ctx.strokeRect(panelX, panelY, panelW, 190)
      ctx.fillStyle = '#111010'
      ctx.fillRect(panelX, panelY, panelW, 190)
      ctx.fillStyle = '#b9b7b2'
      ctx.font = '600 30px Georgia, serif'
      ctx.fillText("SETH'S SPORTS BOOK", cx, panelY + 52)
      // Huge metallic silver 3D TOP 25.
      ctx.font = '900 120px Georgia, serif'
      ctx.fillStyle = '#3a3a3a'
      ctx.fillText('TOP 25', cx + 4, panelY + 168)
      const grad = ctx.createLinearGradient(0, panelY + 60, 0, panelY + 175)
      grad.addColorStop(0, '#f4f4f4')
      grad.addColorStop(0.5, '#c8c8c8')
      grad.addColorStop(1, '#8a8a8a')
      ctx.fillStyle = grad
      ctx.fillText('TOP 25', cx, panelY + 164)
      // Date line.
      const dateY = panelY + 232
      ctx.fillStyle = '#d8d2c4'
      ctx.font = '600 24px Georgia, serif'
      ctx.fillText(`${pollSource === 'CFP' ? 'CFP RANKINGS' : 'AP POLL'} — ${formatPollDate(pollDate)}`, cx, dateY)
      // Six small squares: four filled, two empty.
      const sqY = dateY + 34
      for (let i = 0; i < 6; i++) {
        const sx = cx - 75 + i * 30
        if (i < 4) {
          ctx.fillStyle = '#c9a227'
          ctx.fillRect(sx, sqY, 20, 20)
        } else {
          ctx.strokeStyle = '#c9a227'
          ctx.lineWidth = 2
          ctx.strokeRect(sx, sqY, 20, 20)
        }
      }
      ctx.fillStyle = '#b9b7b2'
      ctx.font = '600 22px Georgia, serif'
      ctx.fillText(`CFP SELECTION DAY: ${CFP_SELECTION_DAY}`, cx, sqY + 62)
      // 5x5 grid of team-color tiles.
      const gridX = 60
      const gridY = 470
      const tile = 186
      const gap = 12
      const logos = await Promise.all(
        custom.slice(0, 25).map((t) => {
          const bankLogo = STATIC_BANK.find((b) => b.id === t.id)?.logo
          return loadImage(
            bankLogo ?? t.logo,
            bankLogo && bankLogo !== t.logo ? t.logo : undefined,
          )
        }),
      )
      for (let i = 0; i < 25; i++) {
        const row = Math.floor(i / 5)
        const col = i % 5
        const x = gridX + col * (tile + gap)
        const y = gridY + row * (tile + gap)
        const team = custom[i]
        ctx.fillStyle = team ? `#${team.color}` : '#1c1a17'
        ctx.fillRect(x, y, tile, tile)
        ctx.strokeStyle = '#c9a227'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, tile, tile)
        if (team) {
          const img = logos[i]
          if (img) {
            // White disc behind the mark: some marks are dark-on-dark or
            // white-on-light against their team color and vanish on the tile.
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(x + tile / 2, y + tile / 2, 70, 0, Math.PI * 2)
            ctx.fill()
            const s = Math.min(img.width, img.height)
            const pad = 35
            ctx.drawImage(
              img,
              (img.width - s) / 2,
              (img.height - s) / 2,
              s,
              s,
              x + pad,
              y + pad,
              tile - pad * 2,
              tile - pad * 2,
            )
          } else {
            ctx.fillStyle = '#ffffff'
            ctx.font = '700 64px Georgia, serif'
            ctx.fillText(team.abbreviation, x + tile / 2, y + tile / 2 + 22)
          }
          // Small black rank-number badge overlapping top-left corner.
          ctx.fillStyle = '#000'
          ctx.beginPath()
          ctx.arc(x + 4, y + 4, 26, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#c9a227'
          ctx.lineWidth = 2
          ctx.stroke()
          ctx.fillStyle = '#fff'
          ctx.font = '700 26px Georgia, serif'
          ctx.fillText(String(i + 1), x + 4, y + 13)
        }
      }
      // Italic footer naming Seth's No. 1.
      ctx.fillStyle = '#e8e6e1'
      ctx.font = 'italic 600 30px Georgia, serif'
      ctx.fillText(
        custom[0] ? `Seth's No. 1: ${custom[0].displayName}` : "Seth's Top 25",
        cx,
        gridY + 5 * (tile + gap) + 52,
      )
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not render the card image'))
            return
          }
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'seths-top-25.png'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          resolve()
        }, 'image/png')
      })
      setNotice('Downloaded your Top 25 card as a PNG.')
    } catch (e) {
      setNotice(
        `Could not render the card: ${e instanceof Error ? e.message : 'unknown error'}. Your rankings are still saved.`,
      )
    } finally {
      setCardBusy(false)
    }
  }

  return (
    <div className="top25-tab">
      <div className="cfp-hero">
        <div className="ssb-badge" aria-hidden="true">
          <span className="football" />
          <span className="ssb-letters">SSB</span>
        </div>
        <div className="cfp-panel">
          <div className="cfp-eyebrow">SETH&rsquo;S SPORTS BOOK</div>
          <div className="cfp-title">TOP 25</div>
          <div className="cfp-dateline">
            {pollSource === 'CFP' ? 'CFP RANKINGS' : 'AP POLL'}
            {pollDate ? ` — ${formatPollDate(pollDate)}` : ''}
          </div>
          <div className="cfp-squares" aria-hidden="true">
            <span className="sq filled" />
            <span className="sq filled" />
            <span className="sq filled" />
            <span className="sq filled" />
            <span className="sq" />
            <span className="sq" />
          </div>
          <div className="cfp-selection">
            CFP SELECTION DAY: {CFP_SELECTION_DAY}
          </div>
        </div>
      </div>

      <div className="top25-controls">
        <button className="btn btn-gold" onClick={refreshPoll} disabled={pollLoading}>
          {pollLoading ? 'Checking rankings…' : 'Refresh rankings'}
        </button>
        <button className="btn btn-ghost-light" onClick={resetToAp} disabled={!poll}>
          Reset to {pollSource === 'CFP' ? 'CFP' : 'AP'} Top 25
        </button>
        <span className="poll-status">
          {pollLoading
            ? 'Loading the rankings…'
            : pollError
              ? `Rankings unavailable: ${pollError}`
              : `On the ${pollSource === 'CFP' ? 'CFP rankings' : 'AP poll'} dated ${formatPollDate(pollDate)}${customized ? ' · customized' : ''}`}
        </span>
      </div>

      {pollError && custom.length === 0 && (
        <p className="top25-error">
          Couldn&rsquo;t load the rankings from ESPN right now ({pollError}).
          Check your connection and hit “Refresh rankings” — nothing was wiped;
          any saved rankings are still in this browser.
        </p>
      )}

      {pendingPoll && (
        <div className="pending-poll" role="alert">
          <p>
            <strong>New {pendingPoll.source === 'CFP' ? 'CFP rankings' : 'AP poll'} available</strong> — {formatPollDate(pendingPoll.date)}.
            Load it as a starting point? Your current custom rankings stay put
            unless you say yes.
          </p>
          <div>
            <button
              className="btn btn-gold"
              onClick={() => adoptPoll(pendingPoll, false)}
            >
              Yes — load the new poll
            </button>{' '}
            <button className="btn btn-ghost-light" onClick={() => setPendingPoll(null)}>
              No — keep my rankings
            </button>
          </div>
        </div>
      )}

      {notice && <p className="notice notice-dark">{notice}</p>}

      <div className="top25-layout">
        {/* ---- Custom Top 25 ---- */}
        <section className="panel panel-dark" aria-label="Seth's Top 25">
          <div className="panel-head">
            <h2>Seth&rsquo;s Top 25</h2>
            <span className="count">{custom.length} / 25</span>
          </div>
          {custom.length === 0 ? (
            <p className="empty-note empty-note-dark">
              {pollLoading
                ? 'Loading the rankings…'
                : 'No rankings yet — refresh the rankings or add teams from the bank.'}
            </p>
          ) : (
            <ol className="top25-list">
              {custom.map((team, i) => (
                <li
                  key={team.id}
                  className="top25-row"
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragIndex === null || dragIndex === i) return
                    setCustom((c) => {
                      const next = [...c]
                      const [moved] = next.splice(dragIndex, 1)
                      next.splice(i, 0, moved)
                      return next
                    })
                    setDragIndex(null)
                    markCustomized()
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="rank-num rank-num-dark">{i + 1}</span>
                  <Logo
                    src={team.logo}
                    label={team.displayName}
                    size={34}
                    fallbackBg={`#${team.color}`}
                    fallbackColor="#fff"
                  />
                  <span className="row-main">
                    <strong>{team.displayName}</strong>
                    <span className="row-sub">
                      {team.conference}
                      {liveRecord(team) ? ` · ${liveRecord(team)}` : ''}
                      {team.points ? ` · ${team.points} pts` : ''}
                    </span>
                  </span>
                  <span className="row-btns">
                    <button aria-label={`Move ${team.displayName} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button aria-label={`Move ${team.displayName} down`} onClick={() => move(i, 1)} disabled={i === custom.length - 1}>↓</button>
                    <button aria-label={`Remove ${team.displayName}`} onClick={() => removeFromCustom(team.id)}>×</button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Receiving Votes */}
          <h3 className="rv-head">Receiving Votes</h3>
          {rvSorted.length === 0 ? (
            <p className="empty-note empty-note-dark">
              No teams receiving votes — add a team from the bank once the Top 25 is full.
            </p>
          ) : (
            <ul className="rv-list">
              {rvSorted.map((team) => (
                <li key={team.id} className="rv-row">
                  <Logo src={team.logo} label={team.displayName} size={28} fallbackBg={`#${team.color}`} fallbackColor="#fff" />
                  <span className="row-main">
                    <strong>{team.displayName}</strong>
                    <span className="row-sub">
                      {team.conference}
                      {liveRecord(team) ? ` · ${liveRecord(team)}` : ''}
                    </span>
                  </span>
                  <span className="rv-votes">{team.points} votes</span>
                  <button
                    className="btn btn-ghost-light btn-small"
                    onClick={() => promoteFromRv(team.id)}
                    disabled={custom.length >= 25}
                    title={custom.length >= 25 ? 'Top 25 is full — remove a team first' : 'Move into the Top 25'}
                  >
                    ↑ Top 25
                  </button>
                  <button className="row-x" aria-label={`Remove ${team.displayName} from receiving votes`} onClick={() => removeFromRv(team.id)}>×</button>
                </li>
              ))}
            </ul>
          )}

        </section>

        {/* ---- Team bank ---- */}
        <section className="panel panel-dark bank-panel" aria-label="FBS team bank">
          <div className="panel-head">
            <h2>Team bank</h2>
            <span className="count">{bankFiltered.length} teams</span>
          </div>
          <div className="conf-tabs" role="group" aria-label="Filter by conference">
            {conferences.map((c) => (
              <button
                key={c}
                className={confTab === c ? 'chip chip-gold-active' : 'chip chip-dark'}
                onClick={() => setConfTab(c)}
                aria-pressed={confTab === c}
              >
                {c}
              </button>
            ))}
          </div>
          <ul className="bank-list bank-list-dark">
            {bankRows.map((row) => {
              if (row.kind === 'header') {
                return (
                  <li key={`conf-${row.conference}`} className="bank-conf-head">
                    {row.conference}
                  </li>
                )
              }
              const team = row.team
              const placed = inTop25.has(team.id)
              const inRvSet = inRv.has(team.id)
              return (
                <li key={team.id}>
                  <button
                    className={placed || inRvSet ? 'bank-row bank-row-dark placed' : 'bank-row bank-row-dark'}
                    onClick={() => addTeam(team)}
                    disabled={placed || inRvSet}
                    title={placed ? 'Already in your Top 25' : inRvSet ? 'Already receiving votes' : custom.length >= 25 ? 'Top 25 is full — adds to Receiving Votes' : 'Add to your Top 25'}
                  >
                    <Logo src={team.logo} label={team.displayName} size={30} fallbackBg={`#${team.color}`} fallbackColor="#fff" />
                    <span className="row-main">
                      <strong>{team.displayName}</strong>
                      <span className="row-sub">
                        {team.conference}
                        {liveRecord(team) ? ` · ${liveRecord(team)}` : ''}
                      </span>
                    </span>
                    <span className="row-cons">
                      {placed ? `✓ #${custom.findIndex((t) => t.id === team.id) + 1}` : inRvSet ? '✓ RV' : custom.length >= 25 ? '+ RV' : '+ Add'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {bank.length === 0 && (
            <p className="empty-note empty-note-dark">Loading the 138 FBS teams…</p>
          )}
        </section>
      </div>

      {/* Shareable card — a small footnote at the very bottom, not a big button. */}
      <p className="card-download-note">
        <span aria-hidden="true" className="card-download-star">★</span>{' '}
        <button
          className="card-download-link"
          onClick={downloadCard}
          disabled={custom.length === 0 || cardBusy}
        >
          {cardBusy ? 'Rendering your card…' : 'Download your Top 25 as a shareable card (PNG)'}
        </button>
        <span> — save it to share your rankings anywhere.</span>
      </p>
    </div>
  )
}
