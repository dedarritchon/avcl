import { useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { copy, type Locale } from '../lib/locale'

/** Survives StrictMode remounts — drei progress resets between asset batches. */
let loaderPeak = 0

export function Loader({ visible, locale }: { visible: boolean; locale: Locale }) {
  const { progress } = useProgress()
  const wasVisible = useRef(visible)

  // New load session (e.g. hard remount) — allow a fresh climb
  if (visible && !wasVisible.current) {
    loaderPeak = 0
  }
  wasVisible.current = visible

  if (visible) {
    const next = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
    loaderPeak = Math.max(loaderPeak, next)
  }

  // Hold just under 100 until the scene actually dismisses the overlay
  const value = visible ? Math.min(loaderPeak, 96) : 100

  return (
    <div
      className={`loader${visible ? '' : ' loader--done'}`}
      role="status"
      aria-live="polite"
      aria-busy={visible}
      aria-hidden={!visible}
    >
      <div className="loader__mark">AVCL</div>
      <p className="loader__label">{copy[locale].loader}</p>
      <div
        className="loader__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-label={copy[locale].loader}
      >
        <div className="loader__bar-fill" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <p className="loader__pct">{Math.round(value)}%</p>
    </div>
  )
}
