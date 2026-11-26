// src/renderer/src/components/Reader.jsx
import { useEffect, useRef, useState } from 'react'
import { ReactReader } from 'react-reader'
import { extractChapters } from '../lib/extract'
import { resolveTocHref } from '../lib/toc'
import { useStore } from '../store'
import { globalOffsetFromLocation } from '../lib/position'

const isCfi = (value) => typeof value === 'string' && value.startsWith('epubcfi(')

// Debounced progress saving. Each Reader gets its own saver, so switching books
// can't cancel another book's pending save or write its maxPos into the store.
function createProgressSaver() {
  let timer = null
  let pending = null // latest unsaved { bookId, cfi, pos }
  let active = true // false once the Reader unmounts

  function flush() {
    clearTimeout(timer)
    const args = pending
    pending = null
    if (!args) return
    window.api.saveProgress(args).then(
      ({ maxPos }) => {
        if (!active) return // book closed; its maxPos doesn't belong in the store
        // A page turn during the round trip may already have raised maxPos.
        const { maxPos: current, set } = useStore.getState()
        set({ maxPos: Math.max(maxPos, current) })
      },
      (err) => console.warn('Could not save reading progress:', err)
    )
  }

  return {
    schedule(args) {
      pending = args
      clearTimeout(timer)
      timer = setTimeout(flush, 1000) // only save after 1 s without page turns
    },
    start() {
      active = true
    },
    // save whatever is pending right away, then ignore late replies
    stop() {
      active = false
      flush()
    }
  }
}

// Render as <Reader key={bookId} … /> so switching books starts from fresh state.
// eslint-disable-next-line react/prop-types
export default function Reader({ bookId, onBack }) {
  const [data, setData] = useState(null) // the EPUB bytes
  const [error, setError] = useState(null)
  const renditionRef = useRef(null)
  const currentCfiRef = useRef(null) // where the reader is now (for saving progress later)
  const [saver] = useState(createProgressSaver)

  useEffect(() => {
    saver.start() // StrictMode remounts after a stop(), so re-arm here
    return () => saver.stop()
  }, [saver])

  const [location, setLocation] = useState(0) // initial position only, never updated later

  useEffect(() => {
    let active = true // ignore a late reply if bookId changed or we unmounted
    Promise.all([window.api.readBook(bookId), window.api.getProgress(bookId)]).then(
      ([u8, saved]) => {
        if (!active) return
        // reset here, not in the extraction effect, so the saved maxPos survives
        useStore.getState().set({ chapters: [], pos: saved?.pos ?? 0, maxPos: saved?.maxPos ?? 0 })
        if (saved?.cfi) setLocation(saved.cfi)
        // epub.js wants a plain ArrayBuffer, not a Uint8Array
        setData(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength))
      },
      (err) => active && setError(String(err?.message ?? err))
    )
    return () => {
      active = false
    }
  }, [bookId])

  useEffect(() => {
    if (!data) return
    let active = true // drop the result if the book changed or we unmounted
    extractChapters(data).then(
      (chapters) => {
        if (!active) return
        useStore.getState().set({ chapters })
        const total = chapters.reduce((sum, c) => sum + c.length, 0)
        console.log(`Extracted ${chapters.length} sections, ${total} characters`)
        // the Library's "% read" divides max_pos by this
        window.api
          .saveTotalChars({ id: bookId, total })
          .catch((err) => console.warn('Could not save book length:', err))
      },
      (err) => active && console.warn('Could not extract book text:', err)
    )
    return () => {
      active = false
    }
  }, [data, bookId])

  // react-reader calls this for two different things:
  //  - a CFI, reporting where the reader moved to (page turns, swipes)
  //  - a raw TOC href, when the user clicks a table-of-contents entry
  // Page turns are only recorded. Feeding them back as the `location` prop would
  // race the reader: a stale CFI arriving after a newer page turn jumps it back.
  // TOC jumps are resolved and sent to the rendition directly.
  function handleLocationChanged(value) {
    if (isCfi(value)) {
      currentCfiRef.current = value
      return
    }
    const rendition = renditionRef.current
    const target = resolveTocHref(rendition?.book, value)
    if (!target) {
      console.warn('TOC entry is not in the book spine, ignoring:', value)
      return
    }
    rendition.display(target).catch((err) => console.warn('Could not open TOC entry:', err))
  }

  const backButton = (
    <div style={{ padding: 8 }}>
      <button onClick={onBack}>← Library</button>
    </div>
  )

  if (error)
    return (
      <div>
        {backButton}
        <div style={{ padding: 24 }}>
          <h2>Could not open this book</h2>
          <pre>{error}</pre>
        </div>
      </div>
    )

  if (!data) return <p style={{ padding: 24 }}>Loading book…</p>

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {backButton}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <ReactReader
          url={data}
          // Starting point only, never changed afterwards: the saved CFI, or spine
          // index 0 (the book's real first page) for a new book. Without a
          // location react-reader opens the first TOC href, which has the same
          // unresolved-path problem.
          location={location}
          locationChanged={handleLocationChanged}
          errorView={<p style={{ padding: 24 }}>This EPUB could not be opened.</p>}
          getRendition={(rendition) => {
            renditionRef.current = rendition
            // Import already stores the OPF title/author; this corrects any
            // book whose metadata the simple import-time parser misread.
            rendition.book.loaded.metadata
              .then((m) => window.api.saveMeta({ id: bookId, title: m.title, author: m.creator }))
              .catch((err) => console.warn('Could not save book metadata:', err))
            rendition.on('relocated', (loc) => {
              const { chapters, maxPos, set } = useStore.getState()
              if (!chapters.length) return
              const pos = globalOffsetFromLocation(rendition, loc, chapters)
              set({ pos, maxPos: Math.max(pos, maxPos) })
              saver.schedule({ bookId, cfi: loc.start.cfi, pos })
            })
          }}
        />
        <PosBadge />
      </div>
    </div>
  )
}

function PosBadge() {
  const pos = useStore((s) => s.pos)
  return (
    // zIndex: react-reader's page area is zIndex 1 with a white background
    <div
      style={{
        position: 'absolute',
        right: 8,
        bottom: 8,
        zIndex: 2,
        fontSize: 12,
        opacity: 0.6,
        pointerEvents: 'none' // don't block clicks on the page underneath
      }}
    >
      pos {pos}
    </div>
  )
}
