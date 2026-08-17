import * as THREE from 'three'
import { createRoundedDieGeometry, createDieMaterials, DICE_SKINS } from './dice3d/diceGeometry'
import { createStudioEnvironment } from './dice3d/environment'
import { restingOrientation } from './dice3d/DiceTable'
import type { DieValue } from './engine/types'

/** Renders app-icon candidates using the game's own dice: same geometry, same
 *  materials, same lighting. A flat vector die looks like every other dice
 *  app; these look like the thing the icon actually opens. */

interface DiePlacement {
  skin: string
  value: DieValue
  position: [number, number, number]
  /** Extra tilt in radians, applied after the value orientation. */
  tilt: [number, number, number]
  scale?: number
}

interface Variant {
  id: string
  background: [string, string]
  glow: string
  dice: DiePlacement[]
}

const VARIANTS: Variant[] = [
  {
    id: 'hero',
    background: ['#2a9bf0', '#06407a'],
    glow: 'rgba(255,231,150,0.55)',
    dice: [{ skin: 'ivory', value: 5, position: [0, 0, 0], tilt: [-0.34, 0.62, 0.12], scale: 1.42 }],
  },
  {
    id: 'pair',
    background: ['#2a9bf0', '#06407a'],
    glow: 'rgba(255,231,150,0.5)',
    dice: [
      { skin: 'ivory', value: 5, position: [-0.52, -0.28, 0], tilt: [-0.3, 0.5, 0.18], scale: 1.12 },
      { skin: 'gold', value: 1, position: [0.62, 0.42, -0.4], tilt: [-0.25, -0.5, -0.22], scale: 0.98 },
    ],
  },
  {
    id: 'yahtzee',
    background: ['#2a9bf0', '#06407a'],
    glow: 'rgba(255,216,94,0.62)',
    dice: [
      { skin: 'ivory', value: 5, position: [-0.86, -0.42, 0.1], tilt: [-0.3, 0.42, 0.14], scale: 0.94 },
      { skin: 'ivory', value: 5, position: [0.08, 0.06, -0.2], tilt: [-0.32, 0.05, -0.05], scale: 1.02 },
      { skin: 'ivory', value: 5, position: [0.94, 0.5, -0.5], tilt: [-0.28, -0.44, -0.16], scale: 0.9 },
    ],
  },
  {
    id: 'ruby',
    background: ['#2a9bf0', '#06407a'],
    glow: 'rgba(255,150,150,0.45)',
    dice: [{ skin: 'ruby', value: 5, position: [0, 0, 0], tilt: [-0.34, 0.62, 0.12], scale: 1.42 }],
  },
  {
    id: 'night',
    background: ['#123a63', '#04182e'],
    glow: 'rgba(255,216,94,0.7)',
    dice: [{ skin: 'gold', value: 5, position: [0, 0, 0], tilt: [-0.34, 0.62, 0.12], scale: 1.42 }],
  },
  {
    id: 'duo-red',
    background: ['#2a9bf0', '#06407a'],
    glow: 'rgba(255,231,150,0.5)',
    dice: [
      { skin: 'ivory', value: 5, position: [-0.5, -0.3, 0], tilt: [-0.3, 0.52, 0.16], scale: 1.14 },
      { skin: 'ruby', value: 1, position: [0.64, 0.44, -0.4], tilt: [-0.24, -0.48, -0.2], scale: 0.98 },
    ],
  },
]

const SIZE = 1024

function paintBackground(variant: Variant): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  const base = ctx.createLinearGradient(0, 0, 0, SIZE)
  base.addColorStop(0, variant.background[0])
  base.addColorStop(1, variant.background[1])
  ctx.fillStyle = base
  ctx.fillRect(0, 0, SIZE, SIZE)

  // A glow behind the dice lifts them off the background and gives the icon a
  // focal point at sizes where detail is gone.
  const glow = ctx.createRadialGradient(SIZE * 0.5, SIZE * 0.46, 0, SIZE * 0.5, SIZE * 0.46, SIZE * 0.5)
  glow.addColorStop(0, variant.glow)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Corner vignette, so the shape still reads once a launcher masks it.
  const vignette = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.3, SIZE / 2, SIZE / 2, SIZE * 0.78)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, SIZE, SIZE)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function render(variant: Variant): void {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    // Without this the drawing buffer is cleared once the frame is presented,
    // and reading the canvas back afterwards yields a blank image.
    preserveDrawingBuffer: true,
  })
  renderer.setSize(SIZE, SIZE, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.id = variant.id
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = paintBackground(variant)
  scene.environment = createStudioEnvironment(renderer)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
  camera.position.set(0, 0.55, 6.0)
  camera.lookAt(0, 0.05, 0)

  scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x0c2438, 0.5))
  const key = new THREE.DirectionalLight(0xfff6e6, 2.4)
  key.position.set(-2.4, 5.0, 3.4)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -5
  key.shadow.camera.right = 5
  key.shadow.camera.top = 5
  key.shadow.camera.bottom = -5
  key.shadow.bias = -0.0012
  key.shadow.radius = 4
  scene.add(key)
  // Rim light along the far edge, which is what makes a die look solid.
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.5)
  rim.position.set(4, 1.4, -3.5)
  scene.add(rim)

  // Catches the drop shadow without drawing a surface of its own.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.ShadowMaterial({ opacity: 0.5 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -1.12
  floor.receiveShadow = true
  scene.add(floor)

  const geometry = createRoundedDieGeometry(1, 0.14, 6)
  for (const placement of variant.dice) {
    const skin = DICE_SKINS[placement.skin]
    if (!skin) continue
    const mesh = new THREE.Mesh(geometry, createDieMaterials(skin, 512))
    mesh.castShadow = true
    mesh.position.set(...placement.position)
    mesh.scale.setScalar(placement.scale ?? 1)
    mesh.quaternion.copy(restingOrientation(placement.value))
    mesh.rotateX(placement.tilt[0])
    mesh.rotateY(placement.tilt[1])
    mesh.rotateZ(placement.tilt[2])
    scene.add(mesh)
  }

  renderer.render(scene, camera)
}

for (const variant of VARIANTS) render(variant)
;(window as unknown as { __iconsReady: boolean }).__iconsReady = true
