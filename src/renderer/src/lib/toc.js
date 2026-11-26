// src/renderer/src/lib/toc.js

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
export function resolveTocHref(book, href) {
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
