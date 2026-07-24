/**
 * Narrative scroll map: camera travels between beats; captions fade with motion.
 */
export type ScrollBeatId = 'hero' | 'grey' | 'massif' | 'walk' | 'contact' | 'finale'

export type ScrollBeat = {
  id: ScrollBeatId
  /** Camera-path progress at this beat's peak caption */
  cameraT: number
  /** Relative weight of the travel to the next beat (0 on last) */
  travel: number
}

export const SCROLL_BEATS: ScrollBeat[] = [
  { id: 'hero', cameraT: 0, travel: 0.7 },
  { id: 'grey', cameraT: 0.16, travel: 0.95 },
  { id: 'massif', cameraT: 0.34, travel: 0.95 },
  { id: 'walk', cameraT: 0.5, travel: 0.95 },
  { id: 'contact', cameraT: 0.66, travel: 1.0 },
  { id: 'finale', cameraT: 1, travel: 0 },
]

type Seg = {
  from: number
  to: number
  w: number
  beatId: ScrollBeatId
}

function buildSegments(): Seg[] {
  const segs: Seg[] = []
  for (let i = 0; i < SCROLL_BEATS.length - 1; i++) {
    const b = SCROLL_BEATS[i]
    if (b.travel > 0) {
      segs.push({
        from: b.cameraT,
        to: SCROLL_BEATS[i + 1].cameraT,
        w: b.travel,
        beatId: b.id,
      })
    }
  }
  return segs
}

const SEGS = buildSegments()
const TOTAL_W = SEGS.reduce((s, g) => s + g.w, 0)

function smoothstep(t: number) {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

/** Remap raw page scroll 0…1 → continuous camera progress (no plateaus). */
export function remapScrollProgress(raw: number): number {
  const u0 = Math.min(1, Math.max(0, raw))
  let u = u0 * TOTAL_W
  for (const seg of SEGS) {
    if (u <= seg.w) {
      if (seg.w < 1e-6) return seg.from
      return seg.from + (seg.to - seg.from) * smoothstep(u / seg.w)
    }
    u -= seg.w
  }
  return 1
}

/**
 * Opacity of a caption (+ CSS mist).
 * Peaks around cameraT while the view is still moving; fades in/out with travel.
 */
export function beatOpacity(progress: number, id: ScrollBeatId): number {
  const idx = SCROLL_BEATS.findIndex((b) => b.id === id)
  if (idx < 0) return 0
  const beat = SCROLL_BEATS[idx]
  const peak = beat.cameraT

  // Hero at start / Contacto at end
  if (id === 'hero' && progress < 0.04) return 1
  if (id === 'finale' && progress > 0.9) return 1

  const prev = idx > 0 ? SCROLL_BEATS[idx - 1] : null
  const next = idx < SCROLL_BEATS.length - 1 ? SCROLL_BEATS[idx + 1] : null

  // Approaching — fade in through mid/late travel
  if (prev && progress >= prev.cameraT && progress < peak) {
    const span = Math.max(1e-6, peak - prev.cameraT)
    const u = (progress - prev.cameraT) / span
    return Math.min(1, Math.max(0, (u - 0.32) / 0.48)) ** 0.75
  }

  // Leaving — fade sooner so the next caption owns the screen alone
  if (next && progress >= peak && progress <= next.cameraT) {
    const span = Math.max(1e-6, next.cameraT - peak)
    const u = (progress - peak) / span
    if (u < 0.12) return 1
    return Math.min(1, Math.max(0, 1 - (u - 0.12) / 0.28))
  }

  // Hero leaving first leg
  if (!prev && progress <= peak) {
    return 1
  }
  if (!prev && next && progress > peak && progress <= next.cameraT) {
    const span = Math.max(1e-6, next.cameraT - peak)
    const u = (progress - peak) / span
    return Math.min(1, Math.max(0, 1 - u / 0.38)) ** 1.05
  }

  if (!next && progress >= peak) return 1

  return 0
}
