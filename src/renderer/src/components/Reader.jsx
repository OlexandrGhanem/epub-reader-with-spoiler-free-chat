// src/renderer/src/components/Reader.jsx
import { useEffect, useRef, useState } from 'react'
import { ReactReader } from 'react-reader'
import { extractChapters } from '../lib/extract'
import { resolveTocHref } from '../lib/toc'
import { useStore } from '../store'

const isCfi = (value) => typeof value === 'string' && value.startsWith('epubcfi(')

// Render as <Reader key={bookId} … /> so switching books starts from fresh state.
// eslint-disable-next-line react/prop-types
export default function Reader({ bookId, onBack }) {
  const [data, setData] = useState(null) // the EPUB bytes
  const [error, setError] = useState(null)
  const renditionRef = useRef(null)
  const currentCfiRef = useRef(null) // where the reader is now (for saving progress later)

  useEffect(() => {
    let active = true // ignore a late reply if bookId changed or we unmounted
    window.api.readBook(bookId).then(
      (u8) => {
        if (!active) return
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
    const { set } = useStore.getState()
    set({ chapters: [] }) // don't show the previous book's text meanwhile
    extractChapters(data).then(
      (chapters) => {
        if (!active) return
        set({ chapters })
        const total = chapters.reduce((sum, c) => sum + c.length, 0)
        console.log(`Extracted ${chapters.length} sections, ${total} characters`)
      },
      (err) => active && console.warn('Could not extract book text:', err)
    )
    return () => {
      active = false
    }
  }, [data])

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
          // Starting point only, never changed afterwards. Spine index 0 is the
          // book's real first page; without a location react-reader opens the
          // first TOC href, which has the same unresolved-path problem.
          // (When progress saving lands, pass the saved CFI here instead.)
          location={0}
          locationChanged={handleLocationChanged}
          errorView={<p style={{ padding: 24 }}>This EPUB could not be opened.</p>}
          getRendition={(rendition) => {
            renditionRef.current = rendition
            // Import already stores the OPF title/author; this corrects any
            // book whose metadata the simple import-time parser misread.
            rendition.book.loaded.metadata
              .then((m) => window.api.saveMeta({ id: bookId, title: m.title, author: m.creator }))
              .catch((err) => console.warn('Could not save book metadata:', err))
          }}
        />
      </div>
    </div>
  )
}
