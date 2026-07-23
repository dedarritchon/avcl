import { useEffect, useState } from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type Theme,
  readStoredTheme,
} from '../lib/theme'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME
    return readStoredTheme()
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const setTheme = (next: Theme) => setThemeState(next)

  return { theme, setTheme }
}
