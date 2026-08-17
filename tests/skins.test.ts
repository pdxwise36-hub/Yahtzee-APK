import { describe, expect, it } from 'vitest'
import { DECOR_SIZE, PIP_CLEARING, PIP_LAYOUT } from '@/dice3d/diceGeometry'
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
  it('fills the face without running off the rounded edge', () => {
    expect(DECOR_SIZE).toBeGreaterThan(0.8)
    expect(DECOR_SIZE).toBeLessThan(1)
  })

  // The art covers the whole face now, so the pips keep their own ground by
  // knocking a hole in it. That hole has to be wider than the pip to be worth
  // anything, and narrower than the gap to its neighbour — clearings that meet
  // stop reading as pips on a picture and start erasing the picture.
  it('clears enough room for a pip without wiping out the art', () => {
    expect(PIP_CLEARING).toBeGreaterThan(1)

    for (const value of VALUES) {
      const pips = PIP_LAYOUT[value]
      if (pips.length < 2) continue
      let closest = Infinity
      for (let i = 0; i < pips.length; i++) {
        for (let j = i + 1; j < pips.length; j++) {
          const [ax, ay] = pips[i] as [number, number]
          const [bx, by] = pips[j] as [number, number]
          closest = Math.min(closest, Math.hypot(ax - bx, ay - by))
        }
      }
      // The clearing is solid to 55% of its reach and fades out from there,
      // matching the gradient drawFace paints.
      const solid = pipRadius(value) * PIP_CLEARING * 0.55
      expect(solid).toBeLessThan(closest / 2)
    }
  })
})
