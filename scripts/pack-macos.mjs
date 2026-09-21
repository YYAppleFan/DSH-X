import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { plistEscape } from '../platform.js'

if (process.platform !== 'darwin') throw new Error('macOS packaging requires a Mac or a macOS CI runner.')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const arch = process.arch
if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`)
const nodeVersion = process.env.DSH_NODE_VERSION || '22.19.0'
if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) throw new Error('Invalid Node version')

const vendor = join(root, 'vendor')
const release = join(root, 'release')
const app = join(release, 'DSH-X.app')
const contents = join(app, 'Contents')
const appRoot = join(contents, 'Resources', 'app')
const runtimeName = `node-v${nodeVersion}-darwin-${arch}`
const archiveName = `${runtimeName}.tar.gz`
const archivePath = join(vendor, archiveName)
const shasumsPath = join(vendor, 'SHASUMS256.txt')

function run(cmd, args, cwd = root) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${cmd} exited ${result.status}`)
}

await mkdir(vendor, { recursive: true })
await mkdir(release, { recursive: true })

const base = `https://nodejs.org/dist/v${nodeVersion}`
let needDownload = true

if (existsSync(archivePath) && existsSync(shasumsPath)) {
  const sumLine = (await readFile(shasumsPath, 'utf8'))
    .split('\n')
    .find((line) => line.trim().split(/\s+/)[1] === archiveName)
  const actual = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  if (sumLine && sumLine.split(/\s+/)[0] === actual) {
    needDownload = false
  }
}

if (needDownload) {
  console.log(`Downloading Node.js v${nodeVersion} darwin-${arch}...`)
  run('curl', ['--fail', '--location', '--retry', '3', '-o', archivePath, `${base}/${archiveName}`])
  run('curl', ['--fail', '--location', '--retry', '3', '-o', shasumsPath, `${base}/SHASUMS256.txt`])
  const sumLine = (await readFile(shasumsPath, 'utf8'))
    .split('\n')
    .find((line) => line.trim().split(/\s+/)[1] === archiveName)
  const actual = createHash('sha256').update(await readFile(archivePath)).digest('hex')
  if (!sumLine || sumLine.split(/\s+/)[0] !== actual) throw new Error('Node archive checksum mismatch')
}

const runtime = join(vendor, runtimeName)
if (!existsSync(runtime)) {
  console.log(`Extracting ${archiveName}...`)
  run('tar', ['-xzf', archivePath, '-C', vendor])
}

console.log('Building Rust launcher for macOS...')
run('cargo', ['build', '--release', '--locked'], join(root, 'launcher'))
run('cargo', ['test', '--locked'], join(root, 'launcher'))

console.log('Assembling DSH-X.app...')
await rm(app, { recursive: true, force: true })
await mkdir(join(contents, 'MacOS'), { recursive: true })
await mkdir(join(contents, 'Resources'), { recursive: true })
await mkdir(appRoot, { recursive: true })

// Use macOS standard squircle AppIcon.icns (supports DSH_DARK_ICON=1 for dark icon default)
const useDarkIcon = process.env.DSH_DARK_ICON === '1'
const appIcon = join(root, 'assets', useDarkIcon ? 'AppIcon-dark.icns' : 'AppIcon.icns')
if (existsSync(appIcon)) {
  await cp(appIcon, join(contents, 'Resources', 'AppIcon.icns'))
}
const darkIcon = join(root, 'assets', 'AppIcon-dark.icns')
if (existsSync(darkIcon)) {
  await cp(darkIcon, join(contents, 'Resources', 'AppIcon-dark.icns'))
}

// Bundle modern macOS Tahoe AppIcon.icon package
const iconPackage = join(root, 'assets', 'AppIcon.icon')
if (existsSync(iconPackage)) {
  await cp(iconPackage, join(contents, 'Resources', 'AppIcon.icon'), { recursive: true })
}

for (const file of [
  'platform.js',
  'start.js',
  'server.js',
  'registry.js',
  'settings.js',
  'plugins.js',
  'plugin-tool.js',
  'stdio-unblock.cjs',
  'package.json',
  'LICENSE',
]) {
  await cp(join(root, file), join(appRoot, file))
}

for (const folder of ['public', 'assets', 'perf', 'compat']) {
  await cp(join(root, folder), join(appRoot, folder), { recursive: true })
}

const nodeDir = join(appRoot, 'node')
await mkdir(join(nodeDir, 'node_modules'), { recursive: true })
await cp(join(runtime, 'bin', 'node'), join(nodeDir, 'node'))
await cp(join(runtime, 'LICENSE'), join(nodeDir, 'LICENSE'))

console.log('Installing bundled pnpm...')
run(join(nodeDir, 'node'), [
  join(runtime, 'lib/node_modules/npm/bin/npm-cli.js'),
  'install',
  '--prefix',
  nodeDir,
  '--registry=https://registry.npmmirror.com',
  '--no-audit',
  '--no-fund',
  '--ignore-scripts',
  'pnpm@8.15.9',
])

await cp(join(runtime, 'lib', 'node_modules', 'npm'), join(nodeDir, 'node_modules', 'npm'), { recursive: true })

for (const [name, cli] of Object.entries({
  npm: 'npm/bin/npm-cli.js',
  npx: 'npm/bin/npx-cli.js',
  pnpm: 'pnpm/bin/pnpm.cjs',
  pnpx: 'pnpm/bin/pnpx.cjs',
})) {
  await writeFile(join(nodeDir, name), `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/node_modules/${cli}" "$@"\n`, { mode: 0o755 })
}

await cp(join(root, 'launcher/target/release/DSH'), join(contents, 'MacOS', 'DSH'))
await chmod(join(contents, 'MacOS', 'DSH'), 0o755)

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
await writeFile(
  join(contents, 'Info.plist'),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>DSH</string>
<key>CFBundleIdentifier</key><string>local.dsh-x.launcher</string>
<key>CFBundleName</key><string>DSH-X</string>
<key>CFBundleDisplayName</key><string>DSH-X</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundleIconName</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>${plistEscape(pkg.version)}</string>
<key>CFBundleVersion</key><string>${plistEscape(pkg.version)}</string>
<key>LSMinimumSystemVersion</key><string>11.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`,
)
run('plutil', ['-lint', join(contents, 'Info.plist')])

const xcassets = join(root, 'assets', 'AppIcon.xcassets')
try {
  const actoolCheck = spawnSync('which', ['actool'])
  if (actoolCheck.status === 0) {
    const actoolArgs = [
      '--compile',
      join(contents, 'Resources'),
      '--platform',
      'macosx',
      '--minimum-deployment-target',
      '11.0',
      '--target-device',
      'mac',
      '--app-icon',
      'AppIcon',
    ]
    if (existsSync(iconPackage)) actoolArgs.push(iconPackage)
    if (existsSync(xcassets)) actoolArgs.push(xcassets)
    run('actool', actoolArgs)
  }
} catch {
  // actool requires full Xcode; AppIcon.icon package and fallback icns are bundled for macOS Tahoe
}

console.log('Codesigning bundle...')
run('codesign', ['--force', '--sign', '-', join(nodeDir, 'node')])
run('codesign', ['--force', '--sign', '-', app])
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app])

console.log('Verifying bundled Node and running tests...')
run(join(nodeDir, 'node'), ['--version'])
run(join(nodeDir, 'node'), ['--test', join(root, 'tests/macos-port.test.mjs')])
run(join(nodeDir, 'node'), [join(root, 'scripts/smoke-macos.mjs'), app])

const zip = join(release, `DSH-X-macOS-${arch}.zip`)
await rm(zip, { force: true })
console.log(`Packaging zip ${zip}...`)
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip])
const sha = createHash('sha256').update(await readFile(zip)).digest('hex')
await writeFile(`${zip}.sha256`, `${sha}  DSH-X-macOS-${arch}.zip\n`)

console.log(`\nSuccessfully built and smoke-tested: ${zip}`)
