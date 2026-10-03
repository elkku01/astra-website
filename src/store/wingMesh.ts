import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  NearestFilter,
  NoColorSpace,
  ShaderMaterial,
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

/**
 * Minecraft's entity lighting, so the wings look exactly like in game: the two
 * fixed world lights (0.2, 1, -0.7) and (-0.2, 1, 0.7), 40% ambient + 60%
 * diffuse, per vertex, multiplied straight onto the texture colours (no tone
 * mapping or colour-space conversion, like the game). Lights are taken in the
 * player's own frame (facing south, as in the game's screenshots), so turning
 * the preview does not change the shading.
 */
const VERTEX = `
uniform float uYaw;
varying vec2 vUv;
varying float vLight;
void main() {
  vUv = uv;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  float c = cos(-uYaw);
  float s = sin(-uYaw);
  n = vec3(c * n.x + s * n.z, n.y, -s * n.x + c * n.z);
  vec3 l0 = normalize(vec3(0.2, 1.0, -0.7));
  vec3 l1 = normalize(vec3(-0.2, 1.0, 0.7));
  vLight = min(1.0, (max(0.0, dot(l0, n)) + max(0.0, dot(l1, n))) * 0.6 + 0.4);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = `
uniform sampler2D map;
varying vec2 vUv;
varying float vLight;
void main() {
  vec4 texel = texture2D(map, vUv);
  if (texel.a < 0.1) discard;
  gl_FragColor = vec4(texel.rgb * vLight, 1.0);
}
`

function minecraftMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { map: { value: null }, uYaw: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
    toneMapped: false,
  })
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
  private readonly material = minecraftMaterial()
  private texture: Texture | null = null
  private disposed = false

  constructor() {
    // In daylight the game lights membrane and bones the same way (the membrane's
    // glow floor only shows in the dark), so one material serves both.
    this.group.add(new Mesh(this.membraneGeometry, this.material))
    this.group.add(new Mesh(this.boneGeometry, this.material))
    this.group.scale.set(1, -1, -1)
    this.group.position.set(0, 6, 0)
    this.group.visible = false
  }

  attachTo(body: Object3D) {
    body.add(this.group)
  }

  /** The preview turns the player to show the back; light the wings as if they faced south. */
  setFacing(yaw: number) {
    this.material.uniforms.uYaw.value = yaw
  }

  async load(id: string) {
    const texture = await new TextureLoader().loadAsync(wingTextureUrl(id))
    if (this.disposed) {
      texture.dispose()
      return
    }
    texture.flipY = false // the model's v runs top-down like Minecraft's
    // Raw texture values, sharp pixels and no mipmaps: the game does the same for entities.
    texture.colorSpace = NoColorSpace
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    this.texture?.dispose()
    this.texture = texture
    this.material.uniforms.map.value = texture
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
    this.material.dispose()
    this.texture?.dispose()
  }
}
