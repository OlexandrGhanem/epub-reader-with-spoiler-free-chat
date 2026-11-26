// src/main/library.js
import { app, dialog } from 'electron'
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename, extname } from 'path'
import JSZip from 'jszip'
import { getDb } from './db'

const decodeXml = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '') // stray inline markup inside the element
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

// Reads <dc:title> / <dc:creator> from the EPUB's package (OPF) file.
// Never throws: on any problem it returns {} and the caller keeps its fallback.
export async function readEpubMeta(bytes) {
  try {
    const zip = await JSZip.loadAsync(bytes)
    const container = await zip.file('META-INF/container.xml')?.async('string')
    const opfPath = container?.match(/full-path\s*=\s*["']([^"']+)["']/)?.[1]
    const opf = opfPath && (await zip.file(decodeURIComponent(opfPath))?.async('string'))
    if (!opf) return {}
    const pick = (tag) => {
      const m = opf.match(new RegExp(`<dc:${tag}\\b[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'))
      return m ? decodeXml(m[1]) || null : null
    }
    return { title: pick('title'), author: pick('creator') }
  } catch {
    return {}
  }
}

// `parent` makes the file picker modal to the window that asked for it.
export async function importBook(parent) {
  const options = {
    properties: ['openFile'],
    filters: [{ name: 'EPUB', extensions: ['epub'] }]
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return null

  const source = result.filePaths[0]
  const bytes = await readFile(source)
  // same file -> same id, so importing twice doesn't duplicate it
  const id = createHash('sha1').update(bytes).digest('hex')

  const folder = join(app.getPath('userData'), 'books')
  await mkdir(folder, { recursive: true })
  const dest = join(folder, id + '.epub')
  await writeFile(dest, bytes)

  // Prefer the book's own metadata; fall back to the filename without its
  // extension, stripped case-insensitively ("Book.EPUB" -> "Book").
  const meta = await readEpubMeta(bytes)
  const title = meta.title || basename(source, extname(source))
  getDb()
    .prepare(
      'INSERT OR IGNORE INTO books (id, title, author, file_path, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(id, title, meta.author ?? null, dest, Date.now())
  return { bookId: id }
}

export function listBooks() {
  return getDb()
    .prepare(
      `SELECT b.id, b.title, b.author, b.total_chars, p.max_pos
       FROM books b LEFT JOIN progress p ON p.book_id = b.id
       ORDER BY b.created_at DESC`
    )
    .all()
}

export async function readBook(id) {
  const row = getDb().prepare('SELECT file_path FROM books WHERE id = ?').get(id)
  if (!row) throw new Error(`Book not found: ${id}`)
  return readFile(row.file_path) // arrives in the renderer as a Uint8Array
}

// Omitted fields keep their current value, so { id, title } alone is a valid update.
export function updateMeta(id, title, author) {
  const { changes } = getDb()
    .prepare(
      'UPDATE books SET title = COALESCE(?, title), author = COALESCE(?, author) WHERE id = ?'
    )
    .run(title ?? null, author ?? null, id)
  if (!changes) throw new Error(`Book not found: ${id}`)
  return true
}

// One-time fix-up for books imported before import read the EPUB metadata:
// fills in title/author for rows with no author yet. Runs once per database,
// tracked in the settings table, so books that truly have no author aren't
// rescanned on every launch.
const BACKFILL_KEY = 'meta_backfill_v1'

export async function backfillMeta() {
  const db = getDb()
  if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(BACKFILL_KEY)) return

  const rows = db.prepare('SELECT id, file_path FROM books WHERE author IS NULL').all()
  for (const { id, file_path } of rows) {
    try {
      const { title, author } = await readEpubMeta(await readFile(file_path))
      if (title || author) updateMeta(id, title, author)
    } catch (err) {
      console.warn(`Metadata backfill skipped ${id}:`, err?.message ?? err)
    }
  }
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(BACKFILL_KEY, '1')
}
