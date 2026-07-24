import { Suspense, lazy, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import {
  INTRO_DURATION_SEC,
  introEndView,
  introStartView,
  sampleCameraPath,
} from '../lib/cameraPath'
import { sampleHeight } from '../lib/heightmap'
import { mergeTerrainTiles } from '../lib/mergeTerrainTiles'
import { MODEL_SCALE, MODEL_Y_LIFT } from '../lib/terrainModel'
import type { Theme } from '../lib/theme'
import type { QualitySettings } from '../lib/quality'
import { Atmosphere } from './Atmosphere'
import { SceneTheme } from './SceneTheme'
import { Forest, GroundFill, HorizonMountains } from './TerrainDressing'
import type { EditorWaypoint } from './PathEditor'

const Birds = lazy(() => import('./Birds').then((m) => ({ default: m.Birds })))
const PathEditorScene = lazy(() =>
  import('./PathEditor').then((m) => ({ default: m.PathEditorScene })),
)

type Props = {
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  theme: Theme
  quality: QualitySettings
  onReady: () => void
  /** Automatic zoom-out to first path waypoint before scroll takes over */
  introActive?: boolean
  /** Hold zoomed-in until terrain/loader is ready */
  introPaused?: boolean
  onIntroComplete?: () => void
  editMode?: boolean
  waypoints?: EditorWaypoint[]
  onWaypointsChange?: (next: EditorWaypoint[]) => void
  selectedId?: string | null
  onSelectWaypoint?: (id: string | null) => void
  viewApiRef?: MutableRefObject<{
    getView: () => {
      position: [number, number, number]
      lookAt: [number, number, number]
    }
    goToView: (
      position: [number, number, number],
      lookAt: [number, number, number],
    ) => void
  } | null>
}

function smoothstep01(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

const CLEARANCE = 45

const _desired = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _lookSafe = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _desiredQuat = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _lookDir = new THREE.Vector3()
const _right = new THREE.Vector3()
const _handPos = new THREE.Vector3()
const _handLook = new THREE.Vector3()

function Terrain({
  onReady,
  meshRef,
}: {
  onReady: () => void
  meshRef: MutableRefObject<THREE.Object3D | null>
}) {
  const { gl } = useThree()
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}torres.glb`, true)
  const readyRef = useRef(false)
  const maxAniso = gl.capabilities.getMaxAnisotropy()

  const model = useMemo(() => {
    const clone = scene.clone(true)
    return mergeTerrainTiles(clone, maxAniso)
  }, [scene, maxAniso])

  useFrame(({ invalidate }) => {
    if (!readyRef.current) {
      readyRef.current = true
      onReady()
      invalidate()
    }
  })

  return (
    <primitive
      ref={meshRef}
      object={model}
      scale={MODEL_SCALE}
      position={[0, MODEL_Y_LIFT, 0]}
    />
  )
}

function CameraRig({
  progressRef,
  reducedMotion,
  introActive = false,
  introPaused = false,
  onIntroComplete,
}: {
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  introActive?: boolean
  introPaused?: boolean
  onIntroComplete?: () => void
}) {
  const { camera } = useThree()
  const smoothed = useRef(0)
  const floorY = useRef(0)
  const initialized = useRef(false)
  const handT = useRef(Math.random() * 12)
  const handAmt = useRef(0)
  const introT = useRef(0)
  const introDone = useRef(false)
  const introStart = useRef(introStartView())
  const introEnd = useRef(introEndView())
  const doneNotified = useRef(false)

  const soft =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches

  useFrame(({ invalidate }, delta) => {
    const dt = Math.min(delta, 0.05)

    // —— Automatic intro: zoom out to first path waypoint ——
    if (introActive && !introDone.current) {
      if (!initialized.current) {
        const start = introStart.current
        _pos.set(...start.position)
        _look.set(...start.lookAt)
        camera.position.copy(_pos)
        camera.lookAt(_look)
        initialized.current = true
        introT.current = 0
      }

      // Hold zoomed-in under the loader
      if (introPaused) {
        const start = introStart.current
        _pos.set(...start.position)
        _look.set(...start.lookAt)
        camera.position.copy(_pos)
        _m.lookAt(_pos, _look, _up)
        camera.quaternion.setFromRotationMatrix(_m)
        invalidate()
        return
      }

      if (reducedMotion) {
        const end = introEnd.current
        _pos.set(...end.position)
        _look.set(...end.lookAt)
        camera.position.copy(_pos)
        camera.lookAt(_look)
        introDone.current = true
        smoothed.current = 0
        if (!doneNotified.current) {
          doneNotified.current = true
          onIntroComplete?.()
        }
        invalidate()
        return
      }

      introT.current = Math.min(1, introT.current + dt / INTRO_DURATION_SEC)
      const u = smoothstep01(introT.current)
      const start = introStart.current
      const end = introEnd.current
      _pos.set(
        start.position[0] + (end.position[0] - start.position[0]) * u,
        start.position[1] + (end.position[1] - start.position[1]) * u,
        start.position[2] + (end.position[2] - start.position[2]) * u,
      )
      _look.set(
        start.lookAt[0] + (end.lookAt[0] - start.lookAt[0]) * u,
        start.lookAt[1] + (end.lookAt[1] - start.lookAt[1]) * u,
        start.lookAt[2] + (end.lookAt[2] - start.lookAt[2]) * u,
      )
      camera.position.copy(_pos)
      _m.lookAt(_pos, _look, _up)
      camera.quaternion.setFromRotationMatrix(_m)

      if (introT.current >= 1) {
        introDone.current = true
        smoothed.current = 0
        floorY.current = sampleHeight(_pos.x, _pos.z, 4) + CLEARANCE
        if (!doneNotified.current) {
          doneNotified.current = true
          onIntroComplete?.()
        }
      }
      invalidate()
      return
    }

    const target = reducedMotion ? 0.18 : progressRef.current
    // Touch: slower follow so momentum scroll feels cushioned, not stepped
    const follow = soft ? 1.35 : 2.4
    const move = soft ? 1.65 : 2.8
    const look = soft ? 1.5 : 2.6
    const turn = soft ? 1.8 : 3.0
    const floor = soft ? 2.0 : 3.2

    // Softer scroll follow — reduces stutter from scroll-event stepping
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-dt * follow))

    const sample = sampleCameraPath(smoothed.current)
    _desired.copy(sample.position)

    const surface = sampleHeight(_desired.x, _desired.z, 4)
    const rawFloor = surface + CLEARANCE
    // Ease floor both ways (instant ratchet was causing vertical pops)
    floorY.current += (rawFloor - floorY.current) * (1 - Math.exp(-dt * floor))
    if (_desired.y < floorY.current) _desired.y = floorY.current

    _lookSafe.copy(sample.lookAt)
    const lift = Math.max(0, _desired.y - sample.position.y)
    if (lift > 1) {
      _lookSafe.y -= lift * 0.55
    }

    let busy = Math.abs(target - smoothed.current) > 1e-4

    if (!initialized.current) {
      _pos.copy(_desired)
      _look.copy(_lookSafe)
      floorY.current = rawFloor
      camera.position.copy(_pos)
      camera.lookAt(_look)
      initialized.current = true
      busy = true
    } else {
      const prevX = _pos.x
      const prevY = _pos.y
      const prevZ = _pos.z
      _pos.lerp(_desired, 1 - Math.exp(-dt * move))
      if (_pos.y < floorY.current) _pos.y = floorY.current
      _look.lerp(_lookSafe, 1 - Math.exp(-dt * look))

      handT.current += dt
      const settle = Math.abs(target - smoothed.current)
      const handTarget = reducedMotion
        ? 0
        : settle < 0.0025
          ? 0.55
          : settle < 0.01
            ? 0.22
            : 0.08
      handAmt.current += (handTarget - handAmt.current) * (1 - Math.exp(-dt * 1.4))
      const a = handAmt.current

      _lookDir.copy(_look).sub(_pos)
      if (_lookDir.lengthSq() < 1e-6) _lookDir.set(0, 0, -1)
      else _lookDir.normalize()
      _right.crossVectors(_lookDir, _up)
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0)
      else _right.normalize()

      const t = handT.current
      const breath = Math.sin(t * 1.05) * 1.55
      const sway = Math.sin(t * 0.68 + 1.2) * 2.35
      const bob = Math.sin(t * 0.37 + 0.6) * 0.75
      const tremorX = Math.sin(t * 5.6 + 0.8) * 0.12
      const tremorY = Math.sin(t * 6.9 + 2.1) * 0.1

      _handPos
        .copy(_pos)
        .addScaledVector(_right, (sway + tremorX) * a)
        .addScaledVector(_up, (breath + bob + tremorY) * a)
      _handLook
        .copy(_look)
        .addScaledVector(_right, (sway * 0.55 + tremorX * 0.7) * a)
        .addScaledVector(_up, (breath * 0.35 + bob * 0.65) * a)

      camera.position.copy(_handPos)
      _m.lookAt(_handPos, _handLook, _up)
      _desiredQuat.setFromRotationMatrix(_m)
      camera.quaternion.slerp(_desiredQuat, 1 - Math.exp(-dt * turn))
      if (a > 0.02) busy = true

      const dx = _pos.x - prevX
      const dy = _pos.y - prevY
      const dz = _pos.z - prevZ
      if (dx * dx + dy * dy + dz * dz > 1e-6) busy = true
    }

    if (busy) invalidate()
  })

  return null
}

function ViewApiBridge({
  viewApiRef,
}: {
  viewApiRef: MutableRefObject<{
    getView: () => {
      position: [number, number, number]
      lookAt: [number, number, number]
    }
    goToView: (
      position: [number, number, number],
      lookAt: [number, number, number],
    ) => void
  } | null>
}) {
  const { camera } = useThree()

  useFrame(() => {
    viewApiRef.current = {
      getView: () => {
        camera.getWorldDirection(_lookDir)
        return {
          position: [camera.position.x, camera.position.y, camera.position.z],
          lookAt: [
            camera.position.x + _lookDir.x * 220,
            camera.position.y + _lookDir.y * 220,
            camera.position.z + _lookDir.z * 220,
          ],
        }
      },
      goToView: (position, lookAt) => {
        camera.position.set(...position)
        camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
        camera.rotation.order = 'YXZ'
        window.dispatchEvent(new Event('path-editor-goto'))
      },
    }
  })

  return null
}

function CameraFar({ far }: { far: number }) {
  const { camera, invalidate } = useThree()
  useEffect(() => {
    camera.far = far
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, far, invalidate])
  return null
}

export function TerrainExperience({
  progressRef,
  reducedMotion,
  theme,
  quality,
  onReady,
  introActive = false,
  introPaused = false,
  onIntroComplete,
  editMode = false,
  waypoints = [],
  onWaypointsChange,
  selectedId = null,
  onSelectWaypoint,
  viewApiRef,
}: Props) {
  const meshRef = useRef<THREE.Object3D | null>(null)

  return (
    <>
      <CameraFar far={quality.cameraFar} />
      <SceneTheme theme={theme} />
      <Atmosphere
        reducedMotion={reducedMotion}
        theme={theme}
        quality={quality}
      />
      {quality.birds > 0 ? (
        <Suspense fallback={null}>
          <Birds theme={theme} quality={quality} reducedMotion={reducedMotion} />
        </Suspense>
      ) : null}
      <GroundFill />
      <HorizonMountains />
      <Terrain onReady={onReady} meshRef={meshRef} />
      <Forest quality={quality} />
      {editMode && onWaypointsChange && onSelectWaypoint ? (
        <Suspense fallback={null}>
          <PathEditorScene
            waypoints={waypoints}
            onChange={onWaypointsChange}
            selectedId={selectedId}
            onSelect={onSelectWaypoint}
          />
          {viewApiRef ? <ViewApiBridge viewApiRef={viewApiRef} /> : null}
        </Suspense>
      ) : (
        <CameraRig
          progressRef={progressRef}
          reducedMotion={reducedMotion}
          introActive={introActive}
          introPaused={introPaused}
          onIntroComplete={onIntroComplete}
        />
      )}
    </>
  )
}

useGLTF.preload(`${import.meta.env.BASE_URL}torres.glb`, true)
