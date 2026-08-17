import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { restingOrientation, squareUp } from '@/dice3d/DiceTable'
import { valueFacingUp } from '@/dice3d/diceGeometry'
import type { DieValue } from '@/engine/types'

const VALUES: DieValue[] = [1, 2, 3, 4, 5, 6]

describe('restingOrientation', () => {
  it('shows the requested value face-up for every die face', () => {
    for (const value of VALUES) {
      expect(valueFacingUp(restingOrientation(value))).toBe(value)
    }
  })

  it('lies flat on the table', () => {
    for (const value of VALUES) {
      const q = restingOrientation(value)
      const up = new THREE.Vector3(0, 1, 0)
      const best = Math.max(
        ...[
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 1),
        ].map((axis) => Math.abs(axis.applyQuaternion(q).dot(up))),
      )
      expect(best).toBeCloseTo(1, 5)
    }
  })
})

describe('squareUp', () => {
  it('never changes which value is showing', () => {
    // Random orientations that are already flat, plus arbitrary yaw.
    for (const value of VALUES) {
      for (let i = 0; i < 40; i++) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          (i / 40) * Math.PI * 2,
        )
        const q = yaw.multiply(restingOrientation(value))
        expect(valueFacingUp(squareUp(q))).toBe(value)
      }
    }
  })

  it('snaps the die square to the table', () => {
    // "Square" means every local axis lands on a world axis, so each component
    // of the rotated axis is 0 or +/-1. Probing a single axis would be
    // degenerate for a die showing 1 or 6, where that axis points straight up.
    for (const value of VALUES) {
      for (let i = 0; i < 24; i++) {
        const yaw = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          (i / 24) * Math.PI * 2,
        )
        const squared = squareUp(yaw.multiply(restingOrientation(value)))
        for (const local of [
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 1),
        ]) {
          const world = local.applyQuaternion(squared)
          for (const component of [world.x, world.y, world.z]) {
            const distanceToAxis = Math.min(
              Math.abs(component),
              Math.abs(Math.abs(component) - 1),
            )
            expect(distanceToAxis).toBeLessThan(1e-5)
          }
        }
      }
    }
  })
})
