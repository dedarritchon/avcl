import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useFrame } from '@react-three/fiber'
import {
  guessInitialTier,
  settingsForTier,
  storeTier,
  tierFromFps,
  type QualitySettings,
  type QualityTier,
} from '../lib/quality'

type QualityApi = {
  settings: QualitySettings
  reportFps: (avgFps: number) => void
}

const QualityContext = createContext<QualityApi | null>(null)

const MEASURED_KEY = 'varela-quality-measured'

function alreadyMeasured() {
  try {
    return sessionStorage.getItem(MEASURED_KEY) === '1'
  } catch {
    return false
  }
}

function markMeasured() {
  try {
    sessionStorage.setItem(MEASURED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function QualityProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<QualityTier>(() => guessInitialTier())
  const measured = useRef(alreadyMeasured())

  const reportFps = useCallback(
    (avgFps: number) => {
      if (measured.current) return
      measured.current = true
      markMeasured()
      setTier((current) => {
        const next = tierFromFps(current, avgFps)
        storeTier(next)
        return next
      })
    },
    [],
  )

  const settings = useMemo(() => settingsForTier(tier), [tier])
  const api = useMemo(() => ({ settings, reportFps }), [settings, reportFps])

  return <QualityContext.Provider value={api}>{children}</QualityContext.Provider>
}

function useQualityApi(): QualityApi {
  const ctx = useContext(QualityContext)
  if (!ctx) {
    return {
      settings: settingsForTier(guessInitialTier()),
      reportFps: () => {},
    }
  }
  return ctx
}

export function useQuality(): QualitySettings {
  return useQualityApi().settings
}

export function useReportFps() {
  return useQualityApi().reportFps
}

/** Samples render FPS inside the Canvas (demand frameloop) and reports once. */
export function QualityFpsProbe({ onReport }: { onReport: (avgFps: number) => void }) {
  const frames = useRef(0)
  const elapsed = useRef(0)
  const done = useRef(alreadyMeasured())
  const onReportRef = useRef(onReport)
  onReportRef.current = onReport

  useFrame(({ invalidate }, delta) => {
    if (done.current) return
    if (delta > 0 && delta < 0.25) {
      elapsed.current += delta
      frames.current += 1
    }
    if (elapsed.current >= 1.5) {
      done.current = true
      onReportRef.current(frames.current / elapsed.current)
      return
    }
    // Keep the demand loop alive until we finish sampling
    invalidate()
  })

  return null
}
