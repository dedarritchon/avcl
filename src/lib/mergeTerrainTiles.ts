import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyMutePeakWaterShader, configureTerrainMap } from './waterTerrainMaterial'

/**
 * Sketchfab DEM ships as many tiles with hairline gaps (sky leaks as bright seams).
 * Bake tiles into one mesh and weld boundary verts, then resmooth normals.
 */
export function mergeTerrainTiles(root: THREE.Object3D, maxAnisotropy: number) {
  root.updateWorldMatrix(true, true)
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const _local = new THREE.Matrix4()

  const geos: THREE.BufferGeometry[] = []
  const remove: THREE.Object3D[] = []
  let material: THREE.MeshStandardMaterial | null = null

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const name = [mesh.name, mesh.parent?.name, ...mats.map((m) => m?.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (name.includes('adorn')) {
      mesh.visible = false
      return
    }

    const std = mats.find(
      (m): m is THREE.MeshStandardMaterial =>
        !!(m as THREE.MeshStandardMaterial)?.isMeshStandardMaterial,
    )
    if (!std || !mesh.geometry) return

    if (!material) {
      material = std
      material.envMapIntensity = 0.95
      material.roughness = 0.88
      material.metalness = 0.02
      material.side = THREE.FrontSide
      material.flatShading = false
      material.fog = true
      // Slight lift — satellite albedo is often underexposed vs ground photos
      material.color.set('#f2f4f6')
      if (material.map) configureTerrainMap(material.map, maxAnisotropy)
      applyMutePeakWaterShader(material)
    }

    mesh.updateWorldMatrix(true, false)
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(_local.multiplyMatrices(invRoot, mesh.matrixWorld))
    geos.push(geo)
    remove.push(mesh)
  })

  for (const mesh of remove) mesh.removeFromParent()

  if (!material || geos.length === 0) return root

  const merged = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  if (!merged) return root

  // Model units are large (~tens of thousands); weld nearby tile-edge verts
  const welded = mergeVertices(merged, 2.5)
  merged.dispose()
  welded.computeVertexNormals()
  welded.computeBoundingBox()
  welded.computeBoundingSphere()

  const terrain = new THREE.Mesh(welded, material)
  terrain.name = 'TerrainMerged'
  terrain.castShadow = false
  terrain.receiveShadow = false
  terrain.frustumCulled = true
  root.add(terrain)

  return root
}
