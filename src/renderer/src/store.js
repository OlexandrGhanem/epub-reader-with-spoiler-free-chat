// src/renderer/src/store.js
import { create } from 'zustand'

export const useStore = create((set) => ({
  chapters: [], // [{ spineIndex, href, title, startPos, length, text }]
  pos: 0, // global character offset of the last visible character
  maxPos: 0, // furthest position ever reached
  selection: null, // text the reader highlighted
  chatOpen: false, // whether the chat panel is open
  index: null, // { done, total, ready }
  set: (patch) => set(patch)
}))
