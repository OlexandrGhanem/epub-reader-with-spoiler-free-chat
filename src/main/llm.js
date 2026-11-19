import { Ollama } from 'ollama'

export const ollama = new Ollama({ host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' })
export const EMBED_MODEL = 'nomic-embed-text'
export const CHAT_MODEL = 'llama3.1:8b'

// Ollama lists untagged models as "name:latest", so treat "x" and "x:latest" as the same model.
const normalize = (name) => (name.includes(':') ? name : `${name}:latest`)

export async function checkStatus() {
  try {
    const { models } = await ollama.list()
    const names = new Set(models.map((m) => normalize(m.name)))
    const missing = [EMBED_MODEL, CHAT_MODEL].filter((n) => !names.has(normalize(n)))
    return { ollamaUp: true, missing }
  } catch {
    return { ollamaUp: false, missing: [EMBED_MODEL, CHAT_MODEL] }
  }
}
