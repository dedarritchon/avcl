/** Full steer at this drag distance from touch origin (css px) */
export const SWIPE_FULL_PX = 72
export const SWIPE_YAW = 1.1
export const SWIPE_PITCH = 1.1

export function prefersTouchSteer() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  )
}

/** @deprecated use prefersTouchSteer */
export const prefersTiltSteer = prefersTouchSteer

export function steerFromSwipe(offsetPx: number) {
  const a = Math.abs(offsetPx)
  if (a < 4) return 0
  const signed = offsetPx < 0 ? -1 : 1
  return signed * Math.min(1, (a - 4) / (SWIPE_FULL_PX - 4))
}

export function isUiTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, a, input, .site-controls, .lang-toggle'))
}
