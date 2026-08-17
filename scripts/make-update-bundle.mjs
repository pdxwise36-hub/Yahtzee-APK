// Packages the built web app as an over-the-air update bundle.
//
// The APK is a browser window around these files. Frozen inside the APK they
// can only change by reinstalling; published here, the installed app can fetch
// them itself. Only genuinely native changes — the icon, permissions, a new
// plugin — still need a new APK.
//
// Runs as part of the Vercel build, so the bundle is served from the same
// deployment the browser version uses. It is skipped elsewhere: the APK build
// would otherwise pack a copy of the site inside the APK that installs it.
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'

// archiver is CommonJS and exposes a factory, which ESM import cannot name.
const archiver = createRequire(import.meta.url)('archiver')

const forced = process.argv.includes('--force')
if (!process.env.VERCEL && !forced) {
  console.log('skipping update bundle (not a Vercel build)')
  process.exit(0)
}

const BASE = process.env.UPDATE_BASE_URL ?? 'https://yahtzee-five.vercel.app'
const OUT = 'dist/updates'

/** A version that always increases, so the app can tell newer from older. */
function version() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  if (sha) return `${Date.now()}-${sha.slice(0, 7)}`
  try {
    return `${Date.now()}-${execSync('git rev-parse --short HEAD').toString().trim()}`
  } catch {
    return String(Date.now())
  }
}

await mkdir(OUT, { recursive: true })

const zipPath = `${OUT}/bundle.zip`
await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 9 } })
  output.on('close', resolve)
  archive.on('error', reject)
  archive.pipe(output)
  // Everything except this directory, or the archive would contain itself.
  archive.glob('**/*', { cwd: 'dist', ignore: ['updates/**'] })
  void archive.finalize()
})

const manifest = {
  version: version(),
  url: `${BASE}/updates/bundle.zip`,
  // Informational: lets a human tell at a glance what a device is running.
  builtAt: new Date().toISOString(),
}
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`update bundle ${manifest.version} written to ${OUT}`)
