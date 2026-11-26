// src/renderer/src/components/Reader.jsx
import { useEffect, useRef, useState } from 'react'
import { ReactReader } from 'react-reader'

const isCfi = (value) => typeof value === 'string' && value.startsWith('epubcfi(')

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// TOC hrefs are written relative to the TOC file (nav.xhtml / toc.ncx), but the
// spine is keyed by paths relative to the package file (content.opf). When the
// two live in different folders a raw TOC href matches nothing and epub.js
// throws "No Section Found". Returns a spine-resolvable target, or null.
function resolveTocHref(book, href) {
  const spine = book?.spine
  if (!spine || typeof href !== 'string') return null
  const hashAt = href.indexOf('#')
  const file = hashAt === -1 ? href : href.slice(0, hashAt)
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  if (!file) return null // a bare "#id" points inside the TOC file itself

  const navPath = book.packaging?.navPath || book.packaging?.ncxPath || ''
  const candidates = []
  try {
    // dummy origin: we only want URL's relative-path resolution ("../", "./")
    candidates.push(new URL(file, 'http://book/' + navPath).pathname.slice(1))
  } catch {
    // malformed href: fall through to trying it as-is
  }
  candidates.push(file)

  for (const candidate of candidates) {
    for (const key of [candidate, safeDecode(candidate)]) {
      if (spine.get(key)) return key + hash
    }
  }
  return null
}

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
          }}
        />
      </div>
    </div>
  )
}
