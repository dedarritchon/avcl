import { useLayoutEffect, type RefObject } from 'react'
import { invalidate } from '@react-three/fiber'

/**
 * Keeps a fixed fullscreen layer taller than the visual viewport so iOS/Android
 * browser chrome collapse can't open a blank band at the bottom while scrolling.
 */
export function useViewportCover(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let maxH = 0
    let frame = 0

    const measure = () => {
      const vv = window.visualViewport
      // + buffer covers toolbar collapse mid-animation (layout lag)
      const next = Math.ceil(
        Math.max(
          window.innerHeight,
          vv?.height ?? 0,
          document.documentElement.clientHeight,
        ) + 160,
      )
      if (next <= maxH) {
        invalidate()
        return
      }
      maxH = next
      el.style.height = `${maxH}px`
      invalidate()
    }

    const onChange = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', onChange)
    window.addEventListener('orientationchange', onChange)
    window.addEventListener('scroll', onChange, { passive: true })
    const vv = window.visualViewport
    vv?.addEventListener('resize', onChange)
    vv?.addEventListener('scroll', onChange)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('orientationchange', onChange)
      window.removeEventListener('scroll', onChange)
      vv?.removeEventListener('resize', onChange)
      vv?.removeEventListener('scroll', onChange)
    }
  }, [ref])
}
