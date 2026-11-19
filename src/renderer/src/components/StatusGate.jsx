import { useEffect, useState } from 'react'

// Blocks the app until Ollama is reachable and the required models are pulled.
// eslint-disable-next-line react/prop-types -- React 19 ignores propTypes
export default function StatusGate({ children }) {
  const [status, setStatus] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState(null)

  // Resolves to the state update to apply; never rejects, so the gate can't hang on "Checking…".
  const fetchStatus = () =>
    window.api.status().then(
      (s) => () => {
        setStatus(s)
        setError(null)
        setChecking(false)
      },
      (err) => () => {
        setError(err?.message ?? String(err))
        setChecking(false)
      }
    )

  useEffect(() => {
    let alive = true
    fetchStatus().then((apply) => alive && apply())
    return () => {
      alive = false
    }
  }, [])

  const check = () => {
    setChecking(true)
    fetchStatus().then((apply) => apply())
  }

  const retry = (
    <button onClick={check} disabled={checking}>
      {checking ? 'Checking…' : 'Retry'}
    </button>
  )

  if (error)
    return (
      <div style={{ padding: 24 }}>
        <h2>Could not check Ollama status</h2>
        <pre>{error}</pre>
        {retry}
      </div>
    )
  if (!status) return <p style={{ padding: 24 }}>Checking Ollama…</p>
  if (!status.ollamaUp)
    return (
      <div style={{ padding: 24 }}>
        <h2>Ollama is not running</h2>
        <p>Install it from ollama.com and open it, then click retry.</p>
        {retry}
      </div>
    )
  if (status.missing.length)
    return (
      <div style={{ padding: 24 }}>
        <h2>Missing models</h2>
        <p>Run these in a terminal, then click retry:</p>
        {status.missing.map((m) => (
          <pre key={m}>ollama pull {m}</pre>
        ))}
        {retry}
      </div>
    )
  return children
}
