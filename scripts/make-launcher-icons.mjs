// Turns one icon candidate into the Android launcher resources.
//
// Android wants the icon three ways: a legacy square, a legacy round one, and
// an adaptive foreground that it composites over its own background and crops
// to whatever shape the launcher uses. All three come from the same render.
//
//   npx vite --port 5199 &
//   node scripts/make-launcher-icons.mjs ink
import { chromium } from 'playwright'
import fs from 'node:fs'

const VARIANT = process.argv[2] ?? 'ink'
const RES = process.argv[3] ?? 'android/app/src/main/res'
const PORT = process.env.PORT ?? '5199'

/** Legacy icon sizes, by density bucket. */
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
/** Adaptive foregrounds are 108dp, so each bucket is 2.25x its legacy size. */
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

/** How much of the foreground layer the art may occupy.
 *
 *  Android guarantees only the central 66% of an adaptive icon survives the
 *  launcher's mask; the rest is there to be cropped, or to be revealed when
 *  the icon is animated. Art drawn to the edge loses its corners on a circular
 *  mask, so it is fitted inside this instead. */
const SAFE_ZONE = 0.62

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } })
page.on('pageerror', (error) => console.error('page error:', error.message))

// Downscaling 1024px straight to 48px skips so many pixels that thin features
// break up, so it is done by repeated halving, which averages all of them.
await page.addInitScript(() => {
  window.__resize = (source, size) => {
    let current = source
    while (current.width / 2 > size) {
      const half = document.createElement('canvas')
      half.width = Math.floor(current.width / 2)
      half.height = Math.floor(current.height / 2)
      const ctx = half.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(current, 0, 0, half.width, half.height)
      current = half
    }
    const out = document.createElement('canvas')
    out.width = out.height = size
    const ctx = out.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(current, 0, 0, size, size)
    return out
  }
})

const write = (path, dataUrl) => {
  fs.mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true })
  fs.writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'))
}

async function load(query) {
  await page.goto(`http://localhost:${PORT}/icon.html?${query}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__iconsReady === true, null, { timeout: 30000 })
}

// The composed icon, for the two legacy shapes.
await load(`only=${VARIANT}`)
for (const [density, size] of Object.entries(LEGACY)) {
  const square = await page.evaluate(([id, size]) => {
    return window.__resize(document.getElementById(id), size).toDataURL('image/png')
  }, [VARIANT, size])
  write(`${RES}/mipmap-${density}/ic_launcher.png`, square)

  const round = await page.evaluate(([id, size]) => {
    const scaled = window.__resize(document.getElementById(id), size)
    const out = document.createElement('canvas')
    out.width = out.height = size
    const ctx = out.getContext('2d')
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(scaled, 0, 0)
    return out.toDataURL('image/png')
  }, [VARIANT, size])
  write(`${RES}/mipmap-${density}/ic_launcher_round.png`, round)
}

// The bare die, for the adaptive foreground.
await load(`only=${VARIANT}&transparent=1`)
for (const [density, size] of Object.entries(FOREGROUND)) {
  const foreground = await page.evaluate(([id, size, safe]) => {
    const source = document.getElementById(id)
    const ctx = source.getContext('2d') ?? source.getContext('webgl2')
    // Measure what the die actually covers rather than assuming, so the fit
    // holds even when a candidate's dice are arranged differently.
    const probe = document.createElement('canvas')
    probe.width = probe.height = source.width
    const probeCtx = probe.getContext('2d')
    probeCtx.drawImage(source, 0, 0)
    const { data } = probeCtx.getImageData(0, 0, probe.width, probe.height)
    let minX = probe.width, minY = probe.height, maxX = -1, maxY = -1
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        if (data[(y * probe.width + x) * 4 + 3] > 12) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) throw new Error('foreground render is empty')
    const w = maxX - minX + 1
    const h = maxY - minY + 1

    const out = document.createElement('canvas')
    out.width = out.height = size
    const outCtx = out.getContext('2d')
    outCtx.imageSmoothingQuality = 'high'
    const scale = (size * safe) / Math.max(w, h)
    outCtx.drawImage(
      probe, minX, minY, w, h,
      (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale,
    )
    void ctx
    return out.toDataURL('image/png')
  }, [VARIANT, size, SAFE_ZONE])
  write(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, foreground)
}

// The same icon for the web build, so a browser tab and a home-screen
// shortcut show what the launcher shows.
await load(`only=${VARIANT}`)
for (const size of [192, 512]) {
  const web = await page.evaluate(([id, size]) => {
    return window.__resize(document.getElementById(id), size).toDataURL('image/png')
  }, [VARIANT, size])
  write(`public/icon-${size}.png`, web)
}

console.log(`wrote launcher icons and web icons for "${VARIANT}"`)
await browser.close()
