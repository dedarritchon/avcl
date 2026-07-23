export type QualityTier = 'high' | 'medium' | 'low'

export type QualitySettings = {
  tier: QualityTier
  cloudLimit: number
  cloudMaxCount: number
  cloudSegments: number
  stars: number
  celestialLayers: number
  environment: boolean
  forestTree: number
  forestGrass: number
  antialias: boolean
  dprMax: number
  cameraFar: number
}

const TIERS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: {
    cloudLimit: 110,
    cloudMaxCount: 18,
    cloudSegments: 12,
    stars: 4200,
    celestialLayers: 8,
    environment: true,
    forestTree: 1,
    forestGrass: 1,
    antialias: true,
    dprMax: 1.25,
    cameraFar: 8000,
  },
  medium: {
    cloudLimit: 60,
    cloudMaxCount: 10,
    cloudSegments: 8,
    stars: 1200,
    celestialLayers: 3,
    environment: true,
    forestTree: 0.55,
    forestGrass: 0.45,
    antialias: true,
    dprMax: 1,
    cameraFar: 5000,
  },
  low: {
    cloudLimit: 30,
    cloudMaxCount: 5,
    cloudSegments: 6,
    stars: 0,
    celestialLayers: 1,
    environment: false,
    forestTree: 0.3,
    forestGrass: 0.2,
    antialias: false,
    dprMax: 1,
    cameraFar: 3500,
  },
}

export const QUALITY_STORAGE_KEY = 'varela-quality-tier'

export function settingsForTier(tier: QualityTier): QualitySettings {
  return { tier, ...TIERS[tier] }
}

const TIER_ORDER: QualityTier[] = ['low', 'medium', 'high']

export function dropTier(tier: QualityTier, steps = 1): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  return TIER_ORDER[Math.max(0, i - steps)]
}

export function readStoredTier(): QualityTier | null {
  try {
    const raw = sessionStorage.getItem(QUALITY_STORAGE_KEY)
    if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  } catch {
    /* ignore */
  }
  return null
}

export function storeTier(tier: QualityTier) {
  try {
    sessionStorage.setItem(QUALITY_STORAGE_KEY, tier)
  } catch {
    /* ignore */
  }
}

/** Heuristic guess before we have FPS samples. */
export function guessInitialTier(): QualityTier {
  const stored = readStoredTier()
  if (stored) return stored

  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory
  const saveData = nav.connection?.saveData === true
  const mobile = /Mobi|Android|iPhone|iPad/i.test(nav.userAgent)

  if (saveData) return 'low'
  if (mobile && (cores <= 4 || (memory != null && memory <= 4))) return 'low'
  if (mobile || cores <= 4 || (memory != null && memory <= 4)) return 'medium'
  if (cores <= 6 || (memory != null && memory <= 8)) return 'medium'
  return 'high'
}

/** Map measured average FPS to a tier adjustment from the current guess. */
export function tierFromFps(current: QualityTier, avgFps: number): QualityTier {
  if (avgFps < 28) return 'low'
  if (avgFps < 40) return dropTier(current, 1)
  return current
}
