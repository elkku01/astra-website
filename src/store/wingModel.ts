/**
 * Line-for-line port of the game's AstraWingModel.java
 * (astra-client/src/client/java/dev/astra/client/module/AstraWingModel.java),
 * so the website preview has the same shape and the same animation as in game.
 * Keep the two in sync.
 *
 * Output is in body-model pixels relative to the body pivot (the neck), in
 * Minecraft model space: +x = model left, +y = down, +z = backwards.
 * Each vertex is 8 numbers: x, y, z, u, v, nx, ny, nz; every 4 vertices form a
 * quad (triangles repeat their last vertex).
 */

export const FLOATS_PER_VERTEX = 8

// ---- skeleton (2D wing plane: u outward, v down)
const HUMERUS = 3.2
const HUMERUS_UP = 30.0
const FOREARM = 5.0
const FOREARM_UP = 8.0
const FINGER_LEN = [9.5, 9.0, 8.2, 7.8]
const FINGER_ANGLE = [-12.0, -40.0, -68.0, -100.0]
const BODY_ANCHOR = [0.4, 7.0]
const SCALLOP = 0.3
const SCALLOP_STEPS = 6

// Texture layout (256x256): membrane planar map in the top 224 rows, bone strip below.
const TEX_U_MIN = -0.5
const TEX_U_MAX = 18.0
const TEX_V_MIN = -4.5
const TEX_V_MAX = 8.0
const MEMBRANE_V_SPAN = 224.0 / 256.0
const BONE_V0 = 232.0 / 256.0
const BONE_V1 = 252.0 / 256.0

// ---- fit on the back
const SHOULDER_X = 1.6
const SHOULDER_Y = 1.2
const BACK_Z = 2.25
const ARMOR_Z = 1.05
const ARMOR_X = 0.35
const BONE_THICKNESS = 1.05
const CAMBER = 1.1
const WING_SCALE = 0.85

// Point slots in the skeleton arrays (x=u, y=v pairs).
const S = 0
const E = 1
const W = 2
const TIP0 = 3
const ANCHOR = 7
const THUMB = 8
const POINTS = 9

export type WingPose = {
  timeSeconds: number
  /** 0 standing still .. 1 running. */
  walk: number
  /** Flying, falling or jumping: big wing beats. */
  airborne: boolean
  sneaking: boolean
  armored: boolean
}

const rad = (deg: number) => (deg * Math.PI) / 180
const cos = (deg: number) => Math.cos(rad(deg))
const sin = (deg: number) => Math.sin(rad(deg))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value)

function setPoint(out: Float64Array, slot: number, u: number, v: number) {
  out[slot * 2] = u
  out[slot * 2 + 1] = v
}

function buildSkeleton(out: Float64Array, spread: number) {
  setPoint(out, S, 0, 0)
  const eu = HUMERUS * cos(HUMERUS_UP)
  const ev = -HUMERUS * sin(HUMERUS_UP)
  setPoint(out, E, eu, ev)
  const forearm = FOREARM_UP + (1 - spread) * 30
  const wu = eu + FOREARM * cos(forearm)
  const wv = ev - FOREARM * sin(forearm)
  setPoint(out, W, wu, wv)
  for (let i = 0; i < 4; i++) {
    const angle = FOREARM_UP + (FINGER_ANGLE[i] - FOREARM_UP) * spread + (1 - spread) * 22
    setPoint(out, TIP0 + i, wu + FINGER_LEN[i] * cos(angle), wv - FINGER_LEN[i] * sin(angle))
  }
  setPoint(out, ANCHOR, BODY_ANCHOR[0], BODY_ANCHOR[1] * (0.85 + 0.15 * spread))
  setPoint(out, THUMB, wu + 1.3 * cos(75), wv - 1.3 * sin(75))
}

/** Quadratic curve from a to b whose middle is pulled toward the wrist. */
function curve(pts: Float64Array, a: number, b: number, out: Float64Array) {
  const ax = pts[a * 2], ay = pts[a * 2 + 1]
  const bx = pts[b * 2], by = pts[b * 2 + 1]
  const wx = pts[W * 2], wy = pts[W * 2 + 1]
  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5
  const cx = mx + (wx - mx) * SCALLOP * 2
  const cy = my + (wy - my) * SCALLOP * 2
  for (let i = 0; i <= SCALLOP_STEPS; i++) {
    const t = i / SCALLOP_STEPS
    const k = 1 - t
    out[i * 2] = k * k * ax + 2 * k * t * cx + t * t * bx
    out[i * 2 + 1] = k * k * ay + 2 * k * t * cy + t * t * by
  }
}

export class WingModel {
  membrane: number[] = []
  bones: number[] = []

  private readonly rest = new Float64Array(POINTS * 2)
  private readonly live = new Float64Array(POINTS * 2)
  private readonly basis = new Float64Array(9)
  // {lastTime, flightBlend, phase}: one preview = one player.
  private state: number[] | null = null

  /** Rebuilds both wings for this pose. */
  build(pose: WingPose) {
    this.membrane = []
    this.bones = []

    if (!this.state || pose.timeSeconds < this.state[0]) this.state = [pose.timeSeconds, 0, 0]
    const st = this.state
    const dt = Math.max(0, Math.min(0.25, pose.timeSeconds - st[0]))
    st[0] = pose.timeSeconds
    const target = pose.airborne ? 1 : 0
    st[1] += (target - st[1]) * Math.min(1, dt * (pose.airborne ? 2.5 : 4))
    const fly = st[1]
    const walk = clamp01(pose.walk)
    const period = lerp(3.2 - 0.9 * walk, 0.95, fly)
    st[2] = (st[2] + (dt * Math.PI * 2) / period) % (Math.PI * 2000)
    const phase = st[2]
    const beat = Math.sin(phase)
    const amplitude = lerp(5 + 5 * walk, 17, fly)
    let spread = lerp(0.95 + 0.04 * beat, 0.86 + 0.14 * Math.sin(phase + 0.9), fly)
    let sweep = lerp(18, 24, fly) - amplitude * beat
    const lift = -6 + lerp(1.5 * beat, 9 * Math.sin(phase - 0.6), fly)
    let lean = 14
    if (pose.sneaking) {
      sweep += 11
      spread *= 0.84
      lean += 8
    }

    buildSkeleton(this.rest, 1)
    buildSkeleton(this.live, spread)
    for (let i = 0; i < POINTS * 2; i++) this.live[i] *= WING_SCALE
    for (let side = 0; side < 2; side++) {
      const left = side === 1
      const sign = left ? 1 : -1
      const ox = sign * (SHOULDER_X + (pose.armored ? ARMOR_X : 0))
      const oz = BACK_Z + (pose.armored ? ARMOR_Z : 0)
      this.orient(sign, sweep, lift, lean)
      this.emitMembrane(ox, SHOULDER_Y, oz)
      this.emitBones(ox, SHOULDER_Y, oz)
    }
  }

  // ---- 3D placement

  private orient(sign: number, sweepDeg: number, liftDeg: number, leanDeg: number) {
    const sw = rad(sweepDeg)
    const li = rad(liftDeg)
    const le = rad(leanDeg)
    let ux = sign * Math.cos(sw)
    let uz = Math.sin(sw)
    const uy = -Math.sin(li)
    const uScale = Math.cos(li)
    ux *= uScale
    uz *= uScale
    let vx = 0
    let vy = Math.cos(le)
    let vz = Math.sin(le)
    const dot = ux * vx + uy * vy + uz * vz
    vx -= dot * ux
    vy -= dot * uy
    vz -= dot * uz
    const vl = Math.sqrt(vx * vx + vy * vy + vz * vz)
    vx /= vl
    vy /= vl
    vz /= vl
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    this.basis.set([ux, uy, uz, vx, vy, vz, nx, ny, nz])
  }

  private wx(u: number, v: number, ox: number) {
    return ox + u * this.basis[0] + v * this.basis[3]
  }

  private wy(u: number, v: number, oy: number) {
    return oy + u * this.basis[1] + v * this.basis[4]
  }

  private wz(u: number, v: number, oz: number) {
    return oz + u * this.basis[2] + v * this.basis[5]
  }

  // ---- membrane

  private emitMembrane(ox: number, oy: number, oz: number) {
    this.tri(S, E, W, ox, oy, oz)
    for (let i = 0; i < 3; i++) this.fanScallop(TIP0 + i, TIP0 + i + 1, ox, oy, oz)
    this.fanScallop(TIP0 + 3, ANCHOR, ox, oy, oz)
    this.tri(W, ANCHOR, S, ox, oy, oz)
  }

  private fanScallop(a: number, b: number, ox: number, oy: number, oz: number) {
    const rp = new Float64Array((SCALLOP_STEPS + 1) * 2)
    const lp = new Float64Array((SCALLOP_STEPS + 1) * 2)
    curve(this.rest, a, b, rp)
    curve(this.live, a, b, lp)
    const wu = this.live[W * 2], wv = this.live[W * 2 + 1]
    const wru = this.rest[W * 2], wrv = this.rest[W * 2 + 1]
    for (let i = 0; i < SCALLOP_STEPS; i++) {
      const a0 = i * 2, a1 = i * 2 + 2
      const ea = i === 0 ? 0 : 0.35, eb = i + 1 === SCALLOP_STEPS ? 0 : 0.35
      const ma = i === 0 ? 0.45 : 1, mb = i + 1 === SCALLOP_STEPS ? 0.45 : 1
      const mau = (wu + lp[a0]) * 0.5, mav = (wv + lp[a0 + 1]) * 0.5
      const mbu = (wu + lp[a1]) * 0.5, mbv = (wv + lp[a1 + 1]) * 0.5
      const mar = (wru + rp[a0]) * 0.5, marv = (wrv + rp[a0 + 1]) * 0.5
      const mbr = (wru + rp[a1]) * 0.5, mbrv = (wrv + rp[a1 + 1]) * 0.5
      this.triB(wu, wv, wru, wrv, 0, mau, mav, mar, marv, ma, mbu, mbv, mbr, mbrv, mb, ox, oy, oz)
      this.triB(mau, mav, mar, marv, ma, lp[a0], lp[a0 + 1], rp[a0], rp[a0 + 1], ea, mbu, mbv, mbr, mbrv, mb, ox, oy, oz)
      this.triB(mbu, mbv, mbr, mbrv, mb, lp[a0], lp[a0 + 1], rp[a0], rp[a0 + 1], ea, lp[a1], lp[a1 + 1], rp[a1], rp[a1 + 1], eb, ox, oy, oz)
    }
  }

  private tri(a: number, b: number, c: number, ox: number, oy: number, oz: number) {
    const l = this.live, r = this.rest
    const cu = (l[a * 2] + l[b * 2] + l[c * 2]) / 3, cv = (l[a * 2 + 1] + l[b * 2 + 1] + l[c * 2 + 1]) / 3
    const cru = (r[a * 2] + r[b * 2] + r[c * 2]) / 3, crv = (r[a * 2 + 1] + r[b * 2 + 1] + r[c * 2 + 1]) / 3
    const idx = [a, b, c]
    for (let k = 0; k < 3; k++) {
      const p = idx[k], q = idx[(k + 1) % 3]
      this.triB(
        l[p * 2], l[p * 2 + 1], r[p * 2], r[p * 2 + 1], 0,
        l[q * 2], l[q * 2 + 1], r[q * 2], r[q * 2 + 1], 0,
        cu, cv, cru, crv, 0.6, ox, oy, oz,
      )
    }
  }

  private triB(
    au: number, av: number, aru: number, arv: number, ab: number,
    bu: number, bv: number, bru: number, brv: number, bb: number,
    cu: number, cv: number, cru: number, crv: number, cb: number,
    ox: number, oy: number, oz: number,
  ) {
    const pa = this.bulged(au, av, ab, ox, oy, oz)
    const pb = this.bulged(bu, bv, bb, ox, oy, oz)
    const pc = this.bulged(cu, cv, cb, ox, oy, oz)
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2]
    const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2]
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    let len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len < 1e-6) return
    if ((nx * this.basis[6] + ny * this.basis[7] + nz * this.basis[8]) * this.outSign() < 0) len = -len
    nx /= len
    ny /= len
    nz /= len
    this.membraneVertex(pa, aru, arv, nx, ny, nz)
    this.membraneVertex(pb, bru, brv, nx, ny, nz)
    this.membraneVertex(pc, cru, crv, nx, ny, nz)
    this.membraneVertex(pc, cru, crv, nx, ny, nz)
  }

  /** +1 or -1 so the billow always points away from the back (+z). */
  private outSign() {
    return this.basis[8] >= 0 ? 1 : -1
  }

  private bulged(u: number, v: number, bulge: number, ox: number, oy: number, oz: number) {
    const d = bulge * CAMBER * this.outSign()
    return [
      this.wx(u, v, ox) + this.basis[6] * d,
      this.wy(u, v, oy) + this.basis[7] * d,
      this.wz(u, v, oz) + this.basis[8] * d,
    ]
  }

  private membraneVertex(p: number[], restU: number, restV: number, nx: number, ny: number, nz: number) {
    this.membrane.push(
      p[0], p[1], p[2],
      (restU - TEX_U_MIN) / (TEX_U_MAX - TEX_U_MIN),
      ((restV - TEX_V_MIN) / (TEX_V_MAX - TEX_V_MIN)) * MEMBRANE_V_SPAN,
      nx, ny, nz,
    )
  }

  // ---- bones

  private emitBones(ox: number, oy: number, oz: number) {
    this.bone(S, E, 1.35, ox, oy, oz)
    this.bone(E, W, 1.2, ox, oy, oz)
    for (let i = 0; i < 4; i++) this.bone(W, TIP0 + i, 0.8 - i * 0.08, ox, oy, oz)
    this.bone(W, THUMB, 0.9, ox, oy, oz)
  }

  private bone(a: number, b: number, thickness: number, ox: number, oy: number, oz: number) {
    const au = this.live[a * 2], av = this.live[a * 2 + 1]
    const bu = this.live[b * 2], bv = this.live[b * 2 + 1]
    const du = bu - au, dv = bv - av
    const len = Math.sqrt(du * du + dv * dv)
    if (len < 0.001) return
    const half = BONE_THICKNESS * thickness * 0.5
    const pu = (-dv / len) * half, pv = (du / len) * half
    const nx = this.basis[6] * half, ny = this.basis[7] * half, nz = this.basis[8] * half
    const ax = this.wx(au, av, ox), ay = this.wy(au, av, oy), az = this.wz(au, av, oz)
    const bx = this.wx(bu, bv, ox), by = this.wy(bu, bv, oy), bz = this.wz(bu, bv, oz)
    const px = pu * this.basis[0] + pv * this.basis[3]
    const py = pu * this.basis[1] + pv * this.basis[4]
    const pz = pu * this.basis[2] + pv * this.basis[5]
    const taper = 0.55
    const u1 = Math.min(1, len / 8)
    this.boneFace(ax, ay, az, bx, by, bz, px, py, pz, nx, ny, nz, taper, u1)
    this.boneFace(ax, ay, az, bx, by, bz, px, py, pz, -nx, -ny, -nz, taper, u1)
    this.boneFace(ax, ay, az, bx, by, bz, nx, ny, nz, px, py, pz, taper, u1)
    this.boneFace(ax, ay, az, bx, by, bz, nx, ny, nz, -px, -py, -pz, taper, u1)
  }

  private boneFace(
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    sx: number, sy: number, sz: number, ox: number, oy: number, oz: number,
    taper: number, u1: number,
  ) {
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz)
    const fx = len === 0 ? 0 : ox / len, fy = len === 0 ? 0 : oy / len, fz = len === 0 ? 0 : oz / len
    this.bones.push(
      ax + ox - sx, ay + oy - sy, az + oz - sz, 0, BONE_V0, fx, fy, fz,
      ax + ox + sx, ay + oy + sy, az + oz + sz, 0, BONE_V1, fx, fy, fz,
      bx + (ox + sx) * taper, by + (oy + sy) * taper, bz + (oz + sz) * taper, u1, BONE_V1, fx, fy, fz,
      bx + (ox - sx) * taper, by + (oy - sy) * taper, bz + (oz - sz) * taper, u1, BONE_V0, fx, fy, fz,
    )
  }
}
