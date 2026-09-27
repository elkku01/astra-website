import type { Cape } from './capes'

const frameCache = new Map<string, string>()

export function capeFileUrl(cape: Cape | string): string {
  const id = typeof cape === 'string' ? cape : cape.id
  const base = import.meta.env.BASE_URL || '/'
  return `${base}capes/${id}.png`.replace(/([^:/])\/{2,}/g, '$1/')
}

export function capeThumbUrl(cape: Cape | string): string {
  const id = typeof cape === 'string' ? cape : cape.id
  const base = import.meta.env.BASE_URL || '/'
  return `${base}capes/thumbs/${id}.png`.replace(/([^:/])\/{2,}/g, '$1/')
}

export function extractCapeFrame(image: HTMLImageElement, cape: Cape, frame = 0): string {
  const key = `${cape.id}:${frame}:${image.width}x${image.height}`
  const cached = frameCache.get(key)
  if (cached) return cached
  const canvas = capeFrameCanvas(image, Math.max(1, cape.frames), frame)
  const url = canvas.toDataURL('image/png')
  frameCache.set(key, url)
  return url
}

/** Draw one stacked-sheet frame onto a 2:1 canvas (64×32 cape layout). */
export function paintCapeFrame(
  target: HTMLCanvasElement,
  image: HTMLImageElement,
  frames: number,
  frame: number,
) {
  const count = Math.max(1, frames)
  const srcFrameH = Math.max(1, image.height / count)
  const sy = Math.min(Math.max(0, frame), count - 1) * srcFrameH
  const width = Math.max(1, image.width)
  const height = Math.max(1, Math.round(width / 2))
  if (target.width !== width || target.height !== height) {
    target.width = width
    target.height = height
  }
  const ctx = target.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, sy, width, srcFrameH, 0, 0, width, height)
}

/** One cape frame as a 2:1 sheet (64×32 layout), which skinview3d requires. */
export function capeFrameCanvas(
  image: HTMLImageElement,
  frames: number,
  frame = 0,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  paintCapeFrame(canvas, image, frames, frame)
  return canvas
}

export async function loadCapeImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  if (image.decode) {
    await image.decode()
  } else {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error(`Could not load ${src}`))
    })
  }
  return image
}
