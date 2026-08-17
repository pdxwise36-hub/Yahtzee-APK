import { describe, expect, it } from 'vitest'
import { DECOR_LAYOUT, PIP_LAYOUT } from '@/dice3d/diceGeometry'
import { DICE_SKINS } from '@/dice3d/skins'
import type { DieValue } from '@/engine/types'

const VALUES: DieValue[] = [1, 2, 3, 4, 5, 6]

/** Matches the pip radius drawFace uses, as a fraction of the face. */
const pipRadius = (value: DieValue): number => (value === 1 ? 0.125 : 0.092)

describe('dice catalogue', () => {
  it('keys every skin by its own id', () => {
    for (const [key, skin] of Object.entries(DICE_SKINS)) {
      expect(skin.id).toBe(key)
    }
  })

  it('gives every themed set a glyph for all six faces', () => {
    // A missing entry paints nothing, and the face silently loses its joke.
    for (const skin of Object.values(DICE_SKINS)) {
      if (!skin.decor) continue
      expect(skin.decor).toHaveLength(6)
      for (const glyph of skin.decor) expect(glyph.trim().length).toBeGreaterThan(0)
    }
  })

  it('gives every themed set its own mascot', () => {
    // The settings picker draws each set as its sixth face. Two sets sharing
    // that glyph would render as two identical buttons.
    const mascots = Object.values(DICE_SKINS)
      .flatMap((skin) => (skin.decor ? [skin.decor[5]] : []))
    expect(new Set(mascots).size).toBe(mascots.length)
  })

  it('names every skin distinctly, so the picker can be read aloud', () => {
    const names = Object.values(DICE_SKINS).map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('art placement', () => {
  // The whole promise of the themed dice is that the pips stay standard and
  // you can always tell the number at a glance. On the faces with room to
  // spare, the art has to keep out of the pips' way entirely.
  it('keeps art clear of the pips wherever the layout leaves room', () => {
    for (const value of [1, 2, 3, 5] as DieValue[]) {
      const spot = DECOR_LAYOUT[value]
      const half = spot.size / 2
      for (const [px, py] of PIP_LAYOUT[value]) {
        // Nearest point of the art's box to the pip centre.
        const nearestX = Math.max(spot.x - half, Math.min(px, spot.x + half))
        const nearestY = Math.max(spot.y - half, Math.min(py, spot.y + half))
        const distance = Math.hypot(px - nearestX, py - nearestY)
        expect(distance).toBeGreaterThanOrEqual(pipRadius(value))
      }
    }
  })

  // Four and six leave nothing but a channel down the middle, too narrow for a
  // mascot. Those two carry the art centred with the pips crossing over it,
  // which only reads if it is symmetric — an off-centre mascot behind pips
  // looks like a mistake rather than a design.
  it('centres the art on the faces where the pips cross over it', () => {
    for (const value of [4, 6] as DieValue[]) {
      expect(DECOR_LAYOUT[value].x).toBe(0.5)
      expect(DECOR_LAYOUT[value].y).toBe(0.5)
    }
  })

  it('keeps every face art inside the face', () => {
    for (const value of VALUES) {
      const spot = DECOR_LAYOUT[value]
      const half = spot.size / 2
      expect(spot.x - half).toBeGreaterThanOrEqual(0)
      expect(spot.y - half).toBeGreaterThanOrEqual(0)
      expect(spot.x + half).toBeLessThanOrEqual(1)
      expect(spot.y + half).toBeLessThanOrEqual(1)
    }
  })
})
