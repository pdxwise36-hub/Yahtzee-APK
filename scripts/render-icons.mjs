// Renders the app-icon candidates defined in src/iconRender.ts to PNGs.
//
// The icon is drawn with the game's own dice — same geometry, materials and
// lighting — rather than redrawn as flat vectors, so it looks like the thing
// it opens. Rendering happens in a real browser because that is where the
// WebGL context lives.
//
//   npx vite --port 5199 &
//   node scripts/render-icons.mjs ./icons
import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.argv[2] ?? './icons'
const PORT = process.env.PORT ?? '5199'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
page.on('pageerror', (error) => console.error('page error:', error.message))

await page.goto(`http://localhost:${PORT}/icon.html`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__iconsReady === true, null, { timeout: 30000 })

const ids = await page.evaluate(() =>
  Array.from(document.querySelectorAll('canvas')).map((c) => c.id),
)
for (const id of ids) {
  const dataUrl = await page.evaluate(
    (id) => document.getElementById(id).toDataURL('image/png'),
    id,
  )
  fs.writeFileSync(`${OUT}/${id}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'))
}

console.log(`wrote ${ids.length} icons to ${OUT}: ${ids.join(', ')}`)
await browser.close()
