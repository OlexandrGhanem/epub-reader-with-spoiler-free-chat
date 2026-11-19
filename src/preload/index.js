import { contextBridge, ipcRenderer } from 'electron'

// helper: listen to an event from main; returns a function that stops listening
// eslint-disable-next-line no-unused-vars
const on = (channel) => (callback) => {
  const handler = (_event, data) => callback(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('api', {
  status: () => ipcRenderer.invoke('system:status')
  // you will add one line here for every new channel
})
