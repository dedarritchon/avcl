import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  applyProps,
  extend,
  useFrame,
  type ThreeElement,
} from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

/**
 * Horizon-locked cloud billboards (drei Clouds, but yaw-only).
 * Stock drei copies the full camera quaternion, so mist banks pitch/roll
 * with POV flight — here they stay upright in world space.
 */

const CLOUD_URL =
  'https://rawcdn.githack.com/pmndrs/drei-assets/9225a9f1fbd449d9411125c2f419b843d0308c9f/cloud.png'

type CloudState = {
  uuid: string
  index: number
  segments: number
  dist: number
  matrix: THREE.Matrix4
  bounds: THREE.Vector3
  position: THREE.Vector3
  volume: number
  length: number
  ref: RefObject<THREE.Group | null>
  speed: number
  growth: number
  opacity: number
  fade: number
  density: number
  rotation: number
  rotationFactor: number
  color: THREE.Color
}

const parentMatrix = new THREE.Matrix4()
const translation = new THREE.Vector3()
const groupQuat = new THREE.Quaternion()
const rotation = new THREE.Quaternion()
const cpos = new THREE.Vector3()
const cquat = new THREE.Quaternion()
const scale = new THREE.Vector3()
const pos = new THREE.Vector3()
const qat = new THREE.Quaternion()
const spinAxis = new THREE.Vector3(0, 0, 1)
const camEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const yawEuler = new THREE.Euler(0, 0, 0, 'YXZ')

const CloudContext = createContext<RefObject<CloudState[]> | null>(null)

function setUpdateRange(
  attribute: {
    updateRange?: { offset: number; count: number }
    updateRanges?: Array<{ start: number; count: number }>
  },
  range: { start: number; count: number },
) {
  // three r159+: updateRanges[]; older: updateRange { offset, count }
  if (attribute.updateRanges) {
    attribute.updateRanges[0] = range
    return
  }
  if (attribute.updateRange) {
    attribute.updateRange.offset = range.start
    attribute.updateRange.count = range.count
  }
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    horizonCloudMaterial: ThreeElement<typeof THREE.MeshLambertMaterial>
  }
}

type CloudsProps = {
  children?: ReactNode
  material?: typeof THREE.Material
  texture?: string
  range?: number
  limit?: number
  frustumCulled?: boolean
}

export const Clouds = forwardRef<THREE.Group, CloudsProps>(
  function Clouds(
    {
      children,
      material = THREE.MeshLambertMaterial,
      texture = CLOUD_URL,
      range,
      limit = 200,
      frustumCulled,
      ...props
    },
    fref,
  ) {
    const CloudMaterial = useMemo(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Base = material as any
      return class extends Base {
        constructor() {
          super()
          const opaque =
            parseInt(THREE.REVISION.replace(/\D+/g, ''), 10) >= 154
              ? 'opaque_fragment'
              : 'output_fragment'
          this.onBeforeCompile = (shader: {
            vertexShader: string
            fragmentShader: string
          }) => {
            shader.vertexShader =
              `attribute float cloudOpacity;
               varying float vOpacity;
              ` +
              shader.vertexShader.replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>
                 vOpacity = cloudOpacity;
                `,
              )
            shader.fragmentShader =
              `varying float vOpacity;
              ` +
              shader.fragmentShader.replace(
                `#include <${opaque}>`,
                `#include <${opaque}>
                 gl_FragColor = vec4(outgoingLight, diffuseColor.a * vOpacity);
                `,
              )
          }
        }
      }
    }, [material])

    extend({ HorizonCloudMaterial: CloudMaterial })

    const instance = useRef<THREE.InstancedMesh>(null)
    const clouds = useRef<CloudState[]>([])
    const opacities = useMemo(
      () => new Float32Array(Array.from({ length: limit }, () => 1)),
      [limit],
    )
    const colors = useMemo(
      () =>
        new Float32Array(
          Array.from({ length: limit }, () => [1, 1, 1]).flat(),
        ),
      [limit],
    )
    const cloudTexture = useTexture(texture)

    useFrame((state, delta) => {
      const mesh = instance.current
      if (!mesh) return
      const t = state.clock.elapsedTime
      parentMatrix.copy(mesh.matrixWorld).invert()
      state.camera.matrixWorld.decompose(cpos, cquat, scale)

      // Yaw only — keep cloud cards parallel to world up
      camEuler.setFromQuaternion(cquat, 'YXZ')
      yawEuler.set(0, camEuler.y, 0, 'YXZ')

      for (let index = 0; index < clouds.current.length; index++) {
        const config = clouds.current[index]
        const group = config.ref.current
        if (!group) continue
        group.matrixWorld.decompose(translation, groupQuat, scale)
        translation.add(
          pos.copy(config.position).applyQuaternion(groupQuat).multiply(scale),
        )
        rotation
          .setFromEuler(yawEuler)
          .multiply(
            qat.setFromAxisAngle(
              spinAxis,
              (config.rotation += delta * config.rotationFactor),
            ),
          )
        scale.multiplyScalar(
          config.volume +
            ((1 + Math.sin(t * config.density * config.speed)) / 2) *
              config.growth,
        )
        config.matrix.compose(translation, rotation, scale).premultiply(parentMatrix)
        config.dist = translation.distanceTo(cpos)
      }

      clouds.current.sort((a, b) => b.dist - a.dist)
      for (let index = 0; index < clouds.current.length; index++) {
        const config = clouds.current[index]
        opacities[index] =
          config.opacity *
          (config.dist < config.fade - 1 ? config.dist / config.fade : 1)
        mesh.setMatrixAt(index, config.matrix)
        mesh.setColorAt(index, config.color)
      }

      mesh.geometry.attributes.cloudOpacity.needsUpdate = true
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })

    useLayoutEffect(() => {
      const mesh = instance.current
      if (!mesh) return
      const count = Math.min(
        limit,
        range !== undefined ? range : limit,
        clouds.current.length,
      )
      mesh.count = count
      setUpdateRange(mesh.instanceMatrix as never, { start: 0, count: count * 16 })
      if (mesh.instanceColor) {
        setUpdateRange(mesh.instanceColor as never, { start: 0, count: count * 3 })
      }
      setUpdateRange(mesh.geometry.attributes.cloudOpacity as never, {
        start: 0,
        count,
      })
    })

    let imageBounds: [number, number] = [
      cloudTexture.image?.width ?? 1,
      cloudTexture.image?.height ?? 1,
    ]
    const max = Math.max(imageBounds[0], imageBounds[1])
    imageBounds = [imageBounds[0] / max, imageBounds[1] / max]

    return (
      <group ref={fref} {...props}>
        <CloudContext.Provider value={clouds}>
          {children}
          <instancedMesh
            matrixAutoUpdate={false}
            ref={instance}
            args={[undefined, undefined, limit]}
            frustumCulled={frustumCulled}
          >
            <instancedBufferAttribute
              usage={THREE.DynamicDrawUsage}
              attach="instanceColor"
              args={[colors, 3]}
            />
            <planeGeometry args={[...imageBounds]}>
              <instancedBufferAttribute
                usage={THREE.DynamicDrawUsage}
                attach="attributes-cloudOpacity"
                args={[opacities, 1]}
              />
            </planeGeometry>
            <horizonCloudMaterial
              key={material.name}
              map={cloudTexture}
              transparent
              depthWrite={false}
            />
          </instancedMesh>
        </CloudContext.Provider>
      </group>
    )
  },
)

type CloudProps = {
  opacity?: number
  speed?: number
  bounds?: [number, number, number]
  segments?: number
  color?: THREE.ColorRepresentation
  fade?: number
  volume?: number
  smallestVolume?: number
  growth?: number
  concentrate?: 'random' | 'inside' | 'outside'
  seed?: number
  children?: ReactNode
  position?: [number, number, number]
}

export const Cloud = forwardRef<THREE.Group, CloudProps>(function Cloud(
  {
    opacity = 1,
    speed = 0,
    bounds = [5, 1, 1],
    segments = 20,
    color = '#ffffff',
    fade = 10,
    volume = 6,
    smallestVolume = 0.25,
    growth = 4,
    concentrate = 'inside',
    seed: seedProp = Math.random(),
    ...props
  },
  fref,
) {
  let seed = seedProp
  function random() {
    const x = Math.sin(seed++) * 10000
    return x - Math.floor(x)
  }

  const parent = useContext(CloudContext)
  const ref = useRef<THREE.Group>(null)
  const uuid = useId()

  const clouds = useMemo(() => {
    return [...new Array(segments)].map((_, index) => ({
      segments,
      bounds: new THREE.Vector3(1, 1, 1),
      position: new THREE.Vector3(),
      uuid,
      index,
      ref,
      dist: 0,
      matrix: new THREE.Matrix4(),
      color: new THREE.Color(),
      rotation: index * (Math.PI / segments),
      volume: 0,
      length: 0,
      speed: 0,
      growth: 0,
      opacity: 1,
      fade: 10,
      density: 1,
      rotationFactor: 0,
    })) satisfies CloudState[]
  }, [segments, uuid])

  useLayoutEffect(() => {
    if (!parent) return
    clouds.forEach((cloud) => {
      applyProps(cloud as never, {
        volume,
        color,
        speed,
        growth,
        opacity,
        fade,
        bounds,
        density: Math.max(0.5, random()),
        rotationFactor: Math.max(0.2, 0.5 * random()) * speed,
      })

      if (segments > 1) {
        cloud.position.copy(cloud.bounds).multiply(
          new THREE.Vector3(
            random() * 2 - 1,
            random() * 2 - 1,
            random() * 2 - 1,
          ),
        )
      }
      const xDiff = Math.abs(cloud.position.x)
      const yDiff = Math.abs(cloud.position.y)
      const zDiff = Math.abs(cloud.position.z)
      const max = Math.max(xDiff, yDiff, zDiff)
      cloud.length = 1
      if (xDiff === max) cloud.length -= xDiff / cloud.bounds.x
      if (yDiff === max) cloud.length -= yDiff / cloud.bounds.y
      if (zDiff === max) cloud.length -= zDiff / cloud.bounds.z
      cloud.volume =
        Math.max(
          Math.max(0, smallestVolume),
          concentrate === 'random'
            ? random()
            : concentrate === 'inside'
              ? cloud.length
              : 1 - cloud.length,
        ) * volume
    })
  }, [
    concentrate,
    bounds,
    fade,
    color,
    opacity,
    growth,
    volume,
    seedProp,
    segments,
    speed,
    smallestVolume,
    clouds,
    parent,
  ])

  useLayoutEffect(() => {
    if (!parent) return
    const temp = clouds
    parent.current = [...parent.current, ...temp]
    return () => {
      parent.current = parent.current.filter((item) => item.uuid !== uuid)
    }
  }, [clouds, parent, uuid])

  useImperativeHandle(fref, () => ref.current as THREE.Group, [])

  return <group ref={ref} {...props} />
})
