// src/main/db.js
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

// Each entry upgrades the schema by one version. Never edit a shipped entry;
// append a new one instead so existing databases migrate forward.
const MIGRATIONS = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY, title TEXT, author TEXT, file_path TEXT,
    total_chars INTEGER, embed_model TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS chapters (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    spine_index INTEGER NOT NULL, href TEXT, title TEXT,
    start_pos INTEGER, length INTEGER,
    PRIMARY KEY (book_id, spine_index)
  );
  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    spine_index INTEGER, start_pos INTEGER, end_pos INTEGER,
    text TEXT, embedding BLOB
  );
  CREATE INDEX IF NOT EXISTS chunks_gate ON chunks (book_id, end_pos);

  -- External-content FTS table: it stores no text itself, so it must be kept
  -- in sync with "chunks" via triggers or searches return nothing / garbage.
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
    USING fts5 (text, content='chunks', content_rowid='id');
  CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts (rowid, text) VALUES (new.id, new.text);
  END;
  CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts (chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
  END;
  CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE OF text ON chunks
  WHEN old.text IS NOT new.text
  BEGIN
    INSERT INTO chunks_fts (chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO chunks_fts (rowid, text) VALUES (new.id, new.text);
  END;

  CREATE TABLE IF NOT EXISTS progress (
    book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    cfi TEXT, current_pos INTEGER, max_pos INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    role TEXT, content TEXT, pos_at_ask INTEGER, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS messages_book ON messages (book_id, created_at);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT
  );
  `
]

let db

function migrate(conn) {
  const current = conn.pragma('user_version', { simple: true })
  for (let v = current; v < MIGRATIONS.length; v++) {
    // all-or-nothing per version: either the whole step applies, or none of it
    conn.transaction(() => {
      conn.exec(MIGRATIONS[v])
      conn.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function getDb() {
  if (db) return db
  const file = join(app.getPath('userData'), 'reader.db')
  const conn = new Database(file)
  try {
    conn.pragma('journal_mode = WAL')
    conn.pragma('foreign_keys = ON') // off by default in SQLite, per connection
    // Without this, rows removed by INSERT OR REPLACE skip DELETE triggers,
    // leaving stale entries in chunks_fts. (Cascade deletes fire them anyway.)
    conn.pragma('recursive_triggers = ON')
    migrate(conn)
  } catch (err) {
    conn.close()
    throw err
  }
  db = conn
  // 'quit' fires after every 'before-quit'/'will-quit' handler has run,
  // so last-moment writes (e.g. saving progress) still have an open connection.
  app.once('quit', closeDb)
  return db
}

export function closeDb() {
  if (!db) return
  db.close()
  db = undefined
}
