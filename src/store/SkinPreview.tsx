import { useEffect, useRef } from 'react'
import { IdleAnimation, SkinViewer, WalkingAnimation } from 'skinview3d'
import type { MeshStandardMaterial } from 'three'
import { capeFileUrl, capeFrameCanvas, loadCapeImage, paintCapeFrame } from './capeArt'
import type { Cape } from './capes'
import { skinSources } from './api'
import steveSkin from '../assets/steve.png'

type Props = {
  cape: Cape
  username?: string | null
  uuid?: string | null
  skinTexture?: string | null
  walking?: boolean
  width?: number
  height?: number
}

function lockPreviewCamera(viewer: SkinViewer) {
  viewer.controls.enableRotate = false
  viewer.controls.enablePan = false
  viewer.controls.enableZoom = false
  viewer.controls.minAzimuthAngle = 0
  viewer.controls.maxAzimuthAngle = 0
  viewer.controls.minPolarAngle = Math.PI / 2
  viewer.controls.maxPolarAngle = Math.PI / 2
  viewer.playerWrapper.rotation.y = Math.PI + 0.32
}

const CAPE_Z_IDLE = -2
const CAPE_Z_WALK = -3.35

function solidCloak(viewer: SkinViewer, walking = false) {
  const mesh = viewer.playerObject.cape.cape
  mesh.scale.z = 1
  // BoxGeometry groups: +x -x +y -y +z -z. Keep only front/back so the
  // 1px sides cannot show as a rainbow-transparent strip.
  mesh.geometry.setDrawRange(24, 12)
  const material = mesh.material as MeshStandardMaterial
  material.transparent = false
  material.opacity = 1
  material.alphaTest = 0.15
  material.depthWrite = true
  material.needsUpdate = true
  // Walk swing puts the hand through the default hang. Sit the cape a
  // little further back only while walking.
  viewer.playerObject.cape.position.z = walking ? CAPE_Z_WALK : CAPE_Z_IDLE
}

export default function SkinPreview({
  cape,
  username,
  uuid,
  skinTexture,
  walking = false,
  width = 400,
  height = 560,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const walkingRef = useRef(walking)
  walkingRef.current = walking

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const viewer = new SkinViewer({
      canvas,
      width,
      height,
      fov: 50,
      zoom: 0.62,
    })
    viewer.globalLight.intensity = 2.4
    viewer.cameraLight.intensity = 0.8
    lockPreviewCamera(viewer)
    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [width, height])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let cancelled = false

    void (async () => {
      if (!username) {
        await viewer.loadSkin(steveSkin, { model: 'auto-detect' })
        return
      }
      for (const url of skinSources(username, uuid || '', skinTexture || '')) {
        if (cancelled) return
        try {
          await viewer.loadSkin(url, { model: 'auto-detect' })
          return
        } catch {
          // Crafatar and similar hosts often return a default Alex on failure.
        }
      }
      if (!cancelled) await viewer.loadSkin(steveSkin, { model: 'auto-detect' })
    })()

    return () => {
      cancelled = true
    }
  }, [username, uuid, skinTexture])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let stopped = false
    let raf = 0

    void (async () => {
      try {
        const image = await loadCapeImage(capeFileUrl(cape))
        const current = viewerRef.current
        if (stopped || !current) return
        const count = Math.max(1, cape.frames)
        current.loadCape(capeFrameCanvas(image, count, 0), {
          backEquipment: 'cape',
        })
        solidCloak(current, walkingRef.current)
        if (count <= 1) return

        let lastFrame = -1
        const tick = () => {
          if (stopped) return
          const live = viewerRef.current
          if (!live) return
          const frame = Math.floor(Date.now() / Math.max(1, cape.frameTimeMs)) % count
          if (frame !== lastFrame) {
            lastFrame = frame
            paintCapeFrame(live.capeCanvas, image, count, frame)
            const map = live.playerObject.cape.map
            if (map) map.needsUpdate = true
          }
          raf = window.requestAnimationFrame(tick)
        }
        raf = window.requestAnimationFrame(tick)
      } catch {
        // Keep the last good cloak if a texture fails to load.
      }
    })()

    return () => {
      stopped = true
      window.cancelAnimationFrame(raf)
    }
  }, [cape])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (walking) {
      const walk = new WalkingAnimation()
      walk.addAnimation((player) => {
        player.cape.position.z = CAPE_Z_WALK
        player.cape.rotation.x += 0.07
      })
      viewer.animation = walk
    } else {
      viewer.animation = new IdleAnimation()
    }
    lockPreviewCamera(viewer)
    solidCloak(viewer, walking)
  }, [walking])

  return (
    <canvas
      ref={canvasRef}
      className="skin-canvas"
      width={width}
      height={height}
      role="img"
      aria-label="Cloak preview"
    />
  )
}
