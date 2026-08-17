import * as THREE from 'three'
import type { DieValue } from '@/engine/types'
import {
  DICE_SKINS,
  createDieMaterials,
  createRoundedDieGeometry,
  disposeMaterials,
  type DiceSkin,
} from './diceGeometry'
import { DEFAULT_TRAY, DIE_SIZE, FIXED_STEP, type RollAnimation } from './physicsRoll'

export type TableQuality = 'high' | 'low'

export interface DiceTableOptions {
  container: HTMLElement
  skinId?: string
  feltColor?: string
  quality?: TableQuality
  /** Fired when the player taps a die. Ignored while dice are in motion. */
  onDieTap?: (index: number) => void
}

/** Where dice come to rest so the hand is easy to read and easy to tap. */
const ROW_Z = 1.35
const ROW_SPACING = DIE_SIZE * 1.34
const HELD_LIFT = 0.34
const ARRANGE_MS = 460
const SETTLE_PAUSE_MS = 190

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t: number): number => {
  const c = 1.7
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

interface DieView {
  mesh: THREE.Mesh
  ring: THREE.Mesh
  held: boolean
  /** Ring opacity and lift are eased rather than snapped. */
  heldAmount: number
  slot: number
}

/** Procedural felt: flat colour, fine noise so it does not read as plastic,
 *  and a vignette that pulls focus to the middle of the table. */
function createFeltTexture(color: string, size = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  ctx.fillStyle = color
  ctx.fillRect(0, 0, size, size)

  const image = ctx.getImageData(0, 0, size, size)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 26
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + noise))
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] as number) + noise))
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] as number) + noise))
  }
  ctx.putImageData(image, 0, 0)

  const vignette = ctx.createRadialGradient(
    size / 2, size / 2, size * 0.18,
    size / 2, size / 2, size * 0.62,
  )
  vignette.addColorStop(0, 'rgba(255,255,255,0.06)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export class DiceTable {
  private readonly container: HTMLElement
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()

  private geometry: THREE.BufferGeometry
  private materials: THREE.MeshStandardMaterial[]
  private skin: DiceSkin
  private dice: DieView[] = []

  /** 0 frames the whole throwing area, 1 frames just the settled row.
   *  The camera rides between them so the tumble stays in shot and the
   *  result is still big enough to read on a phone. */
  private cameraBlend = 1
  private cameraTarget = 1
  private wideDistance = 15
  private closeDistance = 10

  private quality: TableQuality
  private running = true
  private needsRender = true
  private frameHandle = 0
  private lastFrameTime = 0

  /** Resolves when the current roll animation finishes. */
  private rollResolve: (() => void) | null = null
  private animation: {
    roll: RollAnimation
    indices: number[]
    elapsed: number
    phase: 'tumble' | 'pause' | 'arrange'
    from: { position: THREE.Vector3; quaternion: THREE.Quaternion; target: THREE.Quaternion }[]
  } | null = null

  private readonly onDieTap: ((index: number) => void) | undefined
  private readonly resizeObserver: ResizeObserver

  constructor(options: DiceTableOptions) {
    this.container = options.container
    this.onDieTap = options.onDieTap
    this.quality = options.quality ?? 'high'
    this.skin = DICE_SKINS[options.skinId ?? 'ivory'] as DiceSkin

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality === 'high',
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = this.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'manipulation'
    this.container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120)
    this.camera.position.set(0, 12.4, 9.6)
    this.camera.lookAt(0, 0, 0.4)

    this.buildTable(options.feltColor ?? '#1d6b45')
    this.buildLights()

    this.geometry = createRoundedDieGeometry(DIE_SIZE, DIE_SIZE * 0.13, this.quality === 'high' ? 5 : 3)
    this.materials = createDieMaterials(this.skin, this.quality === 'high' ? 256 : 128)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.resize()

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.loop(0)
  }

  private buildTable(feltColor: string): void {
    const felt = new THREE.Mesh(
      new THREE.PlaneGeometry(DEFAULT_TRAY.width + 8, DEFAULT_TRAY.depth + 8),
      new THREE.MeshStandardMaterial({
        map: createFeltTexture(feltColor),
        roughness: 0.96,
        metalness: 0,
      }),
    )
    felt.rotation.x = -Math.PI / 2
    felt.receiveShadow = true
    this.scene.add(felt)
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x14301f, 0.85))

    const key = new THREE.DirectionalLight(0xfff4e2, 2.1)
    key.position.set(-5.5, 13, 7)
    key.castShadow = true
    const shadowSize = this.quality === 'high' ? 2048 : 1024
    key.shadow.mapSize.set(shadowSize, shadowSize)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 40
    key.shadow.camera.left = -11
    key.shadow.camera.right = 11
    key.shadow.camera.top = 11
    key.shadow.camera.bottom = -11
    key.shadow.bias = -0.0012
    key.shadow.radius = 3
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0x9fc4ff, 0.5)
    fill.position.set(7, 6, -5)
    this.scene.add(fill)
  }

  /** Create or destroy die meshes so the table shows exactly `count` dice. */
  setDiceCount(count: number): void {
    while (this.dice.length > count) {
      const view = this.dice.pop() as DieView
      this.scene.remove(view.mesh, view.ring)
      ;(view.ring.material as THREE.Material).dispose()
      view.ring.geometry.dispose()
    }
    while (this.dice.length < count) {
      const mesh = new THREE.Mesh(this.geometry, this.materials)
      mesh.castShadow = true
      mesh.receiveShadow = false
      this.scene.add(mesh)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(DIE_SIZE * 0.66, DIE_SIZE * 0.84, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffd85e,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.012
      this.scene.add(ring)

      this.dice.push({ mesh, ring, held: false, heldAmount: 0, slot: this.dice.length })
    }
    this.layoutSlots()
    this.computeFraming()
    this.applyCamera()
    this.needsRender = true
  }

  /** Row positions, centred, so any dice count reads as a tidy hand. */
  private slotPosition(slot: number, total: number): THREE.Vector3 {
    const offset = (total - 1) / 2
    return new THREE.Vector3((slot - offset) * ROW_SPACING, DIE_SIZE / 2, ROW_Z)
  }

  private layoutSlots(): void {
    this.dice.forEach((view, i) => {
      view.slot = i
      const target = this.slotPosition(i, this.dice.length)
      view.mesh.position.copy(target)
      view.ring.position.set(target.x, 0.012, target.z)
    })
  }

  /** Show a hand immediately, with no animation. Used when restoring a saved
   *  game or catching up to a remote player's move. */
  showValues(values: readonly DieValue[]): void {
    this.setDiceCount(values.length)
    values.forEach((value, i) => {
      const view = this.dice[i] as DieView
      view.mesh.quaternion.copy(restingOrientation(value))
      const target = this.slotPosition(i, values.length)
      view.mesh.position.copy(target)
      view.mesh.position.y = DIE_SIZE / 2 + view.heldAmount * HELD_LIFT
      view.ring.position.set(target.x, 0.012, target.z)
    })
    this.needsRender = true
  }

  setHeld(flags: readonly boolean[]): void {
    flags.forEach((held, i) => {
      const view = this.dice[i]
      if (view) view.held = held
    })
    this.needsRender = true
  }

  setSkin(skinId: string): void {
    const skin = DICE_SKINS[skinId]
    if (!skin || skin.id === this.skin.id) return
    this.skin = skin
    const old = this.materials
    this.materials = createDieMaterials(skin, this.quality === 'high' ? 256 : 128)
    for (const view of this.dice) view.mesh.material = this.materials
    disposeMaterials(old)
    this.needsRender = true
  }

  /** Play a recorded throw. `indices` names which dice are being rerolled;
   *  everything else stays put, so held dice never twitch. */
  playRoll(roll: RollAnimation, indices: readonly number[]): Promise<void> {
    this.setDiceCount(Math.max(this.dice.length, indices.length))
    return new Promise((resolve) => {
      this.rollResolve = resolve
      this.animation = {
        roll,
        indices: [...indices],
        elapsed: 0,
        phase: 'tumble',
        from: [],
      }
      this.needsRender = true
    })
  }

  /** Skip straight to the settled hand — for reduced-motion users and for the
   *  fast-forward button. */
  finishRoll(): void {
    if (!this.animation) return
    const { roll, indices } = this.animation
    indices.forEach((dieIndex, i) => {
      const trajectory = roll.dice[i]
      const view = this.dice[dieIndex]
      if (!trajectory || !view) return
      view.mesh.quaternion.copy(restingOrientation(trajectory.value))
      const target = this.slotPosition(view.slot, this.dice.length)
      view.mesh.position.copy(target)
    })
    this.animation = null
    this.rollResolve?.()
    this.rollResolve = null
    this.needsRender = true
  }

  get isAnimating(): boolean {
    return this.animation !== null
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.animation || !this.onDieTap) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.dice.map((d) => d.mesh), false)
    const hit = hits[0]
    if (!hit) return
    const index = this.dice.findIndex((d) => d.mesh === hit.object)
    if (index >= 0) this.onDieTap(index)
  }

  private advanceAnimation(deltaMs: number): void {
    const animation = this.animation
    if (!animation) return
    animation.elapsed += deltaMs

    if (animation.phase === 'tumble') {
      const frame = Math.floor(animation.elapsed / 1000 / FIXED_STEP)
      let allDone = true
      animation.indices.forEach((dieIndex, i) => {
        const trajectory = animation.roll.dice[i]
        const view = this.dice[dieIndex]
        if (!trajectory || !view) return
        const f = Math.min(frame, trajectory.frameCount - 1)
        if (frame < trajectory.frameCount - 1) allDone = false
        const p = f * 3
        const q = f * 4
        view.mesh.position.set(
          trajectory.positions[p] as number,
          trajectory.positions[p + 1] as number,
          trajectory.positions[p + 2] as number,
        )
        view.mesh.quaternion.set(
          trajectory.quaternions[q] as number,
          trajectory.quaternions[q + 1] as number,
          trajectory.quaternions[q + 2] as number,
          trajectory.quaternions[q + 3] as number,
        )
      })
      if (allDone) {
        animation.phase = 'pause'
        animation.elapsed = 0
      }
      return
    }

    if (animation.phase === 'pause') {
      if (animation.elapsed >= SETTLE_PAUSE_MS) {
        // Capture where the tumble left each die, then glide into the row.
        animation.from = animation.indices.map((dieIndex, i) => {
          const view = this.dice[dieIndex] as DieView
          const quaternion = view.mesh.quaternion.clone()
          const value = animation.roll.dice[i]?.value ?? 1
          return {
            position: view.mesh.position.clone(),
            quaternion,
            // Physics leaves dice resting up to a few degrees off square. Easing
            // to an exactly flat orientation showing the same value cleans that
            // up as part of the settle, so the hand never looks strewn about.
            target: settleOrientation(quaternion, value),
          }
        })
        animation.phase = 'arrange'
        animation.elapsed = 0
      }
      return
    }

    const t = Math.min(1, animation.elapsed / ARRANGE_MS)
    const eased = easeOutCubic(t)
    animation.indices.forEach((dieIndex, i) => {
      const view = this.dice[dieIndex]
      const start = animation.from[i]
      if (!view || !start) return
      const target = this.slotPosition(view.slot, this.dice.length)
      view.mesh.position.lerpVectors(start.position, target, eased)
      // A small hop as they slide home reads as weight rather than a slide.
      view.mesh.position.y = THREE.MathUtils.lerp(start.position.y, DIE_SIZE / 2, eased)
        + Math.sin(Math.PI * t) * 0.28
      view.mesh.quaternion.slerpQuaternions(start.quaternion, start.target, eased)
    })

    if (t >= 1) {
      this.animation = null
      this.rollResolve?.()
      this.rollResolve = null
    }
  }

  private updateCamera(deltaMs: number): void {
    // Pull out for the throw, ease back in once the dice are lining up.
    this.cameraTarget = this.animation && this.animation.phase === 'tumble' ? 0 : 1
    if (Math.abs(this.cameraBlend - this.cameraTarget) < 0.0015) {
      if (this.cameraBlend !== this.cameraTarget) {
        this.cameraBlend = this.cameraTarget
        this.applyCamera()
        this.needsRender = true
      }
      return
    }
    // A dolly out should be quicker than the dolly in, so the camera is already
    // wide by the time the dice arrive rather than chasing them across.
    const speed = this.cameraTarget === 0 ? deltaMs / 220 : deltaMs / 620
    this.cameraBlend += Math.sign(this.cameraTarget - this.cameraBlend)
      * Math.min(speed, Math.abs(this.cameraTarget - this.cameraBlend))
    this.applyCamera()
    this.needsRender = true
  }

  private updateHeldVisuals(deltaMs: number): void {
    const step = deltaMs / 180
    for (const view of this.dice) {
      const target = view.held ? 1 : 0
      if (Math.abs(view.heldAmount - target) < 0.001) {
        view.heldAmount = target
        continue
      }
      view.heldAmount += Math.sign(target - view.heldAmount) * Math.min(step, Math.abs(target - view.heldAmount))
      this.needsRender = true
    }

    if (this.animation) return
    for (const view of this.dice) {
      const lift = easeOutBack(Math.min(1, view.heldAmount)) * HELD_LIFT
      view.mesh.position.y = DIE_SIZE / 2 + lift
      const ringMaterial = view.ring.material as THREE.MeshBasicMaterial
      ringMaterial.opacity = view.heldAmount * 0.85
      view.ring.position.x = view.mesh.position.x
      view.ring.position.z = view.mesh.position.z
      view.ring.scale.setScalar(0.8 + view.heldAmount * 0.2)
    }
  }

  /** Distance at which a span of `width` world units fills the viewport,
   *  accounting for the table being viewed at a slant rather than head-on. */
  private distanceFor(width: number): number {
    const vFov = (this.camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect)
    return width / 2 / Math.tan(hFov / 2)
  }

  private computeFraming(): void {
    const rowWidth = ROW_SPACING * Math.max(2, this.dice.length) + 1.5
    this.wideDistance = Math.max(12, this.distanceFor(DEFAULT_TRAY.width + 1) + 1.5)
    this.closeDistance = Math.max(6.4, this.distanceFor(rowWidth) + 1.4)
  }

  private applyCamera(): void {
    const distance = THREE.MathUtils.lerp(this.wideDistance, this.closeDistance, this.cameraBlend)
    // The close framing also drops nearer to table level, so settled dice are
    // seen more from the side and their faces read larger.
    const height = THREE.MathUtils.lerp(0.82, 0.66, this.cameraBlend)
    const back = THREE.MathUtils.lerp(0.58, 0.76, this.cameraBlend)
    const lookZ = THREE.MathUtils.lerp(0, ROW_Z * 0.8, this.cameraBlend)
    this.camera.position.set(0, distance * height, distance * back)
    this.camera.lookAt(0, 0, lookZ)
  }

  private resize(): void {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    if (width === 0 || height === 0) return

    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.computeFraming()
    this.applyCamera()
    this.needsRender = true
  }

  private readonly loop = (time: number): void => {
    if (!this.running) return
    this.frameHandle = requestAnimationFrame(this.loop)
    const delta = this.lastFrameTime === 0 ? 16.7 : Math.min(64, time - this.lastFrameTime)
    this.lastFrameTime = time

    if (this.animation) {
      this.advanceAnimation(delta)
      this.needsRender = true
    }
    this.updateCamera(delta)
    this.updateHeldVisuals(delta)

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera)
      this.needsRender = false
    }
  }

  dispose(): void {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    for (const view of this.dice) {
      this.scene.remove(view.mesh, view.ring)
      view.ring.geometry.dispose()
      ;(view.ring.material as THREE.Material).dispose()
    }
    this.geometry.dispose()
    disposeMaterials(this.materials)
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) object.geometry.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

/** Rotate about world Y so the die sits square to the table. Spinning around
 *  the vertical axis cannot change which face points up, so the value shown is
 *  preserved exactly. */
export function squareUp(quaternion: THREE.Quaternion): THREE.Quaternion {
  // Snap against whichever local axis lies flattest. Always using +X would be
  // degenerate on a die showing 1 or 6, where that axis points straight up and
  // has no heading to snap.
  let axis = new THREE.Vector3()
  let flattest = Infinity
  for (const local of [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ]) {
    const world = local.applyQuaternion(quaternion)
    if (Math.abs(world.y) < flattest) {
      flattest = Math.abs(world.y)
      axis = world
    }
  }
  axis.y = 0
  if (axis.lengthSq() < 1e-6) return quaternion.clone()
  axis.normalize()
  const angle = Math.atan2(axis.z, axis.x)
  const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
  // A positive rotation about +Y decreases an atan2(z, x) heading, so the yaw
  // needed to move `angle` onto `snapped` is their difference negated.
  const correction = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle - snapped)
  return correction.multiply(quaternion)
}

/** The perfectly flat orientation showing `value` that is closest to where the
 *  die currently lies, so righting it is the shortest possible turn. */
export function settleOrientation(current: THREE.Quaternion, value: DieValue): THREE.Quaternion {
  const base = restingOrientation(value)
  let best = base
  let bestDot = -Infinity
  for (let quarter = 0; quarter < 4; quarter++) {
    const candidate = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (quarter * Math.PI) / 2)
      .multiply(base)
    // Quaternions double-cover rotations, so compare absolute dot products.
    const dot = Math.abs(candidate.dot(current))
    if (dot > bestDot) {
      bestDot = dot
      best = candidate
    }
  }
  return best
}

/** A canonical flat orientation showing the given value. */
export function restingOrientation(value: DieValue): THREE.Quaternion {
  const q = new THREE.Quaternion()
  switch (value) {
    case 2: return q // +Y already carries the 2
    case 5: return q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    case 1: return q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    case 6: return q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2)
    case 3: return q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    case 4: return q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2)
  }
}
