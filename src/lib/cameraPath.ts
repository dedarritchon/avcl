import * as THREE from 'three'

type Keyframe = {
  t: number
  position: [number, number, number]
  lookAt: [number, number, number]
}

/** Path from ?edit=1 — −X west / +X east / −Z north / +Z south */
const KEYFRAMES: Keyframe[] = [
  {
    t: 0.0,
    position: [-1041, 124, 790],
    lookAt: [-871, 135, 651],
  },
  {
    t: 0.14,
    position: [-526, 121, 951],
    lookAt: [-480, 106, 737],
  },
  {
    t: 0.29,
    position: [-4, 256, 859],
    lookAt: [109, 231, 672],
  },
  {
    t: 0.43,
    position: [651, 173, 756],
    lookAt: [647, 172, 717],
  },
  {
    t: 0.57,
    position: [500, 151, -69],
    lookAt: [511, 158, -288],
  },
  {
    t: 0.71,
    position: [1022, 102, 879],
    lookAt: [1007, 103, 659],
  },
  {
    t: 0.86,
    position: [1982, 151, -216],
    lookAt: [1782, 199, -295],
  },
  {
    t: 1.0,
    position: [1536, 155, -677],
    lookAt: [1318, 151, -699],
  },
]

const MIN_LOOK_DIST = 160
const _fwd = new THREE.Vector3(0, 0, -1)
const _pos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _dirA = new THREE.Vector3()
const _dirB = new THREE.Vector3()
const _dirSpline = new THREE.Vector3()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _q = new THREE.Quaternion()

function catmullRom(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u
  const u3 = u2 * u
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  )
}

function smoothstep(u: number) {
  const t = Math.min(1, Math.max(0, u))
  return t * t * (3 - 2 * t)
}

function getKeyframe(i: number): Keyframe {
  const n = KEYFRAMES.length
  if (i < 0) return KEYFRAMES[0]
  if (i >= n) return KEYFRAMES[n - 1]
  return KEYFRAMES[i]
}

function sampleSpline(
  i: number,
  u: number,
  key: 'position' | 'lookAt',
  out: THREE.Vector3,
) {
  const p0 = getKeyframe(i - 1)[key]
  const p1 = getKeyframe(i)[key]
  const p2 = getKeyframe(i + 1)[key]
  const p3 = getKeyframe(i + 2)[key]
  out.set(
    catmullRom(p0[0], p1[0], p2[0], p3[0], u),
    catmullRom(p0[1], p1[1], p2[1], p3[1], u),
    catmullRom(p0[2], p1[2], p2[2], p3[2], u),
  )
  return out
}

function lookDirectionAt(i: number, out: THREE.Vector3) {
  const kf = getKeyframe(i)
  out.set(
    kf.lookAt[0] - kf.position[0],
    kf.lookAt[1] - kf.position[1],
    kf.lookAt[2] - kf.position[2],
  )
  if (out.lengthSq() < 1e-4) out.copy(_fwd)
  else out.normalize()
  return out
}

function slerpDir(a: THREE.Vector3, b: THREE.Vector3, u: number, out: THREE.Vector3) {
  _qa.setFromUnitVectors(_fwd, a)
  _qb.setFromUnitVectors(_fwd, b)
  _q.copy(_qa).slerp(_qb, u)
  out.copy(_fwd).applyQuaternion(_q)
  return out
}

export function sampleCameraPath(progress: number) {
  const t = Math.min(1, Math.max(0, progress))
  let i = 0
  while (i < KEYFRAMES.length - 2 && t > KEYFRAMES[i + 1].t) i += 1

  const a = KEYFRAMES[i]
  const b = KEYFRAMES[i + 1]
  const local = smoothstep((t - a.t) / Math.max(1e-6, b.t - a.t))

  sampleSpline(i, local, 'position', _pos)

  // Blend look directions so near lookAts don't whip the camera
  lookDirectionAt(i, _dirA)
  lookDirectionAt(i + 1, _dirB)
  slerpDir(_dirA, _dirB, local, _dir)

  sampleSpline(i, local, 'lookAt', _look)
  _dirSpline.copy(_look).sub(_pos)
  if (_dirSpline.lengthSq() > 1e-4) {
    _dirSpline.normalize()
    _dir.lerp(_dirSpline, 0.28).normalize()
  }

  _look.copy(_pos).addScaledVector(_dir, MIN_LOOK_DIST)

  return {
    position: _pos.clone(),
    lookAt: _look.clone(),
  }
}
