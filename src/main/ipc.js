import { ipcMain, BrowserWindow } from 'electron'
import { checkStatus } from './llm'
import { importBook, listBooks, readBook, updateMeta } from './library'
import { saveProgress, getProgress } from './progress'

export function registerIpc() {
  ipcMain.handle('system:status', () => checkStatus())
  ipcMain.handle('library:import', (e) => importBook(BrowserWindow.fromWebContents(e.sender)))
  ipcMain.handle('library:list', () => listBooks())
  ipcMain.handle('book:read', (_e, id) => readBook(id))
  ipcMain.handle('book:meta', (_e, { id, title, author } = {}) => updateMeta(id, title, author))
  ipcMain.handle('progress:save', (_e, args) => saveProgress(args))
  ipcMain.handle('progress:get', (_e, id) => getProgress(id))

  // every new channel you build later goes in this function
}
