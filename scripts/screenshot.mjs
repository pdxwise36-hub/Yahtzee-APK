// Drives the built game in a real browser and captures the table mid-throw
// and at rest, then prints the engine's hand so the rendered faces can be
// checked against what the rules engine actually rolled.
//
//   npm run build && npm run preview &
//   node scripts/screenshot.mjs ./shots
import { chromium } from 'playwright'
const OUT = process.argv[2] ?? '.'
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 3 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.getByText('Classic', { exact: true }).click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: /^Roll$/i }).click()
await page.waitForTimeout(650)
await page.screenshot({ path: `${OUT}/tumble.png`, clip: { x: 0, y: 54, width: 412, height: 330 } })
await page.waitForTimeout(4200)
await page.screenshot({ path: `${OUT}/settled.png`, clip: { x: 0, y: 54, width: 412, height: 330 } })
const hand = await page.evaluate(() => {
  const g = window.__yahtzee.getState().game
  return g ? g.dice.map((d) => d.value) : null
})
console.log('ENGINE HAND:', JSON.stringify(hand))
console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none')
await browser.close()
