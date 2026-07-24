import { useEffect, useRef } from 'react'
import { useFrame, useThree, invalidate } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleHeight } from '../lib/heightmap'
import { sampleCameraPath } from '../lib/cameraPath'
import {
  isUiTarget,
  prefersTouchSteer,
  steerFromSwipe,
  SWIPE_PITCH,
  SWIPE_YAW,
} from '../lib/birdsViewTilt'

const SPEED = 118
const YAW_RATE = 0.62
const PITCH_RATE = 0.48
const CLEARANCE = 12

const STEER_SMOOTH = 3.2
const BANK_MAX = 0.38
const BANK_FROM_YAW = 0.55
const BANK_SMOOTH = 3.8

const FLAP_HZ = 1.35
const FLAP_BOB = 0.12
const FLAP_PITCH = 0.006

const _fwd = new THREE.Vector3()

type Props = {
  startProgress: number
  reducedMotion?: boolean
}

/**
 * First-person bird POV: constant forward speed, smoothed steering + flap bob.
 * Desktop: arrow keys. Mobile: drag/swipe from touch origin.
 * wantPitch > 0 = nose up (climb). Three.js +rotation.x looks down, so we subtract.
 */
export function BirdsViewRig({ startProgress, reducedMotion = false }: Props) {
  const { camera } = useThree()
  const keys = useRef(new Set<string>())
  const yaw = useRef(0)
  const pitch = useRef(0)
  const yawRate = useRef(0)
  const pitchRate = useRef(0)
  const bank = useRef(0)
  const floorY = useRef(0)
  const primed = useRef(false)
  const flapT = useRef(0)
  const swipe = useRef({
    active: false,
    pointerId: -1,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  })

  useEffect(() => {
    if (primed.current) return
    primed.current = true

    const sample = sampleCameraPath(startProgress)
    camera.position.copy(sample.position)
    camera.lookAt(sample.lookAt)
    camera.rotation.order = 'YXZ'
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    yaw.current = e.y
    pitch.current = e.x
    yawRate.current = 0
    pitchRate.current = 0
    bank.current = 0
    floorY.current = sampleHeight(sample.position.x, sample.position.z, 4) + CLEARANCE
    invalidate()
  }, [camera, startProgress])

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown'
      ) {
        e.preventDefault()
        keys.current.add(e.code)
        invalidate()
      }
    }
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.code)

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
    }
  }, [])

  useEffect(() => {
    if (!prefersTouchSteer()) return

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (isUiTarget(e.target)) return
      if (swipe.current.active) return
      swipe.current = {
        active: true,
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        x: e.clientX,
        y: e.clientY,
      }
      invalidate()
    }
    const onMove = (e: PointerEvent) => {
      if (!swipe.current.active || e.pointerId !== swipe.current.pointerId) return
      swipe.current.x = e.clientX
      swipe.current.y = e.clientY
      e.preventDefault()
      invalidate()
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== swipe.current.pointerId) return
      swipe.current.active = false
      swipe.current.pointerId = -1
      invalidate()
    }

    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      swipe.current.active = false
    }
  }, [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const k = keys.current
    const soft = reducedMotion ? 0.55 : 1

    // +wantYaw = turn left, +wantPitch = nose up / climb
    let wantYaw = 0
    let wantPitch = 0
    if (k.has('ArrowLeft')) wantYaw += 1
    if (k.has('ArrowRight')) wantYaw -= 1
    if (k.has('ArrowUp')) wantPitch += 1
    if (k.has('ArrowDown')) wantPitch -= 1

    if (swipe.current.active) {
      const dx = swipe.current.x - swipe.current.originX
      const dy = swipe.current.y - swipe.current.originY
      wantYaw += -steerFromSwipe(dx) * SWIPE_YAW
      wantPitch += steerFromSwipe(dy) * SWIPE_PITCH
    }
    wantYaw = THREE.MathUtils.clamp(wantYaw, -1, 1)
    wantPitch = THREE.MathUtils.clamp(wantPitch, -1, 1)

    const targetYawRate = wantYaw * YAW_RATE * soft
    const targetPitchRate = wantPitch * PITCH_RATE * soft
    const steerK = 1 - Math.exp(-dt * STEER_SMOOTH)
    yawRate.current += (targetYawRate - yawRate.current) * steerK
    pitchRate.current += (targetPitchRate - pitchRate.current) * steerK

    yaw.current += yawRate.current * dt
    // Three.js +rotation.x looks down — subtract so +wantPitch climbs
    pitch.current -= pitchRate.current * dt
    pitch.current = Math.max(-0.55, Math.min(0.42, pitch.current))

    if (Math.abs(wantPitch) < 0.05) {
      pitch.current += (0 - pitch.current) * (1 - Math.exp(-dt * 0.55))
    }

    const targetBank = THREE.MathUtils.clamp(
      -yawRate.current * BANK_FROM_YAW * 1.8,
      -BANK_MAX,
      BANK_MAX,
    )
    bank.current += (targetBank - bank.current) * (1 - Math.exp(-dt * BANK_SMOOTH))

    flapT.current += dt * (reducedMotion ? FLAP_HZ * 0.45 : FLAP_HZ)
    const flap = reducedMotion ? 0 : Math.sin(flapT.current * Math.PI * 2)

    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current + flap * FLAP_PITCH
    camera.rotation.z = bank.current

    camera.getWorldDirection(_fwd)
    const speed = (reducedMotion ? SPEED * 0.55 : SPEED) * soft
    camera.position.addScaledVector(_fwd, speed * dt)
    camera.position.y += flap * FLAP_BOB * dt * 8

    const surface = sampleHeight(camera.position.x, camera.position.z, 4)
    const rawFloor = surface + CLEARANCE
    floorY.current += (rawFloor - floorY.current) * (1 - Math.exp(-dt * 3.2))
    if (camera.position.y < floorY.current) {
      camera.position.y = floorY.current
      if (pitch.current > -0.08) pitch.current -= dt * 0.35
      pitchRate.current *= 0.85
    }

    const ceiling = surface + 420
    if (camera.position.y > ceiling) {
      camera.position.y = ceiling
      if (pitch.current < 0.06) pitch.current += dt * 0.28
      pitchRate.current *= 0.85
    }

    invalidate()
  })

  return null
}
