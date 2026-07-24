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
  birds: number
  antialias: boolean
  dprMax: number
  cameraFar: number
}

const TIERS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
  high: {
    cloudLimit: 100,
    cloudMaxCount: 14,
    cloudSegments: 10,
    stars: 2200,
    celestialLayers: 6,
    environment: true,
    forestTree: 0.85,
    forestGrass: 0.7,
    birds: 8,
    antialias: true,
    dprMax: 1.5,
    cameraFar: 6000,
  },
  medium: {
    cloudLimit: 48,
    cloudMaxCount: 8,
    cloudSegments: 7,
    stars: 800,
    celestialLayers: 3,
    environment: true,
    forestTree: 0.45,
    forestGrass: 0.3,
    birds: 4,
    antialias: true,
    dprMax: 1,
    cameraFar: 4500,
  },
  low: {
    cloudLimit: 24,
    cloudMaxCount: 4,
    cloudSegments: 5,
    stars: 0,
    celestialLayers: 1,
    environment: false,
    forestTree: 0.22,
    forestGrass: 0.12,
    birds: 0,
    antialias: false,
    dprMax: 1,
    cameraFar: 3000,
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
