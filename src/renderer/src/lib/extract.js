// src/renderer/src/lib/extract.js
import ePub from 'epubjs'
import { resolveTocHref } from './toc'

// bytes: the same ArrayBuffer you give the reader
export async function extractChapters(bytes) {
  const book = ePub(bytes.slice(0)) // a separate copy, so the visible reader is untouched
  try {
    await book.ready
    const titles = tocTitlesBySpineIndex(book)
    const chapters = []
    let pos = 0
    for (const item of book.spine.spineItems) {
      let text = ''
      try {
        await item.load(book.load.bind(book))
        text = item.document?.body?.textContent ?? ''
        item.unload()
      } catch (err) {
        console.warn('Could not read section', item.href, err)
      }
      chapters.push({
        spineIndex: item.index,
        href: item.href,
        title: titles.get(item.index),
        startPos: pos,
        length: text.length,
        text
      })
      pos += text.length
    }
    return chapters
  } finally {
    book.destroy()
  }
}

// Maps each spine section to the label of the first TOC entry pointing into it.
// TOC hrefs go through the same path resolution as TOC clicks in the reader.
function tocTitlesBySpineIndex(book) {
  const titles = new Map()
  for (const entry of flatten(book.navigation?.toc ?? [])) {
    const target = resolveTocHref(book, entry.href)
    const section = target && book.spine.get(target.split('#')[0])
    const label = entry.label?.trim()
    if (section && label && !titles.has(section.index)) titles.set(section.index, label)
  }
  return titles
}

function flatten(items) {
  return items.flatMap((i) => [i, ...flatten(i.subitems ?? [])])
}
