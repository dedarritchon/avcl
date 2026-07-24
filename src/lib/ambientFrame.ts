/**
 * Throttle ambient redraws (cloud drift, stars) so frameloop="demand"
 * does not pin the GPU at display refresh when the camera is idle.
 */
let lastTick = -1
const INTERVAL = 1 / 16

export function requestAmbientInvalidate(
  elapsed: number,
  invalidate: () => void,
): boolean {
  if (lastTick < 0 || elapsed - lastTick >= INTERVAL) {
    lastTick = elapsed
    invalidate()
    return true
  }
  return false
}
