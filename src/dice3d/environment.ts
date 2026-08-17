import * as THREE from 'three'

/** A small procedural studio environment for reflections.
 *
 *  Dice with no environment map read as flat plastic, because a real die
 *  picks up the room around it along its rounded edges. Rather than ship an
 *  HDR file, this paints an equirectangular sky by hand — bright overhead,
 *  dark underneath, with a couple of soft highlights standing in for lamps —
 *  and prefilters it. It costs a few kilobytes of canvas rather than a
 *  megabyte of texture, and at dice scale the difference is invisible. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const width = 256
  const height = 128
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  // Vertical gradient: sky above, table below.
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(0, '#ffffff')
  sky.addColorStop(0.45, '#cfe2f5')
  sky.addColorStop(0.55, '#4a5a68')
  sky.addColorStop(1, '#11202c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)

  // Two soft key lights, so edges catch a highlight as the die turns.
  const lamp = (x: number, y: number, radius: number, strength: number): void => {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, `rgba(255,255,255,${strength})`)
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }
  lamp(width * 0.28, height * 0.2, 46, 0.95)
  lamp(width * 0.74, height * 0.3, 34, 0.55)

  const texture = new THREE.CanvasTexture(canvas)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromEquirectangular(texture).texture
  pmrem.dispose()
  texture.dispose()

  return environment
}
