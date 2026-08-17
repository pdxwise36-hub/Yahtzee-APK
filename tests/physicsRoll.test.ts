import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { DEFAULT_TRAY, generateRoll } from '@/dice3d/physicsRoll'
import { valueFacingUp, faceCorrection, normalForValue, FACE_VALUES } from '@/dice3d/diceGeometry'
import type { DieValue } from '@/engine/types'
import { createRng } from '@/engine/rng'

function finalQuaternion(quaternions: Float32Array, frameCount: number): THREE.Quaternion {
  const o = (frameCount - 1) * 4
  return new THREE.Quaternion(
    quaternions[o] as number,
    quaternions[o + 1] as number,
    quaternions[o + 2] as number,
    quaternions[o + 3] as number,
  )
}

/** How square-on the die rests. 1.0 is perfectly flat on a face. */
function flatness(q: THREE.Quaternion): number {
  const up = new THREE.Vector3(0, 1, 0)
  let best = 0
  for (const axis of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
    best = Math.max(best, Math.abs(axis.clone().applyQuaternion(q).dot(up)))
  }
  return best
}

describe('face geometry', () => {
  it('puts opposite values on opposite faces, summing to seven', () => {
    for (const value of FACE_VALUES) {
      const opposite = (7 - value) as DieValue
      expect(normalForValue(value).dot(normalForValue(opposite))).toBeCloseTo(-1, 6)
    }
  })

  it('corrects any face onto any other, including opposites', () => {
    for (let desired = 1; desired <= 6; desired++) {
      for (let achieved = 1; achieved <= 6; achieved++) {
        const correction = faceCorrection(desired as DieValue, achieved as DieValue)
        const moved = normalForValue(desired as DieValue).applyQuaternion(correction)
        expect(moved.distanceTo(normalForValue(achieved as DieValue))).toBeLessThan(1e-5)
      }
    }
  })

  it('reads the up-face from an orientation', () => {
    expect(valueFacingUp(new THREE.Quaternion())).toBe(2) // +Y carries the 2
    const flipped = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    expect(valueFacingUp(flipped)).toBe(5) // its opposite
  })
})

describe('generateRoll', () => {
  it('lands every die on the value the engine asked for', () => {
    const rng = createRng(20260817)
    for (let trial = 0; trial < 30; trial++) {
      const values = Array.from({ length: 5 }, () => rng.die())
      const roll = generateRoll(values, rng.getState())
      roll.dice.forEach((die, i) => {
        const settled = finalQuaternion(die.quaternions, die.frameCount)
        expect(valueFacingUp(settled)).toBe(values[i])
      })
    }
  })

  it('handles a six-dice throw', () => {
    const values: DieValue[] = [6, 6, 6, 6, 6, 1]
    const roll = generateRoll(values, 555)
    expect(roll.dice).toHaveLength(6)
    roll.dice.forEach((die, i) => {
      expect(valueFacingUp(finalQuaternion(die.quaternions, die.frameCount))).toBe(values[i])
    })
  })

  it('leaves the dice resting flat, not propped on a corner', () => {
    const rng = createRng(88)
    for (let trial = 0; trial < 12; trial++) {
      const values = Array.from({ length: 5 }, () => rng.die())
      const roll = generateRoll(values, rng.getState())
      for (const die of roll.dice) {
        expect(flatness(finalQuaternion(die.quaternions, die.frameCount))).toBeGreaterThan(0.95)
      }
    }
  })

  it('never lets a die leave the shallow strip it is thrown along', () => {
    // The dice tray is a short band at the bottom of the board, so depth is the
    // tight constraint: a die that wandered out of it would be drawn outside
    // the strip the player is looking at.
    const rng = createRng(1234)
    for (let trial = 0; trial < 20; trial++) {
      const values = Array.from({ length: 5 }, () => rng.die())
      const roll = generateRoll(values, rng.getState())
      for (const die of roll.dice) {
        for (let f = 0; f < die.frameCount; f++) {
          const o = f * 3
          expect(Math.abs(die.positions[o + 2] as number)).toBeLessThan(DEFAULT_TRAY.depth / 2 + 0.9)
          expect(die.positions[o + 1] as number).toBeGreaterThan(-0.5)
        }
      }
    }
  })

  it('comes to rest inside the tray', () => {
    const rng = createRng(99)
    for (let trial = 0; trial < 20; trial++) {
      const values = Array.from({ length: 5 }, () => rng.die())
      const roll = generateRoll(values, rng.getState())
      for (const die of roll.dice) {
        const o = (die.frameCount - 1) * 3
        expect(Math.abs(die.positions[o] as number)).toBeLessThan(DEFAULT_TRAY.width / 2 + 0.6)
        expect(Math.abs(die.positions[o + 2] as number)).toBeLessThan(DEFAULT_TRAY.depth / 2 + 0.6)
      }
    }
  })

  it('settles within a couple of seconds', () => {
    const rng = createRng(31337)
    for (let trial = 0; trial < 10; trial++) {
      const values = Array.from({ length: 5 }, () => rng.die())
      const roll = generateRoll(values, rng.getState())
      expect(roll.duration).toBeGreaterThan(0.4)
      expect(roll.duration).toBeLessThan(4.5)
    }
  })

  it('replays identically for the same seed', () => {
    const values: DieValue[] = [3, 1, 4, 1, 5]
    const a = generateRoll(values, 777)
    const b = generateRoll(values, 777)
    expect(a.frameCount).toBe(b.frameCount)
    expect(Array.from(a.dice[0]!.positions)).toEqual(Array.from(b.dice[0]!.positions))
    expect(Array.from(a.dice[2]!.quaternions)).toEqual(Array.from(b.dice[2]!.quaternions))
  })

  it('throws differently for different seeds', () => {
    const values: DieValue[] = [3, 1, 4, 1, 5]
    const a = generateRoll(values, 1)
    const b = generateRoll(values, 2)
    expect(Array.from(a.dice[0]!.positions)).not.toEqual(Array.from(b.dice[0]!.positions))
  })
})
