import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { stateDirectory, plistEscape } from '../platform.js'

test('macOS state stays outside the application bundle', () => {
  assert.equal(stateDirectory('darwin', '/Users/test', '/wrong'), '/Users/test/Library/Application Support/DSH-X')
  assert.equal(stateDirectory('win32', '/unused', '/roaming'), '/roaming/DSH')
})

test('LaunchAgent paths escape XML special characters', () => {
  assert.equal(plistEscape('/Users/A&B/<test>/"app"'), '/Users/A&amp;B/&lt;test&gt;/&quot;app&quot;')
})

test('settings use a writable macOS location and login registration is reversible', { skip: process.platform !== 'darwin' }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-x-settings-'))
  try {
    const code = `
      import assert from 'node:assert/strict';
      import { readFile } from 'node:fs/promises';
      import { join } from 'node:path';
      import { fallbackDataDir, saveSettings, loadSettings, setAutoStart, autoStartEnabled } from './settings.js';
      assert.equal(fallbackDataDir(), join(process.env.HOME, 'Library/Application Support/DSH-X/data'));
      await saveSettings({ seedMarket: false });
      assert.equal((await loadSettings()).seedMarket, false);
      await setAutoStart(true);
      assert.equal(await autoStartEnabled(), true);
      const plist = await readFile(join(process.env.HOME, 'Library/LaunchAgents/local.dsh-x.launcher.plist'), 'utf8');
      assert.ok(plist.includes('A&amp;B'));
      await setAutoStart(false);
      assert.equal(await autoStartEnabled(), false);
    `
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, HOME: home, DSH_APP_EXECUTABLE: '/Applications/A&B.app/Contents/MacOS/DSH' },
      stdio: 'inherit',
    })
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`settings test exited ${code}`))))
    })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('management HTTP lifecycle and Windows updater isolation', { skip: process.platform === 'win32', timeout: 15000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-x-http-'))
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { startServer, stopAll } from './server.js';
    try {
      await startServer();
      const base = 'http://127.0.0.1:' + process.env.PORT;
      const page = await fetch(base + '/');
      assert.equal(page.status, 200);
      assert.match(await page.text(), /<html/i);
      const state = await (await fetch(base + '/api/state')).json();
      assert.equal(state.dataDir, process.env.DSH_VERSIONS_DATA);
      const update = await (await fetch(base + '/api/self')).json();
      assert.equal(update.update, false);
      assert.equal(update.manual, true);
      for (const route of ['/api/self/download', '/api/self/install']) {
        const response = await fetch(base + route, { method: 'POST', body: '{}' });
        assert.equal(response.status, 500);
        assert.match((await response.json()).error, /手动安装/);
      }
    } finally { await stopAll(); }
  `,
    ],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, HOME: home, APPDATA: home, DSH_VERSIONS_DATA: join(home, 'versions'), PORT: '39783' },
      stdio: 'inherit',
    },
  )
  try {
    await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`HTTP test exited ${code}`))))
    })
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
    await rm(home, { recursive: true, force: true })
  }
})
