import { Suspense, lazy, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { sampleCameraPath } from '../lib/cameraPath'
import { sampleHeight } from '../lib/heightmap'
import { mergeTerrainTiles } from '../lib/mergeTerrainTiles'
import type { Theme } from '../lib/theme'
import type { QualitySettings } from '../lib/quality'
import { Atmosphere } from './Atmosphere'
import { SceneTheme } from './SceneTheme'
import { Forest, GroundFill } from './TerrainDressing'
import type { EditorWaypoint } from './PathEditor'

const PathEditorScene = lazy(() =>
  import('./PathEditor').then((m) => ({ default: m.PathEditorScene })),
)

type Props = {
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  theme: Theme
  quality: QualitySettings
  onReady: () => void
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

const CLEARANCE = 45
/** Matches heightmap bake: centered GLB × scale, then +Y lift */
export const MODEL_SCALE = 0.075
export const MODEL_Y_LIFT = 1873.5 * MODEL_SCALE

const _desired = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _lookSafe = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _desiredQuat = new THREE.Quaternion()
const _m = new THREE.Matrix4()

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
}: {
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
}) {
  const { camera } = useThree()
  const smoothed = useRef(progressRef.current)
  const floorY = useRef(0)
  const initialized = useRef(false)

  useFrame(({ invalidate }, delta) => {
    const dt = Math.min(delta, 0.05)
    const target = reducedMotion ? 0.18 : progressRef.current

    // Softer scroll follow — reduces stutter from scroll-event stepping
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-dt * 2.4))

    const sample = sampleCameraPath(smoothed.current)
    _desired.copy(sample.position)

    const surface = sampleHeight(_desired.x, _desired.z, 4)
    const rawFloor = surface + CLEARANCE
    // Ease floor both ways (instant ratchet was causing vertical pops)
    floorY.current += (rawFloor - floorY.current) * (1 - Math.exp(-dt * 3.2))
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
      _pos.lerp(_desired, 1 - Math.exp(-dt * 2.8))
      if (_pos.y < floorY.current) _pos.y = floorY.current
      _look.lerp(_lookSafe, 1 - Math.exp(-dt * 2.6))
      camera.position.copy(_pos)
      _m.lookAt(_pos, _look, _up)
      _desiredQuat.setFromRotationMatrix(_m)
      camera.quaternion.slerp(_desiredQuat, 1 - Math.exp(-dt * 3.0))
      const dx = _pos.x - prevX
      const dy = _pos.y - prevY
      const dz = _pos.z - prevZ
      if (dx * dx + dy * dy + dz * dz > 1e-6) busy = true
    }

    if (busy) invalidate()
  })

  return null
}

const _lookDir = new THREE.Vector3()

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
      <Atmosphere reducedMotion={reducedMotion} theme={theme} quality={quality} />
      <GroundFill />
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
        <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
      )}
    </>
  )
}

useGLTF.preload(`${import.meta.env.BASE_URL}torres.glb`, true)
