import * as THREE from 'three'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'varela-theme'
export const DEFAULT_THEME: Theme = 'light'

export const themeSky = {
  light: {
    stops: [
      [0, '#1c5a96'],
      [0.45, '#3d86b8'],
      [0.72, '#6a9fc0'],
      [0.9, '#8eb4c8'],
      [1, '#a8c2d2'],
    ] as const,
    clear: 0xa8c2d2,
    fog: '#a8c2d2',
    fogDensity: 0.00095,
    exposure: 0.95,
    envIntensity: 0.55,
  },
  dark: {
    stops: [
      [0, '#03060d'],
      [0.35, '#070d1a'],
      [0.62, '#101828'],
      [0.82, '#1a2436'],
      [1, '#243044'],
    ] as const,
    clear: 0x243044,
    fog: '#1a2436',
    fogDensity: 0.00085,
    exposure: 0.78,
    envIntensity: 0.32,
  },
} as const

export function readStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME
}

export function makeSkyTexture(theme: Theme): THREE.CanvasTexture {
  const { stops } = themeSky[theme]
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  for (const [t, color] of stops) g.addColorStop(t, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)
  const sky = new THREE.CanvasTexture(c)
  sky.colorSpace = THREE.SRGBColorSpace
  return sky
}
