// src/renderer/src/components/Library.jsx
import { useEffect, useState } from 'react'

const errorText = (err) => String(err?.message ?? err)

// eslint-disable-next-line react/prop-types
export default function Library({ onOpen }) {
  const [books, setBooks] = useState(null) // null = first load still running
  const [error, setError] = useState(null)
  const [importing, setImporting] = useState(false)

  const refresh = () =>
    window.api.listBooks().then(
      (rows) => {
        setBooks(rows)
        setError(null)
      },
      (err) => setError(errorText(err))
    )

  useEffect(() => {
    refresh()
  }, [])

  async function add() {
    setImporting(true)
    try {
      const result = await window.api.importBook()
      if (result) await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>My books</h1>
      <button onClick={add} disabled={importing}>
        {importing ? 'Importing…' : '+ Import EPUB'}
      </button>
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}
      {books === null && !error && <p>Loading…</p>}
      {books?.length === 0 && <p>No books yet. Import an EPUB to get started.</p>}
      <ul>
        {books?.map((b) => {
          const pct = b.total_chars
            ? Math.min(100, Math.round((100 * (b.max_pos || 0)) / b.total_chars))
            : 0
          return (
            <li key={b.id} style={{ margin: '12px 0' }}>
              <button onClick={() => onOpen(b.id)} style={{ all: 'unset', cursor: 'pointer' }}>
                <strong>{b.title}</strong> {b.author && <span>· {b.author}</span>}{' '}
                <em>({pct}% read)</em>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
