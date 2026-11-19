import { ipcMain } from 'electron'
import { checkStatus } from './llm'

export function registerIpc() {
  ipcMain.handle('system:status', () => checkStatus())
  // every new channel you build later goes in this function
}
