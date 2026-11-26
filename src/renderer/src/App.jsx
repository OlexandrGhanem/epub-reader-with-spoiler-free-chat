// src/renderer/src/App.jsx  (replace the whole file)
import StatusGate from './components/StatusGate'
import Library from './components/Library'

export default function App() {
  return (
    <StatusGate>
      <h1 style={{ padding: 24 }}>Ollama is up and both models are installed ✓</h1>
      <Library onOpen={(id) => console.log(id)} /> 
    </StatusGate>
  )
}
