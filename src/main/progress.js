import { getDb } from './db'
 
export function saveProgress({ bookId, cfi, pos }) {
  const db = getDb()
  db.prepare(`
    INSERT INTO progress (book_id, cfi, current_pos, max_pos, updated_at)
    VALUES (@bookId, @cfi, @pos, @pos, @now)
    ON CONFLICT(book_id) DO UPDATE SET
      cfi = @cfi, current_pos = @pos,
      max_pos = MAX(max_pos, @pos), updated_at = @now`
  ).run({ bookId, cfi, pos, now: Date.now() })
  return db.prepare('SELECT max_pos AS maxPos FROM progress WHERE book_id = ?').get(bookId)
}
 
export function getProgress(bookId) {
  return getDb()
    .prepare('SELECT cfi, current_pos AS pos, max_pos AS maxPos FROM progress WHERE book_id = ?')
    .get(bookId) ?? null
}

