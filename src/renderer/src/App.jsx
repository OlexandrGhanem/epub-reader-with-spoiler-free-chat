// src/renderer/src/App.jsx
import { useState } from 'react'
import StatusGate from './components/StatusGate'
import Library from './components/Library'
import Reader from './components/Reader'

export default function App() {
  const [openBookId, setOpenBookId] = useState(null)
  return (
    <StatusGate>
      {openBookId ? (
        // key: a different book remounts Reader with fresh state
        <Reader key={openBookId} bookId={openBookId} onBack={() => setOpenBookId(null)} />
      ) : (
        <Library onOpen={setOpenBookId} />
      )}
    </StatusGate>
  )
}
