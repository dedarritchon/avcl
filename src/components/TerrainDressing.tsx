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

/**
 * Glacier / ice floors — no trees or grass (world xz).
 * Keep Grey Glacier clear; do NOT blanket the opening-camera ridge.
 */
const GLACIER_ZONES: ReadonlyArray<{
  xmin: number
  xmax: number
  zmin: number
  zmax: number
}> = [
  // Grey Glacier tongue + western ice shelf
  { xmin: -1580, xmax: -720, zmin: -1020, zmax: -300 },
  // Northwest ice continuation
  { xmin: -1580, xmax: -960, zmin: -320, zmax: -40 },
  // Mid flats west of the valley (not the intro foreground ridge)
  { xmin: -1180, xmax: -780, zmin: -180, zmax: 200 },
]

/** Margin around glacier boxes — enough for ice rims, not the whole valley. */
const GLACIER_EDGE_PAD = 90

/**
 * Opening frame ridge (first camera path keyframe) — trees belong here.
 * World xz near position [-1041, 124, 790].
 */
function inIntroForestBelt(x: number, z: number) {
  return x > -1280 && x < -820 && z > 580 && z < 920
}

function inGlacier(x: number, z: number, pad = 0) {
  for (const z0 of GLACIER_ZONES) {
    if (
      x >= z0.xmin - pad &&
      x <= z0.xmax + pad &&
      z >= z0.zmin - pad &&
      z <= z0.zmax + pad
    ) {
      return true
    }
  }
  return false
}

/** Wide flat mid-elevation — ice the boxes might miss (not steep green hills). */
function isIcyFlat(x: number, z: number) {
  const y = sampleHeightExact(x, z)
  if (y < 36 || y > 95) return false
  const wide = sampleSlope(x, z, 110)
  const mid = sampleSlope(x, z, 56)
  return wide < 0.055 && mid < 0.07
}

function noVegetation(x: number, z: number) {
  if (inTorresLagoon(x, z)) return true
  // Keep trees on the opening shoreline / ridge
  if (inIntroForestBelt(x, z)) return false
  return inGlacier(x, z, GLACIER_EDGE_PAD) || isIcyFlat(x, z)
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

  while (matrices.length < count && attempts < count * 36) {
    attempts += 1
    const x = xmin + rand() * (xmax - xmin)
    const z = zmin + rand() * (zmax - zmin)
    if (x < xmin + pad || x > xmax - pad || z < zmin + pad || z > zmax - pad) continue
    if (noVegetation(x, z)) continue

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

function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Dense pointy peaks — many sharp summits, still below the real Torres. */
function ridgeHeight(angle: number, seed: number) {
  const a = angle + seed
  // High exponents → narrow, pointy spikes; higher frequencies → more peaks
  const peaks =
    48 * Math.pow(Math.abs(Math.sin(a * 4.2 + 0.2)), 3.2) +
    42 * Math.pow(Math.abs(Math.sin(a * 7.8 + 1.4)), 3.6) +
    36 * Math.pow(Math.abs(Math.sin(a * 12.5 + 2.1)), 4.0) +
    28 * Math.pow(Math.abs(Math.sin(a * 19.0 + 0.6)), 4.4) +
    22 * Math.pow(Math.abs(Math.sin(a * 27.5 + 1.9)), 5.0) +
    16 * Math.pow(Math.abs(Math.sin(a * 38.0 + 3.3)), 5.5)
  const base = 28 + 18 * (0.5 + 0.5 * Math.sin(a * 1.5 + seed))
  const grit = 14 * Math.pow(hash01(Math.floor(a * 48) + seed * 19), 2.2)
  return base + peaks + grit
}

type RadialBand = {
  scale: number
  heightScale: number
  yBase: number
  color: THREE.Color
}

/**
 * Near apron only — just under the DEM rim. Far horizon is HorizonMountains.
 */
export function GroundFill() {
  const { geometry, material } = useMemo(() => {
    const { xmin, xmax, zmin, zmax } = HEIGHTMAP_BOUNDS
    const cx = (xmin + xmax) * 0.5
    const cz = (zmin + zmax) * 0.5
    const halfW = (xmax - xmin) * 0.5
    const halfD = (zmax - zmin) * 0.5

    const rings = [
      { scale: 1.02, y: -28, color: new THREE.Color('#3a4a42') },
      { scale: 1.18, y: -38, color: new THREE.Color('#334038') },
      { scale: 1.45, y: -50, color: new THREE.Color(GROUND_DEEP) },
    ]
    const segs = 64
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

/**
 * Low distant foothills just past the DEM rim — soft silhouette, not a wall of peaks.
 */
export function HorizonMountains() {
  const { geometry, material } = useMemo(() => {
    const { xmin, xmax, zmin, zmax } = HEIGHTMAP_BOUNDS
    const cx = (xmin + xmax) * 0.5
    const cz = (zmin + zmax) * 0.5
    const halfW = (xmax - xmin) * 0.5
    const halfD = (zmax - zmin) * 0.5

    const bands: RadialBand[] = [
      { scale: 1.1, heightScale: 0.12, yBase: -16, color: new THREE.Color('#3a463c') },
      { scale: 1.35, heightScale: 0.55, yBase: -2, color: new THREE.Color('#445044') },
      // Near pointy row
      { scale: 1.65, heightScale: 0.95, yBase: 6, color: new THREE.Color('#526056') },
      // Far denser peaks (offset phase via seed in height fn through angle)
      { scale: 2.05, heightScale: 1.05, yBase: 2, color: new THREE.Color('#5a6458') },
      { scale: 2.45, heightScale: 0.55, yBase: -10, color: new THREE.Color('#646e66') },
      { scale: 2.95, heightScale: 0.15, yBase: -28, color: new THREE.Color('#6e7a76') },
      { scale: 3.4, heightScale: 0, yBase: -46, color: new THREE.Color('#849098') },
    ]

    const segs = 220
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const slope = new THREE.Color('#4a5648')
    const rock = new THREE.Color('#6a7068')
    const tip = new THREE.Color('#9aa4a0')
    const haze = new THREE.Color('#a8b4bc')
    const tmp = new THREE.Color()

    for (let b = 0; b < bands.length; b++) {
      const band = bands[b]
      const distFade = b / (bands.length - 1)
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2
        // Mild radial wobble so the ring isn't a perfect ellipse
        const radial =
          band.scale + (hash01(i * 0.37 + b * 2.1) - 0.5) * 0.04 * band.heightScale
        const x = cx + Math.cos(a) * halfW * radial
        const z = cz + Math.sin(a) * halfD * radial
        // Offset seed per band so far/near ridges don't stack the same peaks
        const h = ridgeHeight(a, 1.7 + b * 0.85) * band.heightScale
        const y = band.yBase + h
        positions.push(x, y, z)

        const t = Math.min(1, Math.max(0, (h - 35) / 140))
        if (t < 0.55) tmp.copy(slope).lerp(rock, t / 0.55)
        else tmp.copy(rock).lerp(tip, (t - 0.55) / 0.45)
        tmp.lerp(band.color, 0.4)
        tmp.lerp(haze, 0.2 + distFade * 0.55)
        colors.push(tmp.r, tmp.g, tmp.b)
      }
    }

    for (let b = 0; b < bands.length - 1; b++) {
      const row0 = b * segs
      const row1 = (b + 1) * segs
      for (let i = 0; i < segs; i++) {
        const i0 = row0 + i
        const i1 = row0 + ((i + 1) % segs)
        const i2 = row1 + i
        const i3 = row1 + ((i + 1) % segs)
        indices.push(i0, i2, i1, i1, i2, i3)
      }
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
      flatShading: false,
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
