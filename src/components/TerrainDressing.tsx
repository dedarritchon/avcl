import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import {
  HEIGHTMAP_BOUNDS,
  sampleHeightExact,
  sampleSlope,
} from '../lib/heightmap'
import type { QualitySettings } from '../lib/quality'
const GROUND_DEEP = '#4a5544'

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type TemplatePart = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

/** Bake a named plant/tree group into Y-up parts with base at y≈0. */
function bakeNamedTemplate(scene: THREE.Object3D, name: string): TemplatePart[] {
  const root = scene.getObjectByName(name)
  if (!root) return []

  scene.updateMatrixWorld(true)
  const parts: TemplatePart[] = []
  const box = new THREE.Box3()

  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return
    const mesh = o as THREE.Mesh
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    box.expandByObject(mesh)

    const mat = Array.isArray(mesh.material)
      ? mesh.material[0].clone()
      : mesh.material.clone()
    mat.side = THREE.DoubleSide
    if ('fog' in mat) (mat as THREE.MeshStandardMaterial).fog = true
    if ('roughness' in mat) {
      const std = mat as THREE.MeshStandardMaterial
      std.roughness = Math.max(0.75, std.roughness ?? 0.9)
      std.metalness = 0
      if (std.map) {
        std.map.anisotropy = 4
        std.map.colorSpace = THREE.SRGBColorSpace
      }
      // Leaf cards often need alpha
      if (std.map && (std.transparent || std.alphaTest > 0 || name.includes('grass') || name.includes('branch'))) {
        std.transparent = true
        std.alphaTest = Math.max(std.alphaTest, 0.35)
        std.depthWrite = true
      }
    }

    parts.push({ geometry, material: mat })
  })

  // Shift so the lowest point sits on the ground
  const minY = box.min.y
  for (const part of parts) {
    part.geometry.translate(0, -minY, 0)
    part.geometry.computeBoundingSphere()
  }
  return parts
}

/** Base Torres lagoon — keep vegetation off the water. */
function inTorresLagoon(x: number, z: number) {
  return x > 1180 && x < 1520 && z > -780 && z < -520
}

function fillMatrices(
  count: number,
  opts: {
    ymin: number
    ymax: number
    maxSlope: number
    minSlope?: number
    scaleMin: number
    scaleMax: number
    edgePad?: number
    seed: number
  },
) {
  const { xmin, xmax, zmin, zmax } = HEIGHTMAP_BOUNDS
  const rand = mulberry32(opts.seed)
  const pad = opts.edgePad ?? 90
  const minSlope = opts.minSlope ?? 0.04
  const dummy = new THREE.Object3D()
  const matrices: THREE.Matrix4[] = []
  let attempts = 0

  while (matrices.length < count && attempts < count * 24) {
    attempts += 1
    const x = xmin + rand() * (xmax - xmin)
    const z = zmin + rand() * (zmax - zmin)
    if (x < xmin + pad || x > xmax - pad || z < zmin + pad || z > zmax - pad) continue
    if (inTorresLagoon(x, z)) continue

    const y = sampleHeightExact(x, z)
    if (y < opts.ymin || y > opts.ymax) continue
    const slope = sampleSlope(x, z, 28)
    // Skip water flats (near-zero slope) and cliffs
    if (slope < minSlope || slope > opts.maxSlope) continue

    const prefer = 1 - (y - opts.ymin) / Math.max(1, opts.ymax - opts.ymin)
    if (rand() > 0.28 + prefer * 0.65) continue

    const s = opts.scaleMin + rand() * (opts.scaleMax - opts.scaleMin)
    dummy.position.set(x, y - 0.15, z)
    dummy.rotation.set(0, rand() * Math.PI * 2, 0)
    dummy.scale.setScalar(s)
    dummy.updateMatrix()
    matrices.push(dummy.matrix.clone())
  }
  return matrices
}

function buildInstances(parts: TemplatePart[], matrices: THREE.Matrix4[]) {
  if (!parts.length || !matrices.length) return [] as THREE.InstancedMesh[]
  return parts.map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length)
    mesh.count = matrices.length
    mesh.frustumCulled = true
    mesh.castShadow = false
    mesh.receiveShadow = false
    matrices.forEach((m, idx) => mesh.setMatrixAt(idx, m))
    mesh.instanceMatrix.needsUpdate = true
    return mesh
  })
}

/**
 * Extends far past the DEM: stepped apron so borders never show void.
 */
export function GroundFill() {
  const { geometry, material } = useMemo(() => {
    const { xmin, xmax, zmin, zmax } = HEIGHTMAP_BOUNDS
    const cx = (xmin + xmax) * 0.5
    const cz = (zmin + zmax) * 0.5
    const halfW = (xmax - xmin) * 0.5
    const halfD = (zmax - zmin) * 0.5

    // Keep apron well below lake/glacier surfaces so it never reads as a shore shelf
    const rings = [
      { scale: 1.02, y: -28, color: new THREE.Color('#3a4a42') },
      { scale: 1.2, y: -36, color: new THREE.Color('#334038') },
      { scale: 1.55, y: -44, color: new THREE.Color('#2c3630') },
      { scale: 2.2, y: -52, color: new THREE.Color(GROUND_DEEP) },
      // Stay in ground tones — fog-colored rings read as a white shelf at the DEM rim
      { scale: 3.6, y: -60, color: new THREE.Color('#3a4238') },
      { scale: 6.5, y: -68, color: new THREE.Color('#343a32') },
    ]
    const segs = 72
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const ringVerts: THREE.Vector3[][] = []
    for (const ring of rings) {
      const verts: THREE.Vector3[] = []
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2
        const x = cx + Math.cos(a) * halfW * ring.scale
        const z = cz + Math.sin(a) * halfD * ring.scale
        verts.push(new THREE.Vector3(x, ring.y, z))
      }
      ringVerts.push(verts)
    }

    let vBase = 0
    for (let r = 0; r < rings.length; r++) {
      for (let i = 0; i < segs; i++) {
        const v = ringVerts[r][i]
        positions.push(v.x, v.y, v.z)
        const c = rings[r].color
        colors.push(c.r, c.g, c.b)
      }
      if (r > 0) {
        const prev = vBase - segs
        for (let i = 0; i < segs; i++) {
          const i0 = prev + i
          const i1 = prev + ((i + 1) % segs)
          const i2 = vBase + i
          const i3 = vBase + ((i + 1) % segs)
          indices.push(i0, i2, i1, i1, i2, i3)
        }
      }
      vBase += segs
    }

    const centerIdx = vBase
    positions.push(cx, -6, cz)
    colors.push(0.36, 0.42, 0.34)
    for (let i = 0; i < segs; i++) {
      indices.push(centerIdx, i, (i + 1) % segs)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      fog: true,
      side: THREE.DoubleSide,
    })

    return { geometry: geo, material: mat }
  }, [])

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/** Real low-poly trees + grass from vegetation.glb (subset of the pack). */
export function Forest({ quality }: { quality: QualitySettings }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}vegetation.glb`)
  const { forestTree, forestGrass, tier } = quality

  const instances = useMemo(() => {
    const treeA = bakeNamedTemplate(scene, 'tree-stylized-01')
    const treeB = bakeNamedTemplate(scene, 'tree-stylized-04-green')
    const grassA = bakeNamedTemplate(scene, 'grass-bushes-01')
    const grassB = bakeNamedTemplate(scene, 'grass-bushes-02')

    const trees = (n: number) => Math.max(1, Math.round(n * forestTree))
    const grass = (n: number) => Math.max(1, Math.round(n * forestGrass))

    return [
      ...buildInstances(
        treeA,
        fillMatrices(trees(900), {
          ymin: 18,
          ymax: 100,
          maxSlope: 0.48,
          scaleMin: 1.15,
          scaleMax: 2.35,
          seed: 42,
        }),
      ),
      ...buildInstances(
        treeB,
        fillMatrices(trees(700), {
          ymin: 16,
          ymax: 92,
          maxSlope: 0.45,
          scaleMin: 1.25,
          scaleMax: 2.55,
          seed: 99,
        }),
      ),
      ...buildInstances(
        grassA,
        fillMatrices(grass(1600), {
          ymin: 14,
          ymax: 85,
          maxSlope: 0.4,
          scaleMin: 1.6,
          scaleMax: 3.4,
          seed: 7,
        }),
      ),
      ...buildInstances(
        grassB,
        fillMatrices(grass(1200), {
          ymin: 14,
          ymax: 78,
          maxSlope: 0.38,
          scaleMin: 1.4,
          scaleMax: 3.1,
          seed: 13,
        }),
      ),
    ]
  }, [scene, forestTree, forestGrass, tier])

  return (
    <group>
      {instances.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </group>
  )
}
