import * as THREE from 'three'
import type { DieValue } from '@/engine/types'
import { DICE_SKINS, type DecorSet, type DiceSkin, type PipShape } from './skins'

// Re-exported so callers can keep importing dice from one place.
export { DICE_SKINS }
export type { DecorSet, DiceSkin, PipShape }

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

/** Blend two hex colours. Used to shade pips without hand-listing variants. */
function mix(a: string, b: string, amount: number): string {
  const parse = (hex: string): [number, number, number] => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
  const [r1, g1, b1] = parse(a)
  const [r2, g2, b2] = parse(b)
  const channel = (x: number, y: number): number => Math.round(x + (y - x) * amount)
  return `rgb(${channel(r1, r2)}, ${channel(g1, g2)}, ${channel(b1, b2)})`
}

/** Pip positions as fractions of the face, for each value. Exported so the
 *  art placement can be checked against them. */
export const PIP_LAYOUT: Record<DieValue, [number, number][]> = {
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
  ctx.globalAlpha = 0.72
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, resolution, resolution)
  ctx.globalAlpha = 1

  if (skin.grain) drawGrain(ctx, resolution, skin.edge)
  // Art first, pips second: whatever the joke is, it never sits on top of
  // the number.
  if (skin.decor) drawDecor(ctx, value, skin.decor, resolution)

  const pipRadius = resolution * (value === 1 ? 0.125 : 0.092)
  if (skin.decor) clearForPips(ctx, value, skin.body, pipRadius, resolution)

  if (skin.pipShape === 'cheeky') {
    PIP_LAYOUT[value].forEach(([x, y], index) => {
      // Each one set at its own angle, as they are on the real thing.
      const angle = ((index * 47 + value * 23) % 360) * (Math.PI / 180)
      drawCheekyPip(ctx, x * resolution, y * resolution, pipRadius * 2.3, angle, skin.pip)
    })
    return canvas
  }

  for (const [x, y] of PIP_LAYOUT[value]) {
    const cx = x * resolution
    const cy = y * resolution

    // A pip is drilled, not printed. The rim below it catches light while the
    // hollow above stays dark, which is what reads as depth on a flat texture.
    ctx.beginPath()
    ctx.arc(cx, cy + pipRadius * 0.1, pipRadius * 1.09, 0, Math.PI * 2)
    const rim = ctx.createLinearGradient(0, cy - pipRadius, 0, cy + pipRadius * 1.1)
    rim.addColorStop(0, 'rgba(0,0,0,0.22)')
    rim.addColorStop(1, 'rgba(255,255,255,0.22)')
    ctx.fillStyle = rim
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx, cy, pipRadius, 0, Math.PI * 2)
    const pipShade = ctx.createRadialGradient(
      cx + pipRadius * 0.28, cy + pipRadius * 0.38, pipRadius * 0.05,
      cx, cy, pipRadius * 1.1,
    )
    // Only the faintest lift where the hollow catches light, then straight to
    // the pip colour and darker still at the rim.
    pipShade.addColorStop(0, mix(skin.pip, '#ffffff', 0.06))
    pipShade.addColorStop(0.4, skin.pip)
    pipShade.addColorStop(1, mix(skin.pip, '#000000', 0.5))
    ctx.fillStyle = pipShade
    ctx.fill()
  }

  return canvas
}

/** How much of the face the art covers, as a fraction of its width.
 *
 *  The art fills the face and the pips sit on top of it, rather than the two
 *  sharing the space. Slightly under one so the illustration stops short of
 *  the rounded edge, where the geometry curves away and would clip it. */
export const DECOR_SIZE = 0.94

/** How far the clearing behind a pip reaches, as a multiple of the pip radius.
 *
 *  A dark pip on a dark part of the illustration would disappear, and a die you
 *  cannot read is not worth the joke. Each pip knocks a soft hole in the art
 *  underneath it, in the body colour, so it always has its own ground to sit
 *  on however busy the face behind it is. */
export const PIP_CLEARING = 1.6

/** The colour emoji font, which every Android WebView ships and which saves
 *  hand-drawing sixty little illustrations. Named explicitly rather than left
 *  to the default stack: the fallback for a missing glyph is an empty box, and
 *  a die with a blank face is worse than no theme at all. */
const EMOJI_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", "Twemoji Mozilla", sans-serif'

/** Paint a face's illustration across the whole face. */
function drawDecor(
  ctx: CanvasRenderingContext2D,
  value: DieValue,
  decor: DecorSet,
  resolution: number,
): void {
  const glyph = decor[value - 1]
  if (!glyph) return

  ctx.save()
  ctx.font = `${DECOR_SIZE * resolution}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = resolution * 0.03
  ctx.shadowOffsetY = resolution * 0.01
  ctx.fillText(glyph, resolution / 2, resolution / 2)
  ctx.restore()
}

/** Knock a soft hole in the art wherever a pip is about to land. */
function clearForPips(
  ctx: CanvasRenderingContext2D,
  value: DieValue,
  body: string,
  pipRadius: number,
  resolution: number,
): void {
  ctx.save()
  for (const [x, y] of PIP_LAYOUT[value]) {
    const cx = x * resolution
    const cy = y * resolution
    const reach = pipRadius * PIP_CLEARING
    const clearing = ctx.createRadialGradient(cx, cy, pipRadius * 0.7, cx, cy, reach)
    // Solid under the pip itself and faded to nothing at the rim, so it reads
    // as the art lightening around the pip rather than as a disc stuck on it.
    clearing.addColorStop(0, body)
    clearing.addColorStop(0.55, body)
    clearing.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = 0.7
    ctx.fillStyle = clearing
    ctx.beginPath()
    ctx.arc(cx, cy, reach, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A novelty pip, drawn as a filled silhouette rather than an outline.
 *  At the size a pip occupies on a die face an outline turns to mush, while a
 *  solid shape stays readable. */
function drawCheekyPip(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  angle: number,
  colour: string,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.scale(size, size)
  ctx.fillStyle = colour

  // Built from overlapping solids rather than one traced outline: the parts
  // merge into a single silhouette, and each stays legible at the size a pip
  // actually occupies, where a fine outline would close up into a smudge.
  ctx.beginPath()
  ctx.arc(-0.33, 0.66, 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0.33, 0.66, 0.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(-0.2, 0.7)
  ctx.lineTo(-0.2, -0.4)
  ctx.lineTo(0.2, -0.4)
  ctx.lineTo(0.2, 0.7)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.arc(0, -0.45, 0.33, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

/** Faint wood grain, for the dice meant to look turned rather than moulded. */
function drawGrain(ctx: CanvasRenderingContext2D, resolution: number, edge: string): void {
  ctx.save()
  ctx.globalAlpha = 0.16
  ctx.strokeStyle = edge
  ctx.lineWidth = resolution * 0.008
  for (let i = 0; i < 7; i++) {
    const y = ((i + 0.5) / 7) * resolution
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(
      resolution * 0.3, y - resolution * 0.035,
      resolution * 0.7, y + resolution * 0.035,
      resolution, y,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/** The six face materials for a die, in BoxGeometry order. */
export function createDieMaterials(skin: DiceSkin, resolution = 256): THREE.MeshPhysicalMaterial[] {
  // Shaped pips carry far more detail than a circle and need the extra pixels.
  const detailed = (skin.pipShape && skin.pipShape !== 'dot') || Boolean(skin.decor)
  const size = detailed ? resolution * 2 : resolution
  return FACE_VALUES.map((value) => {
    const texture = new THREE.CanvasTexture(drawFace(value, skin, size))
    texture.anisotropy = 8
    texture.colorSpace = THREE.SRGBColorSpace
    return new THREE.MeshPhysicalMaterial({
      map: texture,
      roughness: skin.roughness,
      metalness: skin.metalness,
      // A thin lacquer over the body. This is what gives the rounded edges a
      // moving highlight, which is most of what separates a real die from a
      // flat-shaded cube.
      clearcoat: 0.5,
      clearcoatRoughness: 0.22,
      // The scene environment now contributes most of the fill, so this stays
      // low; higher values blow the faces out and grey the pips.
      envMapIntensity: 0.55,
    })
  })
}

export function disposeMaterials(materials: THREE.MeshPhysicalMaterial[]): void {
  for (const material of materials) {
    material.map?.dispose()
    material.dispose()
  }
}
