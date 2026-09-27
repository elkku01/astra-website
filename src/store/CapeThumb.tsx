import { useEffect, useRef } from 'react'
import { capeFileUrl, capeThumbUrl, loadCapeImage } from './capeArt'
import type { Cape } from './capes'

type Props = {
  cape: Cape
}

const FACE_W = 160
const FACE_H = 256

export default function CapeThumb({ cape }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animated = cape.frames > 1

  useEffect(() => {
    if (!animated) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    let frame = 0
    let timer = 0
    let cancelled = false

    void loadCapeImage(capeFileUrl(cape))
      .then((image) => {
        if (cancelled || !canvasRef.current) return
        const frames = Math.max(1, cape.frames)
        const frameHeight = image.height / frames
        const unitU = image.width / 64
        const unitV = frameHeight / 32
        const sx = 1 * unitU
        const sw = 10 * unitU
        const sh = 16 * unitV
        const paint = () => {
          const sy = frame * frameHeight + 1 * unitV
          ctx.clearRect(0, 0, FACE_W, FACE_H)
          ctx.drawImage(image, sx, sy, sw, sh, 0, 0, FACE_W, FACE_H)
        }
        paint()
        timer = window.setInterval(() => {
          frame = (frame + 1) % frames
          paint()
        }, cape.frameTimeMs)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      if (timer) window.clearInterval(timer)
    }
  }, [animated, cape])

  return (
    <span className="cape-well">
      {animated ? (
        <canvas
          ref={canvasRef}
          className="cape-face"
          width={FACE_W}
          height={FACE_H}
          aria-hidden="true"
        />
      ) : (
        <img className="cape-face" src={capeThumbUrl(cape)} alt="" draggable={false} />
      )}
    </span>
  )
}
