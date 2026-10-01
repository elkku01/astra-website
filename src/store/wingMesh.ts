import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  SRGBColorSpace,
  TextureLoader,
  type Object3D,
  type Texture,
} from 'three'
import { FLOATS_PER_VERTEX, WingModel, type WingPose } from './wingModel'

/** Full wing texture (the same 256×256 file the game uses). */
export function wingTextureUrl(id: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}wings/textures/${id}.png`.replace(/([^:/])\/{2,}/g, '$1/')
}

/** Quads (4 vertices) from the model become two triangles each. */
function fill(geometry: BufferGeometry, data: number[]) {
  const quads = Math.floor(data.length / (FLOATS_PER_VERTEX * 4))
  const count = quads * 6
  let position = geometry.getAttribute('position') as BufferAttribute | undefined
  if (!position || position.count !== count) {
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(count * 3), 3))
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2))
    position = geometry.getAttribute('position') as BufferAttribute
  }
  const pos = position.array as Float32Array
  const nor = (geometry.getAttribute('normal') as BufferAttribute).array as Float32Array
  const uv = (geometry.getAttribute('uv') as BufferAttribute).array as Float32Array
  let o = 0
  for (let q = 0; q < quads; q++) {
    const base = q * 4
    for (const corner of [0, 1, 2, 0, 2, 3]) {
      const i = (base + corner) * FLOATS_PER_VERTEX
      pos[o * 3] = data[i]
      pos[o * 3 + 1] = data[i + 1]
      pos[o * 3 + 2] = data[i + 2]
      uv[o * 2] = data[i + 3]
      uv[o * 2 + 1] = data[i + 4]
      nor[o * 3] = data[i + 5]
      nor[o * 3 + 1] = data[i + 6]
      nor[o * 3 + 2] = data[i + 7]
      o++
    }
  }
  geometry.getAttribute('position').needsUpdate = true
  geometry.getAttribute('normal').needsUpdate = true
  geometry.getAttribute('uv').needsUpdate = true
  geometry.computeBoundingSphere()
}

/**
 * The game's wings on a skinview3d body. Minecraft model space is +x left,
 * +y down, +z back; skinview3d is +x left, +y up, +z front, so the group
 * flips y and z. The body group's origin is its centre, 6 px below the neck
 * pivot the wing model is measured from.
 */
export class WingAttachment {
  readonly group = new Group()
  private readonly model = new WingModel()
  private readonly membraneGeometry = new BufferGeometry()
  private readonly boneGeometry = new BufferGeometry()
  private readonly membraneMaterial: MeshStandardMaterial
  private readonly boneMaterial: MeshStandardMaterial
  private texture: Texture | null = null
  private disposed = false

  constructor() {
    const common = {
      side: DoubleSide,
      transparent: false,
      alphaTest: 0.1,
      roughness: 1,
      metalness: 0,
    }
    // The game gives the membrane a glow floor so the nebula shines in the dark.
    this.membraneMaterial = new MeshStandardMaterial({
      ...common,
      emissive: new Color(0xffffff),
      emissiveIntensity: 0.28,
    })
    this.boneMaterial = new MeshStandardMaterial(common)
    this.group.add(new Mesh(this.membraneGeometry, this.membraneMaterial))
    this.group.add(new Mesh(this.boneGeometry, this.boneMaterial))
    this.group.scale.set(1, -1, -1)
    this.group.position.set(0, 6, 0)
    this.group.visible = false
  }

  attachTo(body: Object3D) {
    body.add(this.group)
  }

  async load(id: string) {
    const texture = await new TextureLoader().loadAsync(wingTextureUrl(id))
    if (this.disposed) {
      texture.dispose()
      return
    }
    texture.flipY = false // the model's v runs top-down like Minecraft's
    texture.colorSpace = SRGBColorSpace
    texture.magFilter = NearestFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.needsUpdate = true
    this.texture?.dispose()
    this.texture = texture
    for (const material of [this.membraneMaterial, this.boneMaterial]) {
      material.map = texture
      material.needsUpdate = true
    }
    this.membraneMaterial.emissiveMap = texture
    this.group.visible = true
  }

  update(pose: WingPose) {
    this.model.build(pose)
    fill(this.membraneGeometry, this.model.membrane)
    fill(this.boneGeometry, this.model.bones)
  }

  dispose() {
    this.disposed = true
    this.group.removeFromParent()
    this.membraneGeometry.dispose()
    this.boneGeometry.dispose()
    this.membraneMaterial.dispose()
    this.boneMaterial.dispose()
    this.texture?.dispose()
  }
}
