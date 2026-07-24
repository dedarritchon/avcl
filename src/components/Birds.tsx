import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Theme } from '../lib/theme'
import type { QualitySettings } from '../lib/quality'

type FlockSpec = {
  id: number
  phase: number
  period: number
  duration: number
  altitude: number
  ahead: number
  scale: number
  animRate: number
  soloBias: number
}

/** World-space cubic path baked once per pass — no camera hitching mid-flight */
type WorldPass = {
  p0: THREE.Vector3
  p1: THREE.Vector3
  p2: THREE.Vector3
  p3: THREE.Vector3
  bank: number
}

const BIRD_URL = `${import.meta.env.BASE_URL}bird.glb`

const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _pos = new THREE.Vector3()
const _next = new THREE.Vector3()
const _flight = new THREE.Vector3()
const _look = new THREE.Vector3()
const _box = new THREE.Box3()
const _center = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _qBank = new THREE.Quaternion()
const _bankAxis = new THREE.Vector3(0, 0, 1)
const MODEL_FACE = new THREE.Quaternion()

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function flockSpecs(birdBudget: number): FlockSpec[] {
  const n = birdBudget <= 4 ? 1 : 2
  const all: FlockSpec[] = [
    {
      id: 0,
      phase: 1.2,
      period: 28,
      duration: 22,
      altitude: 48,
      ahead: 150,
      scale: 20,
      animRate: 0.85,
      soloBias: 0.55,
    },
    {
      id: 1,
      phase: 13,
      period: 34,
      duration: 26,
      altitude: 72,
      ahead: 190,
      scale: 16,
      animRate: 0.75,
      soloBias: 0.35,
    },
  ]
  return all.slice(0, n)
}

function birdsThisPass(spec: FlockSpec, passIndex: number, maxBirds: number): number {
  const r = hash(spec.id * 13.7 + passIndex * 4.9 + 0.2)
  if (r < spec.soloBias) return 1
  if (r < spec.soloBias + 0.28) return Math.min(2, maxBirds)
  if (r < spec.soloBias + 0.45) return Math.min(3, maxBirds)
  return Math.min(4, maxBirds)
}

function bezier3(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number, out: THREE.Vector3) {
  const t = Math.min(1, Math.max(0, u))
  const o = 1 - t
  const b0 = o * o * o
  const b1 = 3 * o * o * t
  const b2 = 3 * o * t * t
  const b3 = t * t * t
  out.set(0, 0, 0)
  out.addScaledVector(p0, b0)
  out.addScaledVector(p1, b1)
  out.addScaledVector(p2, b2)
  out.addScaledVector(p3, b3)
  return out
}

/** Bake a one-shot flyby in world space from the camera at pass start */
function bakeWorldPass(
  camera: THREE.Camera,
  spec: FlockSpec,
  passIndex: number,
): WorldPass {
  const a = hash(spec.id * 17.3 + passIndex * 3.1)
  const b = hash(spec.id * 9.7 + passIndex * 5.9 + 1.2)
  const c = hash(spec.id * 4.1 + passIndex * 8.4 + 2.7)
  const d = hash(spec.id * 11.2 + passIndex * 2.2 + 0.4)

  camera.getWorldDirection(_fwd)
  _right.crossVectors(_fwd, _up)
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0)
  else _right.normalize()

  const side = a > 0.5 ? 1 : -1
  const span = 120 + b * 100
  const startLat = -span * side
  // Exit well past the frame so despawn isn’t visible
  const endLat = span * side * (1.15 + c * 0.45)
  const midLat = (startLat + endLat) * 0.42 + (b - 0.5) * 40
  const startAlong = spec.ahead * 0.45 + (d - 0.5) * 40
  const midAlong = spec.ahead + 20 + (c - 0.5) * 50
  const endAlong = spec.ahead * 2.15 + (a - 0.5) * 60
  const base = spec.altitude
  const startAlt = base + (a - 0.5) * 20
  const midAlt = base + 10 + b * 24
  const endAlt = base + (c - 0.5) * 22

  const origin = camera.position
  const p0 = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(_fwd, startAlong)
    .addScaledVector(_right, startLat)
    .addScaledVector(_up, startAlt)
  const p1 = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(_fwd, startAlong + (midAlong - startAlong) * 0.35)
    .addScaledVector(_right, startLat + (midLat - startLat) * 0.35)
    .addScaledVector(_up, startAlt + (midAlt - startAlt) * 0.35)
  const p2 = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(_fwd, midAlong + (endAlong - midAlong) * 0.35)
    .addScaledVector(_right, midLat + (endLat - midLat) * 0.35)
    .addScaledVector(_up, midAlt + (endAlt - midAlt) * 0.35)
  const p3 = new THREE.Vector3()
    .copy(origin)
    .addScaledVector(_fwd, endAlong)
    .addScaledVector(_right, endLat)
    .addScaledVector(_up, endAlt)

  return {
    p0,
    p1,
    p2,
    p3,
    bank: (0.12 + d * 0.14) * -side,
  }
}

function prepareFlock(scene: THREE.Object3D, theme: Theme) {
  const root = cloneSkinned(scene) as THREE.Group
  const birdRoots: THREE.Object3D[] = []
  root.traverse((obj) => {
    obj.frustumCulled = false
    if (/^Plane\d*$/.test(obj.name)) birdRoots.push(obj)
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const cloned = mats.map((m) => {
        const mat = (m as THREE.MeshStandardMaterial).clone()
        mat.fog = true
        mat.roughness = 0.85
        mat.metalness = 0
        if (theme === 'dark') {
          mat.color.multiplyScalar(0.45)
          mat.color.offsetHSL(0.55, -0.15, 0.05)
          mat.envMapIntensity = 0.25
        } else {
          mat.envMapIntensity = 0.55
        }
        return mat
      })
      mesh.material = cloned.length === 1 ? cloned[0] : cloned
    }
  })

  birdRoots.sort((a, b) => a.name.localeCompare(b.name))

  _box.setFromObject(root)
  _box.getCenter(_center)
  if (Number.isFinite(_center.x)) root.position.sub(_center)

  const wrap = new THREE.Group()
  wrap.add(root)
  wrap.userData.animRoot = root
  wrap.userData.birdRoots = birdRoots
  return wrap
}

function showBirdCount(template: THREE.Object3D, count: number, passIndex: number) {
  const birds = (template.userData.birdRoots as THREE.Object3D[] | undefined) ?? []
  if (birds.length === 0) return
  const n = birds.length
  const take = Math.min(count, n)
  const start = Math.floor(hash(passIndex * 7.3 + 1.1) * n)
  for (let i = 0; i < n; i++) birds[i].visible = false
  for (let j = 0; j < take; j++) birds[(start + j) % n].visible = true
}

function Flock({
  template,
  clip,
  spec,
  reducedMotion,
}: {
  template: THREE.Object3D
  clip: THREE.AnimationClip
  spec: FlockSpec
  reducedMotion: boolean
}) {
  const pivot = useRef<THREE.Group>(null)
  const passRef = useRef<{ index: number; pass: WorldPass | null }>({
    index: -1,
    pass: null,
  })
  const lastFlight = useRef(new THREE.Vector3(1, 0, 0))
  const animRoot = (template.userData.animRoot as THREE.Object3D) ?? template
  const mixer = useMemo(() => new THREE.AnimationMixer(animRoot), [animRoot])
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    const action = mixer.clipAction(clip)
    action.reset()
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.setEffectiveTimeScale(reducedMotion ? 0.35 : spec.animRate)
    action.setEffectiveWeight(1)
    action.play()
    action.time = (spec.phase * 0.37) % Math.max(0.01, clip.duration)
    actionRef.current = action
    return () => {
      actionRef.current = null
      mixer.stopAllAction()
      mixer.uncacheRoot(animRoot)
    }
  }, [mixer, clip, reducedMotion, spec.animRate, spec.phase, animRoot])

  useFrame(({ camera, clock, invalidate }, delta) => {
    const group = pivot.current
    if (!group) return

    const t = clock.elapsedTime * (reducedMotion ? 0.25 : 1) + spec.phase
    const passIndex = Math.floor(t / spec.period)
    const cycle = t - passIndex * spec.period
    const rawU = cycle / spec.duration

    // Off-pass: skip skinned mixer + don't keep the demand loop alive
    if (rawU < 0 || rawU > 1) {
      group.visible = false
      return
    }

    const dt = Math.min(0.05, Math.max(0, delta))
    // Clock-driven clip time — flaps never hitch if a frame was skipped
    const action = actionRef.current
    if (action) {
      const dur = Math.max(0.01, clip.duration)
      const rate = reducedMotion ? 0.35 : spec.animRate
      action.paused = true
      action.time = (((clock.elapsedTime * rate + spec.phase * 0.37) % dur) + dur) % dur
    }
    mixer.update(dt)

    if (passRef.current.index !== passIndex || !passRef.current.pass) {
      const birdRoots = (template.userData.birdRoots as THREE.Object3D[] | undefined) ?? []
      const count = birdsThisPass(spec, passIndex, Math.max(1, birdRoots.length))
      showBirdCount(template, count, passIndex)
      group.scale.setScalar(spec.scale * (count === 1 ? 1.15 : count <= 2 ? 1.05 : 0.92))
      passRef.current = {
        index: passIndex,
        pass: bakeWorldPass(camera, spec, passIndex),
      }
      lastFlight.current.set(1, 0, 0)
    }

    const pass = passRef.current.pass
    if (!pass) {
      group.visible = false
      return
    }

    group.visible = true
    // Soft ease-in only — keep cruise speed through the exit (no end freeze)
    const u =
      rawU < 0.12
        ? (() => {
            const s = rawU / 0.12
            return s * s * (3 - 2 * s) * 0.12
          })()
        : rawU
    const lookAhead = 0.045
    const uAhead = Math.min(1, u + lookAhead)

    bezier3(pass.p0, pass.p1, pass.p2, pass.p3, u, _pos)
    bezier3(pass.p0, pass.p1, pass.p2, pass.p3, uAhead, _next)
    group.position.copy(_pos)

    _flight.subVectors(_next, _pos)
    if (_flight.lengthSq() < 1e-6 || u > 0.9) {
      // Near path end the sample delta collapses — keep last good heading
      if (u > 0.9) {
        _flight.copy(lastFlight.current)
      } else {
        _flight.subVectors(pass.p3, pass.p2)
        if (_flight.lengthSq() < 1e-8) _flight.subVectors(pass.p3, pass.p0)
        if (_flight.lengthSq() < 1e-8) _flight.set(1, 0, 0)
      }
    }
    _flight.normalize()
    lastFlight.current.copy(_flight)
    _look.copy(_pos).add(_flight)
    _m.lookAt(_pos, _look, _up)
    _q.setFromRotationMatrix(_m)
    _q.multiply(MODEL_FACE)
    const bank = pass.bank * Math.sin(Math.min(1, u / 0.92) * Math.PI)
    _qBank.setFromAxisAngle(_bankAxis, bank)
    _q.multiply(_qBank)
    if (rawU < 0.02) group.quaternion.copy(_q)
    else group.quaternion.slerp(_q, 1 - Math.exp(-dt * 10))

    invalidate()
  })

  return (
    <group ref={pivot} frustumCulled={false}>
      <primitive object={template} />
    </group>
  )
}

export function Birds({
  theme,
  quality,
  reducedMotion,
}: {
  theme: Theme
  quality: QualitySettings
  reducedMotion: boolean
}) {
  const { scene, animations } = useGLTF(BIRD_URL)
  const clip = animations[0]
  const specs = useMemo(() => flockSpecs(quality.birds), [quality.birds])
  const flocks = useMemo(
    () => (clip && quality.birds > 0 ? specs.map(() => prepareFlock(scene, theme)) : []),
    [scene, theme, specs, clip, quality.birds],
  )

  if (!clip || quality.birds <= 0 || flocks.length === 0) return null

  return (
    <group>
      {flocks.map((template, i) => (
        <Flock
          key={`${theme}-${i}`}
          template={template}
          clip={clip}
          spec={specs[i]}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  )
}

