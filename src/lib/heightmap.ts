import heightmap from '../data/heightmap.json'

type Heightmap = {
  res: number
  xmin: number
  xmax: number
  zmin: number
  zmax: number
  heights: number[]
}

const data = heightmap as Heightmap

export const HEIGHTMAP_BOUNDS = {
  xmin: data.xmin,
  xmax: data.xmax,
  zmin: data.zmin,
  zmax: data.zmax,
  res: data.res,
}

function sampleCell(ix: number, iz: number): number {
  const { res, heights } = data
  const x = Math.min(res - 1, Math.max(0, ix))
  const z = Math.min(res - 1, Math.max(0, iz))
  return heights[z * res + x]
}

/** Bilinear height sample (exact surface, not neighborhood max). */
export function sampleHeightExact(x: number, z: number): number {
  const { res, xmin, xmax, zmin, zmax } = data
  const fx = ((x - xmin) / (xmax - xmin)) * (res - 1)
  const fz = ((z - zmin) / (zmax - zmin)) * (res - 1)
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const tx = fx - x0
  const tz = fz - z0
  const h00 = sampleCell(x0, z0)
  const h10 = sampleCell(x0 + 1, z0)
  const h01 = sampleCell(x0, z0 + 1)
  const h11 = sampleCell(x0 + 1, z0 + 1)
  const h0 = h00 + (h10 - h00) * tx
  const h1 = h01 + (h11 - h01) * tx
  return h0 + (h1 - h0) * tz
}

/** Approximate slope magnitude (rise / run) around xz. */
export function sampleSlope(x: number, z: number, step = 24): number {
  const hL = sampleHeightExact(x - step, z)
  const hR = sampleHeightExact(x + step, z)
  const hD = sampleHeightExact(x, z - step)
  const hU = sampleHeightExact(x, z + step)
  const dx = (hR - hL) / (2 * step)
  const dz = (hU - hD) / (2 * step)
  return Math.hypot(dx, dz)
}

/** Sample max terrain height near xz (includes small neighborhood). */
export function sampleHeight(x: number, z: number, radius = 2): number {
  const { res, xmin, xmax, zmin, zmax, heights } = data
  const fx = ((x - xmin) / (xmax - xmin)) * (res - 1)
  const fz = ((z - zmin) / (zmax - zmin)) * (res - 1)
  const cx = Math.round(fx)
  const cz = Math.round(fz)

  let max = -Infinity
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const ix = Math.min(res - 1, Math.max(0, cx + dx))
      const iz = Math.min(res - 1, Math.max(0, cz + dz))
      const h = heights[iz * res + ix]
      if (h > max) max = h
    }
  }
  return Number.isFinite(max) ? max : 0
}
