import { contextBridge, ipcRenderer } from 'electron'

// helper: listen to an event from main; returns a function that stops listening
// eslint-disable-next-line no-unused-vars
const on = (channel) => (callback) => {
  const handler = (_event, data) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  status: () => ipcRenderer.invoke('system:status'),
  importBook: () => ipcRenderer.invoke('library:import'),
  listBooks: () => ipcRenderer.invoke('library:list'),
  readBook: (id) => ipcRenderer.invoke('book:read', id),
  // args: { id, title?, author? }
  saveMeta: (args) => ipcRenderer.invoke('book:meta', args),
  // args: { id, total }
  saveTotalChars: (args) => ipcRenderer.invoke('book:totalChars', args),
  saveProgress: (args) => ipcRenderer.invoke('progress:save', args),
  getProgress: (id) => ipcRenderer.invoke('progress:get', id)
  // you will add one line here for every new channel
})
