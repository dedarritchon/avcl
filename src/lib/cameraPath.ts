import * as THREE from 'three'

export type CameraKeyframe = {
  t: number
  position: [number, number, number]
  lookAt: [number, number, number]
}

/** Path from ?edit=1 — −X west / +X east / −Z north / +Z south */
export const CAMERA_PATH_KEYFRAMES: CameraKeyframe[] = [
  {
    t: 0.00,
    position: [-1041, 124, 790],
    lookAt: [-871, 135, 651],
  },
  {
    t: 0.13,
    position: [-526, 121, 951],
    lookAt: [-480, 106, 737],
  },
  {
    t: 0.25,
    position: [-4, 256, 859],
    lookAt: [109, 231, 672],
  },
  {
    t: 0.38,
    position: [651, 173, 756],
    lookAt: [647, 172, 717],
  },
  {
    t: 0.50,
    position: [512, 141, 48],
    lookAt: [520, 149, -172],
  },
  {
    t: 0.63,
    position: [802, 179, 554],
    lookAt: [706, 169, 356],
  },
  {
    t: 0.75,
    position: [1022, 102, 879],
    lookAt: [1007, 103, 659],
  },
  {
    t: 0.88,
    position: [1984, 151, -221],
    lookAt: [1775, 170, -289],
  },
  {
    t: 1.00,
    position: [1654, 157, -665],
    lookAt: [1435, 153, -687],
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

function getKeyframe(i: number): CameraKeyframe {
  const n = CAMERA_PATH_KEYFRAMES.length
  if (i < 0) return CAMERA_PATH_KEYFRAMES[0]
  if (i >= n) return CAMERA_PATH_KEYFRAMES[n - 1]
  return CAMERA_PATH_KEYFRAMES[i]
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
  while (i < CAMERA_PATH_KEYFRAMES.length - 2 && t > CAMERA_PATH_KEYFRAMES[i + 1].t) i += 1

  const a = CAMERA_PATH_KEYFRAMES[i]
  const b = CAMERA_PATH_KEYFRAMES[i + 1]
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

/** Zoomed-in start for the automatic intro (dolly in along the first view ray). */
export function introStartView() {
  const first = CAMERA_PATH_KEYFRAMES[0]
  const px = first.position[0]
  const py = first.position[1]
  const pz = first.position[2]
  const lx = first.lookAt[0]
  const ly = first.lookAt[1]
  const lz = first.lookAt[2]
  // Move toward lookAt on the same ray → pitch stays locked to the horizon
  const k = 0.78
  return {
    position: [
      px + (lx - px) * k,
      py + (ly - py) * k,
      pz + (lz - pz) * k,
    ] as [number, number, number],
    lookAt: [lx, ly, lz] as [number, number, number],
  }
}

export function introEndView() {
  const first = CAMERA_PATH_KEYFRAMES[0]
  return {
    position: [...first.position] as [number, number, number],
    lookAt: [...first.lookAt] as [number, number, number],
  }
}

export const INTRO_DURATION_SEC = 3.6
