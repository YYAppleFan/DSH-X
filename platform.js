import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = dirname(fileURLToPath(import.meta.url))

export function stateDirectory(platform = process.platform, home = homedir(), appData = process.env.APPDATA) {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'DSH-X')
  return appData ? join(appData, 'DSH') : join(ROOT, 'data')
}

export const STATE_DIR = stateDirectory()

export function plistEscape(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[c])
}
