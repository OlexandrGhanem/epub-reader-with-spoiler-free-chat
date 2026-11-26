// src/renderer/src/lib/position.js
export function globalOffsetFromLocation(rendition, location, chapters) {
  const { index, cfi, displayed } = location.end // the END of the visible page
  const chapter = chapters.find((c) => c.spineIndex === index)
  if (!chapter) return 0
  const contents = rendition.getContents().find((c) => c.sectionIndex === index)
  let local
  try {
    const end = contents.range(cfi)
    const before = contents.document.createRange()
    before.setStart(contents.document.body, 0)
    before.setEnd(end.endContainer, end.endOffset)
    local = before.toString().length // characters from chapter start to here
  } catch {
    // backup plan: estimate from the page number inside the chapter
    local = Math.round(chapter.length * (displayed.page / (displayed.total || 1)))
  }
  return chapter.startPos + Math.min(local, chapter.length)
}
