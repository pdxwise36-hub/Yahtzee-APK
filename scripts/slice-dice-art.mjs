// Cuts a contact sheet of face illustrations into six square die textures.
//
// Image models hand back a grid however firmly you ask for separate files, and
// the panels come out landscape while a die face is square. This finds the
// panels by their gutters and squares each one up.
//
// Squaring up crops by default: the subject sits in the middle of these
// panels with background either side, and a die face wants the subject filling
// it. `--fit contain` pads instead, for a panel whose edges carry something
// worth keeping.
//
//   node scripts/slice-dice-art.mjs sheet.png out/ [--rows 3 --cols 2] [--fit contain]
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const SHEET = process.argv[2]
const OUT = process.argv[3] ?? './sliced'
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : fallback
}
const ROWS = arg('rows', 3)
const COLS = arg('cols', 2)
/** Output edge, in pixels. Die faces are drawn at 256-512, so more is waste. */
const SIZE = arg('size', 512)
const FIT = process.argv.includes('--fit') ? process.argv[process.argv.indexOf('--fit') + 1] : 'cover'

if (!SHEET) throw new Error('usage: slice-dice-art.mjs <sheet.png> <outDir>')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
page.on('pageerror', (error) => console.error('page error:', error.message))
await page.goto('about:blank')

const dataUrl = `data:image/png;base64,${fs.readFileSync(SHEET).toString('base64')}`

const panels = await page.evaluate(async ({ dataUrl, rows, cols, size, fit }) => {
  const image = new Image()
  image.src = dataUrl
  await image.decode()

  const sheet = document.createElement('canvas')
  sheet.width = image.naturalWidth
  sheet.height = image.naturalHeight
  const sheetCtx = sheet.getContext('2d')
  sheetCtx.drawImage(image, 0, 0)
  const { data } = sheetCtx.getImageData(0, 0, sheet.width, sheet.height)

  const isBlank = (x, y) => {
    const i = (y * sheet.width + x) * 4
    return data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238
  }

  /** Runs of consecutive lines that are not gutter, along one axis. */
  const bands = (length, across, blankAt) => {
    const found = []
    let start = -1
    for (let i = 0; i < length; i++) {
      let blank = 0
      for (let j = 0; j < across; j++) if (blankAt(i, j)) blank++
      const gutter = blank / across > 0.9
      if (!gutter && start < 0) start = i
      if (gutter && start >= 0) {
        found.push([start, i - 1])
        start = -1
      }
    }
    if (start >= 0) found.push([start, length - 1])
    // Ignore hairlines from anti-aliased gutter edges.
    return found.filter(([a, b]) => b - a > length / (found.length + 4))
  }

  const columns = bands(sheet.width, sheet.height, (x, y) => isBlank(x, y))
  const rowsFound = bands(sheet.height, sheet.width, (y, x) => isBlank(x, y))
  if (columns.length !== cols || rowsFound.length !== rows) {
    throw new Error(
      `expected a ${cols}x${rows} grid, found ${columns.length}x${rowsFound.length}`,
    )
  }

  const out = []
  for (const [top, bottom] of rowsFound) {
    for (const [left, right] of columns) {
      const w = right - left + 1
      const h = bottom - top + 1

      const panel = document.createElement('canvas')
      panel.width = w
      panel.height = h
      panel.getContext('2d').drawImage(sheet, left, top, w, h, 0, 0, w, h)

      // The panel's own background, taken from its corner, fills the padding.
      const corner = panel.getContext('2d').getImageData(2, 2, 1, 1).data
      const background = `rgb(${corner[0]},${corner[1]},${corner[2]})`

      const square = document.createElement('canvas')
      square.width = square.height = size
      const ctx = square.getContext('2d')
      ctx.fillStyle = background
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingQuality = 'high'
      const scale = fit === 'contain' ? size / Math.max(w, h) : size / Math.min(w, h)
      ctx.drawImage(panel, (size - w * scale) / 2, (size - h * scale) / 2, w * scale, h * scale)

      out.push({ url: square.toDataURL('image/webp', 0.9), background })
    }
  }
  return out
}, { dataUrl, rows: ROWS, cols: COLS, size: SIZE, fit: FIT })

panels.forEach((panel, index) => {
  const file = path.join(OUT, `${index + 1}.webp`)
  fs.writeFileSync(file, Buffer.from(panel.url.split(',')[1], 'base64'))
  console.log(`${file}  background ${panel.background}`)
})

await browser.close()
