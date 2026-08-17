import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { createRng } from '@/engine/rng'
import type { DieValue } from '@/engine/types'
import { faceCorrection, valueFacingUp } from './diceGeometry'

export const DIE_SIZE = 1
const HALF = DIE_SIZE / 2

/** Playfield dimensions in world units. Walls sit just outside the camera's
 *  view so dice bounce off unseen boundaries rather than sailing off-screen. */
export interface TrayBounds {
  width: number
  depth: number
  wallHeight: number
}

/** The dice live in a short strip along the bottom of the board, so the tray
 *  is wide and shallow: dice roll across it rather than around it. */
export const DEFAULT_TRAY: TrayBounds = { width: 13, depth: 3.6, wallHeight: 5 }

const FIXED_STEP = 1 / 60
const MAX_STEPS = 190
const SETTLE_STEPS = 10
const LINEAR_REST = 0.2
const ANGULAR_REST = 0.25
/** After this many frames, damping ramps up so a throw always comes to rest
 *  promptly. Real dice settle in about a second; a game that waits three is
 *  waiting too long. The ramp is gentle enough to read as friction. */
const CALM_AFTER = 66
const CALM_RATE = 0.07
/** Contact solving leaves dice micro-jittering forever at very low speeds.
 *  Once a die is this slow during the calm phase its motion is simply zeroed,
 *  which is invisible on screen and guarantees the throw actually ends. */
const JITTER_SPEED = 0.34

/** One die's full recorded tumble, ready to be replayed frame by frame. */
export interface DieTrajectory {
  /** Flat [x, y, z] triples, one per frame. */
  positions: Float32Array
  /** Flat [x, y, z, w] quaternions, already face-corrected. */
  quaternions: Float32Array
  frameCount: number
  value: DieValue
}

export interface RollAnimation {
  dice: DieTrajectory[]
  frameCount: number
  /** Seconds the tumble takes at real-time playback. */
  duration: number
}

function buildWorld(tray: TrayBounds): CANNON.World {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -34, 0) })
  world.broadphase = new CANNON.SAPBroadphase(world)
  world.allowSleep = true

  const floorMaterial = new CANNON.Material('floor')
  const diceMaterial = new CANNON.Material('dice')

  // Felt: grippy and fairly dead, so dice stop tumbling instead of skating.
  world.addContactMaterial(
    new CANNON.ContactMaterial(floorMaterial, diceMaterial, {
      friction: 0.52,
      restitution: 0.16,
    }),
  )
  // Dice knocking together are livelier than dice hitting cloth.
  world.addContactMaterial(
    new CANNON.ContactMaterial(diceMaterial, diceMaterial, {
      friction: 0.18,
      restitution: 0.34,
    }),
  )

  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMaterial })
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(floor)

  const halfWidth = tray.width / 2
  const halfDepth = tray.depth / 2
  const walls: [CANNON.Vec3, CANNON.Vec3][] = [
    [new CANNON.Vec3(-halfWidth, 0, 0), new CANNON.Vec3(1, 0, 0)],
    [new CANNON.Vec3(halfWidth, 0, 0), new CANNON.Vec3(-1, 0, 0)],
    [new CANNON.Vec3(0, 0, -halfDepth), new CANNON.Vec3(0, 0, 1)],
    [new CANNON.Vec3(0, 0, halfDepth), new CANNON.Vec3(0, 0, -1)],
  ]
  for (const [position, normal] of walls) {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMaterial })
    wall.position.copy(position)
    wall.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), normal)
    world.addBody(wall)
  }

  // A lid keeps an over-enthusiastic throw from launching dice out of frame.
  const lid = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMaterial })
  lid.position.set(0, tray.wallHeight, 0)
  lid.quaternion.setFromEuler(Math.PI / 2, 0, 0)
  world.addBody(lid)

  return world
}

function createDiceBodies(count: number, world: CANNON.World, seed: number): CANNON.Body[] {
  const rng = createRng(seed)
  const shape = new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF))
  const material = world.contactmaterials[0]?.materials[1] ?? new CANNON.Material('dice')
  const bodies: CANNON.Body[] = []

  for (let i = 0; i < count; i++) {
    const body = new CANNON.Body({
      mass: 1,
      shape,
      material: material as CANNON.Material,
      linearDamping: 0.12,
      angularDamping: 0.18,
    })
    body.allowSleep = true
    body.sleepSpeedLimit = 0.24
    body.sleepTimeLimit = 0.18

    // Launch from just off the left edge in a loose stack, thrown to the right
    // and downward — the arc a hand makes tipping a cup onto the table.
    body.position.set(
      -DEFAULT_TRAY.width / 2 - 0.6 - i * 0.5,
      1.5 + rng.next() * 1.1,
      (rng.next() - 0.5) * (DEFAULT_TRAY.depth * 0.42),
    )
    body.quaternion.setFromEuler(
      rng.next() * Math.PI * 2,
      rng.next() * Math.PI * 2,
      rng.next() * Math.PI * 2,
    )
    // Thrown along the strip rather than into it: plenty of sideways travel to
    // tumble with, but little depth, so no die ever leaves the shallow tray.
    body.velocity.set(6.5 + rng.next() * 3.4, 0.9 + rng.next() * 1.4, (rng.next() - 0.5) * 1.6)
    body.angularVelocity.set(
      (rng.next() - 0.5) * 14,
      (rng.next() - 0.5) * 18,
      (rng.next() - 0.5) * 24,
    )

    world.addBody(body)
    bodies.push(body)
  }

  return bodies
}

function isAtRest(body: CANNON.Body): boolean {
  return (
    body.velocity.lengthSquared() < LINEAR_REST * LINEAR_REST &&
    body.angularVelocity.lengthSquared() < ANGULAR_REST * ANGULAR_REST
  )
}

/** How square-on a die is sitting: 1 means perfectly flat on a face, 0 means
 *  balanced on an edge. These are the world-space Y components of the die's
 *  three local axes, straight out of the rotation matrix. */
function flatness(x: number, y: number, z: number, w: number): number {
  return Math.max(
    Math.abs(2 * (x * y + w * z)),
    Math.abs(1 - 2 * (x * x + z * z)),
    Math.abs(2 * (y * z - w * x)),
  )
}

interface SimulationResult {
  positions: number[][]
  quaternions: number[][]
  frameCount: number
  cocked: boolean
  /** False when the dice were still moving when the frame budget ran out. */
  settled: boolean
}

/** Run the throw headlessly and record every frame. No rendering happens here;
 *  the whole tumble is resolved before a single pixel is drawn. */
function simulate(count: number, seed: number, tray: TrayBounds): SimulationResult {
  const world = buildWorld(tray)
  const bodies = createDiceBodies(count, world, seed)

  const positions: number[][] = Array.from({ length: count }, () => [])
  const quaternions: number[][] = Array.from({ length: count }, () => [])

  let restingFrames = 0
  let frameCount = 0
  let settled = false

  for (let step = 0; step < MAX_STEPS; step++) {
    if (step > CALM_AFTER) {
      const extra = (step - CALM_AFTER) * CALM_RATE
      for (const body of bodies) {
        body.linearDamping = Math.min(0.92, 0.12 + extra)
        body.angularDamping = Math.min(0.92, 0.18 + extra)
        // Early on only a dead-flat die may be frozen, so a slow tip-over is
        // never caught mid-roll. The longer a throw drags on the more willing
        // we are to call it settled, which bounds the wait without ever
        // freezing a die that is visibly still turning over.
        const progress = (step - CALM_AFTER) / (MAX_STEPS - CALM_AFTER)
        const flatGate = 0.985 - 0.025 * Math.min(1, progress)
        const speedGate = JITTER_SPEED * (1 + Math.min(1, progress))
        const q = body.quaternion
        if (
          body.velocity.lengthSquared() < speedGate * speedGate &&
          body.angularVelocity.lengthSquared() < speedGate * speedGate &&
          flatness(q.x, q.y, q.z, q.w) > flatGate
        ) {
          body.velocity.setZero()
          body.angularVelocity.setZero()
          body.sleep()
        }
      }
    }

    // step(), not fixedStep(): fixedStep advances against a wall clock, which
    // would make a headless loop non-deterministic and barely move the world.
    world.step(FIXED_STEP)
    frameCount++

    for (let i = 0; i < count; i++) {
      const body = bodies[i] as CANNON.Body
      ;(positions[i] as number[]).push(body.position.x, body.position.y, body.position.z)
      ;(quaternions[i] as number[]).push(
        body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
      )
    }

    if (bodies.every(isAtRest)) {
      restingFrames++
      if (restingFrames >= SETTLE_STEPS) {
        settled = true
        break
      }
    } else {
      restingFrames = 0
    }
  }

  const cocked = bodies.some((body) => {
    const q = body.quaternion
    return flatness(q.x, q.y, q.z, q.w) < 0.96
  })

  return { positions, quaternions, frameCount, cocked, settled }
}

/** Produce a tumble that ends on exactly the values the engine rolled.
 *
 *  The simulation is free to land wherever it likes. Afterwards each die gets a
 *  constant local-frame rotation that swaps the face it happened to show for
 *  the face we need. Because that offset is applied to every recorded frame
 *  identically, the motion on screen is untouched real physics — the die simply
 *  had those numbers painted on it all along. */
export function generateRoll(
  values: readonly DieValue[],
  seed: number,
  tray: TrayBounds = DEFAULT_TRAY,
): RollAnimation {
  let simulation = simulate(values.length, seed, tray)

  // Reject and re-throw two kinds of bad roll: a die propped against a wall or
  // another die, which has no clear up-face; and a throw that was still moving
  // when the frame budget ran out, which would stall the player mid-turn.
  // Simulation is headless and costs under a millisecond, so shopping for a
  // clean throw is far cheaper than showing a bad one.
  for (let attempt = 1; (simulation.cocked || !simulation.settled) && attempt <= 8; attempt++) {
    simulation = simulate(values.length, (seed + attempt * 0x9e3779b9) >>> 0, tray)
  }

  const dice: DieTrajectory[] = values.map((value, i) => {
    const rawQuaternions = simulation.quaternions[i] as number[]
    const frameCount = simulation.frameCount

    const finalIndex = (frameCount - 1) * 4
    const settled = new THREE.Quaternion(
      rawQuaternions[finalIndex] as number,
      rawQuaternions[finalIndex + 1] as number,
      rawQuaternions[finalIndex + 2] as number,
      rawQuaternions[finalIndex + 3] as number,
    )
    const correction = faceCorrection(value, valueFacingUp(settled))

    const corrected = new Float32Array(frameCount * 4)
    const frame = new THREE.Quaternion()
    for (let f = 0; f < frameCount; f++) {
      const o = f * 4
      frame.set(
        rawQuaternions[o] as number,
        rawQuaternions[o + 1] as number,
        rawQuaternions[o + 2] as number,
        rawQuaternions[o + 3] as number,
      )
      frame.multiply(correction)
      corrected[o] = frame.x
      corrected[o + 1] = frame.y
      corrected[o + 2] = frame.z
      corrected[o + 3] = frame.w
    }

    return {
      positions: Float32Array.from(simulation.positions[i] as number[]),
      quaternions: corrected,
      frameCount,
      value,
    }
  })

  return {
    dice,
    frameCount: simulation.frameCount,
    duration: simulation.frameCount * FIXED_STEP,
  }
}

export { FIXED_STEP }
