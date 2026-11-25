import { useEffect, useMemo, useState } from 'react'
import {
  PLAYERS,
  POSITIONS,
  RANKED_PLAYERS,
  SOURCES,
  UNRANKED_PLAYERS,
  type Player,
} from './data'
import { SCHOOL_TEAM_ID, } from './fbs'
import { logoUrlForTeamId } from './data'
import { Logo } from './Logo'

const STORAGE_KEY = 'ssb-draft-board-v1'

const byName = new Map<string, Player>(PLAYERS.map((p) => [p.name, p]))

function loadBoard(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.filter((n) => byName.has(n)) : []
  } catch {
    return []
  }
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function DraftBoard() {
  const [board, setBoard] = useState<string[]>(loadBoard)
  const [query, setQuery] = useState('')
  const [posFilter, setPosFilter] = useState('All')
  const [showSources, setShowSources] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [exportText, setExportText] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
    } catch {
      /* storage unavailable — board still works for the session */
    }
  }, [board])

  const rankedSet = useMemo(() => new Set(board), [board])

  const bank = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...RANKED_PLAYERS, ...UNRANKED_PLAYERS]
    return list.filter((p) => {
      if (posFilter !== 'All' && p.position !== posFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.school.toLowerCase().includes(q)
      )
    })
  }, [query, posFilter])

  function placePlayer(name: string) {
    setBoard((b) => (b.includes(name) ? b : [...b, name]))
    setNotice('')
  }

  function removePlayer(name: string) {
    setBoard((b) => b.filter((n) => n !== name))
  }

  function move(index: number, dir: -1 | 1) {
    setBoard((b) => {
      const next = [...b]
      const j = index + dir
      if (j < 0 || j >= next.length) return b
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  function startFromConsensusTop50() {
    setBoard(RANKED_PLAYERS.slice(0, 50).map((p) => p.name))
    setNotice('Started from the consensus top 50 — drag or use the arrows to reorder.')
  }

  function clearBoard() {
    if (board.length === 0) return
    if (window.confirm('Clear your whole board? This cannot be undone.')) {
      setBoard([])
      setExportText('')
    }
  }

  function buildTextList(): string {
    const lines = board.map((name, i) => {
      const p = byName.get(name)
      if (!p) return `${i + 1}. ${name}`
      const cons =
        p.consensusRank !== null
          ? `Consensus #${p.consensusRank} (avg ${p.consensusAvg?.toFixed(2)})`
          : 'Unranked in consensus'
      return `${i + 1}. ${p.name} — ${p.school}, ${p.position} — ${cons}`
    })
    return `Seth's 2027 NFL Draft Board\n${lines.join('\n')}\n`
  }

  function exportAsText() {
    const text = buildTextList()
    setExportText(text)
    download('seths-draft-board.txt', text, 'text/plain')
  }

  function submitBoard() {
    const rows = board.map((name, i) => {
      const p = byName.get(name)!
      return {
        myRank: i + 1,
        name: p.name,
        school: p.school,
        position: p.position,
        consensusRank: p.consensusRank,
        consensusAvg: p.consensusAvg,
        numSources: p.numSources,
      }
    })
    const csvHeader = 'My Rank,Player,School,Position,Consensus Rank,Consensus Avg,# Sources'
    const csv = [
      csvHeader,
      ...rows.map(
        (r) =>
          `${r.myRank},"${r.name}","${r.school}",${r.position},${r.consensusRank ?? ''},${r.consensusAvg ?? ''},${r.numSources}`,
      ),
    ].join('\n')
    download('seths-draft-board.csv', csv, 'text/csv')
    download(
      'seths-draft-board.json',
      JSON.stringify({ exportedAt: new Date().toISOString(), board: rows }, null, 2),
      'application/json',
    )
    setNotice(
      'Downloaded CSV + JSON. This standalone copy does not write to the Google Sheet — paste the CSV into the Sheet as Source 11 (see README).',
    )
  }

  const progressPct =
    PLAYERS.length === 0 ? 0 : Math.round((board.length / 355) * 100)

  return (
    <div className="draft-tab">
      <div className="draft-layout">
        {/* ---- My board ---- */}
        <section className="panel board-panel" aria-label="My draft board">
          <div className="panel-head">
            <h2>My Board</h2>
            <span className="count">
              {board.length} / 355 ranked
            </span>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={board.length}
            aria-valuemin={0}
            aria-valuemax={355}
          >
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="board-actions">
            <button className="btn btn-dark" onClick={startFromConsensusTop50}>
              Start from consensus top 50
            </button>
            <button className="btn" onClick={clearBoard} disabled={board.length === 0}>
              Clear
            </button>
          </div>
          {board.length === 0 ? (
            <p className="empty-note">
              Tap a player in the name bank to place them at No. 1, then No. 2,
              and so on. Drag rows or use the arrows to reorder.
            </p>
          ) : (
            <ol className="board-list">
              {board.map((name, i) => {
                const p = byName.get(name)!
                const teamId = SCHOOL_TEAM_ID[p.school]
                return (
                  <li
                    key={name}
                    className="board-row"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragIndex === null || dragIndex === i) return
                      setBoard((b) => {
                        const next = [...b]
                        const [moved] = next.splice(dragIndex, 1)
                        next.splice(i, 0, moved)
                        return next
                      })
                      setDragIndex(null)
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    <span className="rank-num">{i + 1}</span>
                    <Logo
                      src={teamId ? logoUrlForTeamId(teamId) : null}
                      label={p.school}
                      size={34}
                    />
                    <span className="row-main">
                      <strong>{p.name}</strong>
                      <span className="row-sub">
                        {p.school} · {p.position}
                      </span>
                    </span>
                    <span className="row-cons">
                      {p.consensusRank !== null
                        ? `#${p.consensusRank} · avg ${p.consensusAvg?.toFixed(2)}`
                        : 'Unranked'}
                    </span>
                    <span className="row-btns">
                      <button
                        aria-label={`Move ${p.name} up`}
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move ${p.name} down`}
                        onClick={() => move(i, 1)}
                        disabled={i === board.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        aria-label={`Remove ${p.name}`}
                        onClick={() => removePlayer(name)}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
          <div className="submit-row">
            <button
              className="btn btn-dark btn-submit"
              onClick={submitBoard}
              disabled={board.length === 0}
            >
              Submit — download CSV + JSON
            </button>
            <button className="btn" onClick={exportAsText} disabled={board.length === 0}>
              Export as text list
            </button>
          </div>
          {notice && <p className="notice">{notice}</p>}
          {exportText && (
            <textarea
              className="export-box"
              readOnly
              value={exportText}
              rows={Math.min(20, board.length + 2)}
              aria-label="Exported text list"
            />
          )}
          <p className="fine-print">
            Submit does <strong>not</strong> write to the Google Sheet in this
            standalone copy — the live app's Sheet write (Source 11) is
            intentionally not replicated here, so no credentials live in this
            repo. Download the CSV and paste it into the Sheet as Source 11;
            the README has the steps.
          </p>
        </section>

        {/* ---- Name bank ---- */}
        <section className="panel bank-panel" aria-label="Player name bank">
          <div className="panel-head">
            <h2>Name bank</h2>
            <span className="count">{bank.length} players</span>
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search name or school…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search players"
          />
          <div className="pos-filters" role="group" aria-label="Filter by position">
            {['All', ...POSITIONS].map((pos) => (
              <button
                key={pos}
                className={posFilter === pos ? 'chip chip-active' : 'chip'}
                onClick={() => setPosFilter(pos)}
                aria-pressed={posFilter === pos}
              >
                {pos}
              </button>
            ))}
          </div>
          <ul className="bank-list">
            {bank.map((p) => {
              const teamId = SCHOOL_TEAM_ID[p.school]
              const placedAt = rankedSet.has(p.name)
                ? board.indexOf(p.name) + 1
                : null
              return (
                <li key={p.name}>
                  <button
                    className={placedAt ? 'bank-row placed' : 'bank-row'}
                    onClick={() =>
                      placedAt ? removePlayer(p.name) : placePlayer(p.name)
                    }
                    title={
                      placedAt
                        ? `Ranked #${placedAt} — tap to remove from your board`
                        : 'Tap to add to your board'
                    }
                  >
                    <Logo
                      src={teamId ? logoUrlForTeamId(teamId) : null}
                      label={p.school}
                      size={30}
                    />
                    <span className="row-main">
                      <strong>{p.name}</strong>
                      <span className="row-sub">
                        {p.school} · {p.position}
                      </span>
                    </span>
                    <span className="row-cons">
                      {p.consensusRank !== null
                        ? `#${p.consensusRank} · ${p.consensusAvg?.toFixed(2)}`
                        : '—'}
                      {placedAt ? ` · ✓ #${placedAt}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {bank.length === 0 && (
            <p className="empty-note">No players match that search / filter.</p>
          )}
        </section>
      </div>

      <details className="sources-details">
        <summary onClick={(e) => { e.preventDefault(); setShowSources((s) => !s) }}>
          {showSources ? 'Hide sources' : `Show the 16 consensus sources`}
        </summary>
        {showSources && (
          <table className="sources-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Source</th>
                <th>Type</th>
                <th>Date</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.number}>
                  <td>{s.number}</td>
                  <td>{s.name}</td>
                  <td>{s.type}</td>
                  <td>{s.date}</td>
                  <td>{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </details>
    </div>
  )
}
