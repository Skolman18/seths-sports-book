import { useState } from 'react'
import { DraftBoard } from './DraftBoard'
import { Top25 } from './Top25'

export function App() {
  const [tab, setTab] = useState<'draft' | 'top25'>('draft')
  return (
    <div className="app">
      <a className="back-home" href="../">← Back to Home</a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-badge">SSB</span>
          <div>
            <h1>Seth&rsquo;s Sports Book</h1>
            <p className="tagline">
              2027 NFL Draft consensus board &middot; College Football Top 25 builder
            </p>
          </div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sports Book sections">
          <button
            role="tab"
            aria-selected={tab === 'draft'}
            className={tab === 'draft' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('draft')}
          >
            NFL Draft Board
          </button>
          <button
            role="tab"
            aria-selected={tab === 'top25'}
            className={tab === 'top25' ? 'tab tab-active' : 'tab'}
            onClick={() => setTab('top25')}
          >
            College Football Top 25
          </button>
        </nav>
      </header>
      <main>
        {tab === 'draft' ? <DraftBoard /> : <Top25 />}
      </main>
      <footer className="app-footer">
        Standalone twin of the hosted “my-big-board-ranker” app. Draft data is
        a Nov 25, 2026 snapshot of the Google Sheet; the Top 25 loads the live
        CFP rankings (AP poll before they start) from ESPN at runtime. Nothing
        here writes to the Sheet.
      </footer>
    </div>
  )
}
