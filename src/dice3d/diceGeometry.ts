import * as THREE from 'three'
import type { DieValue } from '@/engine/types'

/** Which value sits on each face of the cube, in Three.js BoxGeometry
 *  material order: +X, -X, +Y, -Y, +Z, -Z.
 *  Opposite faces sum to 7, as on a real die. */
export const FACE_VALUES: readonly DieValue[] = [1, 6, 2, 5, 3, 4] as const

export const FACE_NORMALS: readonly THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
]

/** The local-space normal of the face bearing a given value. */
export function normalForValue(value: DieValue): THREE.Vector3 {
  const index = FACE_VALUES.indexOf(value)
  return (FACE_NORMALS[index] as THREE.Vector3).clone()
}

/** Which value is face-up for a die at the given orientation. */
export function valueFacingUp(quaternion: THREE.Quaternion): DieValue {
  let best = -Infinity
  let value: DieValue = 1
  const worldNormal = new THREE.Vector3()
  for (let i = 0; i < FACE_NORMALS.length; i++) {
    worldNormal.copy(FACE_NORMALS[i] as THREE.Vector3).applyQuaternion(quaternion)
    if (worldNormal.y > best) {
      best = worldNormal.y
      value = FACE_VALUES[i] as DieValue
    }
  }
  return value
}

/** A fixed rotation, in the die's own frame, that moves `desired` onto the
 *  face where `achieved` currently sits.
 *
 *  Composing this onto every frame of a recorded tumble relabels the faces
 *  without altering the motion by a single pixel — the die still bounces and
 *  settles exactly as the simulation produced, but shows the value we need. */
export function faceCorrection(desired: DieValue, achieved: DieValue): THREE.Quaternion {
  const from = normalForValue(desired)
  const to = normalForValue(achieved)
  if (from.distanceToSquared(to) < 1e-8) return new THREE.Quaternion()
  // Opposite faces have no unique shortest arc, so pick a definite axis.
  if (from.dot(to) < -0.999) {
    const axis = new THREE.Vector3(from.y, from.z, from.x)
    return new THREE.Quaternion().setFromAxisAngle(axis.normalize(), Math.PI)
  }
  return new THREE.Quaternion().setFromUnitVectors(from, to)
}

/** A cube with rounded corners that keeps BoxGeometry's per-face material
 *  groups and UVs, so each face can still carry its own pip texture.
 *
 *  Vertices are clamped to an inner box and pushed back out along the offset
 *  direction by the corner radius, which rounds edges and corners while
 *  leaving the flat centre of each face — where the pips live — untouched. */
export function createRoundedDieGeometry(size = 1, radius = 0.12, segments = 5): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(size, size, size, segments, segments, segments)
  const half = size / 2
  const inner = half - radius

  const position = geometry.attributes.position as THREE.BufferAttribute
  const vertex = new THREE.Vector3()
  const clamped = new THREE.Vector3()

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    clamped.set(
      THREE.MathUtils.clamp(vertex.x, -inner, inner),
      THREE.MathUtils.clamp(vertex.y, -inner, inner),
      THREE.MathUtils.clamp(vertex.z, -inner, inner),
    )
    const offset = vertex.clone().sub(clamped)
    const length = offset.length()
    if (length > 1e-6) {
      offset.multiplyScalar(radius / length)
      vertex.copy(clamped).add(offset)
      position.setXYZ(i, vertex.x, vertex.y, vertex.z)
    }
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export interface DiceSkin {
  id: string
  name: string
  body: string
  pip: string
  /** Subtle rim tint painted into the texture edges. */
  edge: string
  roughness: number
  metalness: number
}

export const DICE_SKINS: Record<string, DiceSkin> = {
  ivory: {
    id: 'ivory', name: 'Ivory', body: '#f6f1e3', pip: '#1d1d1f',
    edge: '#d9d0ba', roughness: 0.32, metalness: 0.02,
  },
  midnight: {
    id: 'midnight', name: 'Midnight', body: '#1b1f2a', pip: '#e8ecf5',
    edge: '#0d1017', roughness: 0.28, metalness: 0.15,
  },
  ruby: {
    id: 'ruby', name: 'Ruby', body: '#9b1c2e', pip: '#ffe9ec',
    edge: '#6d1220', roughness: 0.22, metalness: 0.08,
  },
  gold: {
    id: 'gold', name: 'Gold', body: '#d4a92c', pip: '#3a2a05',
    edge: '#a37f18', roughness: 0.18, metalness: 0.75,
  },
  jade: {
    id: 'jade', name: 'Jade', body: '#1f7a5e', pip: '#eafff6',
    edge: '#12513e', roughness: 0.25, metalness: 0.1,
  },
  neon: {
    id: 'neon', name: 'Neon', body: '#12121a', pip: '#39ff9e',
    edge: '#05050a', roughness: 0.4, metalness: 0.05,
  },
}

/** Pip positions as fractions of the face, for each value. */
const PIP_LAYOUT: Record<DieValue, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]],
}

/** Paint one face of a die: body colour, a soft vignette so the edges read as
 *  curved under flat lighting, and recessed pips. */
function drawFace(value: DieValue, skin: DiceSkin, resolution: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = resolution
  canvas.height = resolution
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  ctx.fillStyle = skin.body
  ctx.fillRect(0, 0, resolution, resolution)

  const vignette = ctx.createRadialGradient(
    resolution / 2, resolution / 2, resolution * 0.28,
    resolution / 2, resolution / 2, resolution * 0.72,
  )
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, skin.edge)
  ctx.globalAlpha = 0.55
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, resolution, resolution)
  ctx.globalAlpha = 1

  const pipRadius = resolution * (value === 1 ? 0.115 : 0.083)
  for (const [x, y] of PIP_LAYOUT[value]) {
    const cx = x * resolution
    const cy = y * resolution

    // Drop shadow below the pip sells the drilled-out recess.
    ctx.beginPath()
    ctx.arc(cx, cy + pipRadius * 0.16, pipRadius * 1.04, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, pipRadius, 0, Math.PI * 2)
    const pipShade = ctx.createRadialGradient(
      cx - pipRadius * 0.35, cy - pipRadius * 0.35, pipRadius * 0.1,
      cx, cy, pipRadius,
    )
    pipShade.addColorStop(0, skin.pip)
    pipShade.addColorStop(1, skin.pip)
    ctx.fillStyle = pipShade
    ctx.fill()

    // A tiny specular catch-light on the pip's upper-left.
    ctx.beginPath()
    ctx.arc(cx - pipRadius * 0.3, cy - pipRadius * 0.3, pipRadius * 0.26, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fill()
  }

  return canvas
}

/** The six face materials for a die, in BoxGeometry order. */
export function createDieMaterials(skin: DiceSkin, resolution = 256): THREE.MeshStandardMaterial[] {
  return FACE_VALUES.map((value) => {
    const texture = new THREE.CanvasTexture(drawFace(value, skin, resolution))
    texture.anisotropy = 4
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: skin.roughness,
      metalness: skin.metalness,
    })
  })
}

export function disposeMaterials(materials: THREE.MeshStandardMaterial[]): void {
  for (const material of materials) {
    material.map?.dispose()
    material.dispose()
  }
}
