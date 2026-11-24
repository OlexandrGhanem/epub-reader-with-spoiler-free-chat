import { useEffect, useState } from 'react'

// Resolves to { status } or { error } — never rejects.
const fetchStatus = () =>
  window.api.status().then(
    (status) => ({ status, error: null }),
    (err) => ({ status: null, error: String(err?.message ?? err) })
  )

// eslint-disable-next-line react/prop-types
export default function StatusGate({ children }) {
  const [result, setResult] = useState(null) // null = first check still running
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    fetchStatus().then((r) => {
      if (!active) return
      setResult(r)
      setChecking(false)
    })
    return () => {
      active = false
    }
  }, [])

  const retry = async () => {
    setChecking(true)
    setResult(await fetchStatus())
    setChecking(false)
  }

  const retryButton = (
    <button onClick={retry} disabled={checking}>
      {checking ? 'Checking…' : 'Retry'}
    </button>
  )

  if (!result) return <p style={{ padding: 24 }}>Checking Ollama…</p>
  const { status, error } = result
  if (error)
    return (
      <div style={{ padding: 24 }}>
        <h2>Could not check Ollama</h2>
        <pre>{error}</pre>
        {retryButton}
      </div>
    )
  if (!status.ollamaUp)
    return (
      <div style={{ padding: 24 }}>
        <h2>Ollama is not running</h2>
        <p>Install it from ollama.com and open it, then click retry.</p>
        {retryButton}
      </div>
    )
  if (status.missing.length)
    return (
      <div style={{ padding: 24 }}>
        <h2>Missing models</h2>
        {status.missing.map((m) => (
          <pre key={m}>ollama pull {m}</pre>
        ))}
        {retryButton}
      </div>
    )
  return children
}
