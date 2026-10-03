import { useEffect, useRef } from 'react'
import {
  IdleAnimation,
  SkinViewer,
  WalkingAnimation,
  type PlayerAnimation,
} from 'skinview3d'
import { skinSources } from './api'
import { WingAttachment } from './wingMesh'
import steveSkin from '../assets/steve.png'

export type WingPoseName = 'standing' | 'walking'

type Props = {
  wingId: string
  pose: WingPoseName
  username?: string | null
  uuid?: string | null
  skinTexture?: string | null
  width?: number
  height?: number
  /** Camera zoom (bigger shows the player larger). */
  zoom?: number
}

function lockPreviewCamera(viewer: SkinViewer) {
  viewer.controls.enableRotate = false
  viewer.controls.enablePan = false
  viewer.controls.enableZoom = false
  viewer.controls.minAzimuthAngle = 0
  viewer.controls.maxAzimuthAngle = 0
  viewer.controls.minPolarAngle = Math.PI / 2
  viewer.controls.maxPolarAngle = Math.PI / 2
  // From behind and a little to the side, so the wings read in 3D.
  viewer.playerWrapper.rotation.y = Math.PI + 0.5
}

function animationFor(pose: WingPoseName): PlayerAnimation {
  if (pose === 'walking') return new WalkingAnimation()
  return new IdleAnimation()
}

/** Your skin wearing Astra wings, driven by the same model and animation as the game. */
export default function WingPreview({
  wingId,
  pose,
  username,
  uuid,
  skinTexture,
  width = 400,
  height = 560,
  zoom = 0.62,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const wingsRef = useRef<WingAttachment | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const viewer = new SkinViewer({ canvas, width, height, fov: 50, zoom })
    viewer.globalLight.intensity = 2.4
    viewer.cameraLight.intensity = 0.8
    lockPreviewCamera(viewer)
    // Wings and a cloak are never shown together here.
    viewer.loadCape(null)
    const wings = new WingAttachment()
    wings.attachTo(viewer.playerObject.skin.body)
    wings.setFacing(viewer.playerWrapper.rotation.y)
    viewerRef.current = viewer
    wingsRef.current = wings
    return () => {
      wings.dispose()
      viewer.dispose()
      viewerRef.current = null
      wingsRef.current = null
    }
  }, [width, height, zoom])

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
          // Try the next skin host.
        }
      }
      if (!cancelled) await viewer.loadSkin(steveSkin, { model: 'auto-detect' })
    })()
    return () => {
      cancelled = true
    }
  }, [username, uuid, skinTexture])

  useEffect(() => {
    void wingsRef.current?.load(wingId).catch(() => {
      // Keep the previous wings if a texture fails to load.
    })
  }, [wingId])

  useEffect(() => {
    const viewer = viewerRef.current
    const wings = wingsRef.current
    if (!viewer || !wings) return
    const animation = animationFor(pose)
    // Runs every rendered frame, right after the body pose, so the wings
    // follow the body without lagging a frame.
    animation.addAnimation(() => {
      wings.update({
        timeSeconds: performance.now() / 1000,
        walk: pose === 'walking' ? 1 : 0,
        airborne: false,
        sneaking: false,
        armored: false,
      })
    })
    viewer.animation = animation
    lockPreviewCamera(viewer)
  }, [pose])

  return (
    <canvas
      ref={canvasRef}
      className="skin-canvas"
      width={width}
      height={height}
      role="img"
      aria-label="Wings preview"
    />
  )
}
