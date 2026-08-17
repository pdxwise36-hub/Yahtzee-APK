import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { restingOrientation, settleOrientation, squareUp } from '@/dice3d/DiceTable'
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

describe('settleOrientation', () => {
  it('always shows the requested value, perfectly flat', () => {
    for (const value of VALUES) {
      for (let i = 0; i < 60; i++) {
        // A messy near-settled pose: any yaw, plus a few degrees of lean.
        const messy = new THREE.Quaternion()
          .setFromEuler(new THREE.Euler(
            (Math.random() - 0.5) * 0.3,
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.3,
          ))
          .multiply(restingOrientation(value))
        const settled = settleOrientation(messy, value)
        expect(valueFacingUp(settled)).toBe(value)
        for (const local of [
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0, 1),
        ]) {
          const world = local.applyQuaternion(settled)
          for (const c of [world.x, world.y, world.z]) {
            expect(Math.min(Math.abs(c), Math.abs(Math.abs(c) - 1))).toBeLessThan(1e-5)
          }
        }
      }
    }
  })

  it('picks the nearest of the four square headings', () => {
    // A die yawed slightly past square should turn back a few degrees, never
    // spin most of the way around the other way.
    for (const value of VALUES) {
      for (const nudge of [-0.2, 0.2, Math.PI / 2 - 0.2, Math.PI / 2 + 0.2]) {
        const current = new THREE.Quaternion()
          .setFromAxisAngle(new THREE.Vector3(0, 1, 0), nudge)
          .multiply(restingOrientation(value))
        const settled = settleOrientation(current, value)
        expect(current.angleTo(settled)).toBeLessThan(0.35)
      }
    }
  })
})
