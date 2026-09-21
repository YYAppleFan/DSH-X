import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'

const app = resolve(process.argv[2])
const home = await mkdtemp(join(tmpdir(), 'dsh-x-smoke-'))
const base = 'http://127.0.0.1:3780'
try {
  await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(500) })
  throw new Error('Smoke test requires port 3780 to be free')
} catch (e) {
  if (e.message === 'Smoke test requires port 3780 to be free') throw e
}
const child = spawn(join(app, 'Contents/MacOS/DSH'), [], {
  env: { ...process.env, HOME: home, DSH_VERSIONS_DATA: join(home, 'versions') },
  stdio: 'inherit',
})
let exited = false
let exitCode
let spawnError
child.on('error', (e) => {
  spawnError = e
  exited = true
})
child.on('exit', (code) => {
  exited = true
  exitCode = code
})
child.on('close', (code) => {
  exited = true
  if (exitCode === undefined) exitCode = code
})
try {
  let ready = false
  for (let i = 0; i < 80 && !exited; i++) {
    try {
      const res = await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        await res.json()
        ready = true
        break
      }
    } catch {
      /* waiting for application startup */
    }
    await delay(250)
  }
  if (spawnError) throw spawnError
  assert.ok(ready, `App did not start its backend; exit=${exitCode}`)
  const page = await fetch(`${base}/`)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /<html/i)
  await access(join(home, 'Library/Application Support/DSH-X'))
  const quit = await fetch(`${base}/api/quit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  assert.equal(quit.status, 200)
  await quit.json()
  for (let i = 0; i < 80 && !exited; i++) {
    try {
      process.kill(child.pid, 0)
    } catch {
      exited = true
      if (exitCode === undefined) exitCode = 0
      break
    }
    await delay(250)
  }
  assert.ok(exited, 'App did not exit after backend shutdown')
  console.log('App launch, HTTP management page, writable state and quit passed.')
} finally {
  if (!exited) child.kill('SIGTERM')
  await rm(home, { recursive: true, force: true })
}
