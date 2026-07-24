import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { remapScrollProgress } from '../lib/scrollBeats'

const UI_HZ = 12
const UI_MS = 1000 / UI_HZ

function readRaw() {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}

/**
 * progressRef — updated every scroll rAF for the 3D camera (no React re-render).
 * progress — throttled React state for narrative UI (~12 Hz).
 * Calls onInvalidate when scroll/resize changes progress (for frameloop=demand).
 */
export function useScrollProgress(onInvalidate?: () => void): {
  progress: number
  progressRef: MutableRefObject<number>
} {
  const progressRef = useRef(0)
  const [progress, setProgress] = useState(0)
  const lastUi = useRef(0)
  const invalidateRef = useRef(onInvalidate)
  invalidateRef.current = onInvalidate

  useEffect(() => {
    let frame = 0

    const update = () => {
      const raw = readRaw()
      const next = remapScrollProgress(raw)
      progressRef.current = next
      invalidateRef.current?.()

      const now = performance.now()
      if (now - lastUi.current >= UI_MS) {
        lastUi.current = now
        setProgress((prev) => (Math.abs(prev - next) > 0.0005 ? next : prev))
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }

    update()
    setProgress(progressRef.current)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onScroll)
    vv?.addEventListener('scroll', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      vv?.removeEventListener('resize', onScroll)
      vv?.removeEventListener('scroll', onScroll)
    }
  }, [])

  return { progress, progressRef }
}
