// src/main/library.js
import { app, dialog } from 'electron'
import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename, extname } from 'path'
import { getDb } from './db'

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

  // strip the extension case-insensitively ("Book.EPUB" -> "Book")
  const title = basename(source, extname(source))
  getDb()
    .prepare('INSERT OR IGNORE INTO books (id, title, file_path, created_at) VALUES (?, ?, ?, ?)')
    .run(id, title, dest, Date.now())
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
