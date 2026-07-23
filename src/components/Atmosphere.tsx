import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Cloud, Clouds, Environment, Stars } from '@react-three/drei'
import * as THREE from 'three'
import {
  FOG_COLOR,
  FOG_COLOR_NIGHT,
  FOG_DENSITY,
  FOG_DENSITY_NIGHT,
} from '../lib/atmosphereColors'
import type { Theme } from '../lib/theme'
import { themeSky } from '../lib/theme'
import type { QualitySettings } from '../lib/quality'

/** Northern sky, moderate elevation — stays inside fov along the path */
export const SUN_DIR = new THREE.Vector3(0.42, 0.28, -0.86).normalize()
const SUN_DISTANCE = 2800
const SUN_POS = SUN_DIR.clone().multiplyScalar(SUN_DISTANCE)

class CloudMaterial extends THREE.MeshLambertMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  }
}

function makeGlowTexture(night: boolean) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const c = size / 2
  const g = ctx.createRadialGradient(c, c, 0, c, c, c)
  if (night) {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.1, 'rgba(230,240,255,0.95)')
    g.addColorStop(0.28, 'rgba(180,205,240,0.45)')
    g.addColorStop(0.5, 'rgba(120,155,210,0.18)')
    g.addColorStop(0.75, 'rgba(80,110,170,0.06)')
    g.addColorStop(1, 'rgba(40,70,120,0)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.08, 'rgba(255,252,235,0.95)')
    g.addColorStop(0.22, 'rgba(255,236,190,0.55)')
    g.addColorStop(0.45, 'rgba(255,210,140,0.22)')
    g.addColorStop(0.7, 'rgba(255,180,100,0.07)')
    g.addColorStop(1, 'rgba(255,160,60,0)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeStreakTexture(night: boolean) {
  const w = 512
  const h = 64
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, w, 0)
  if (night) {
    g.addColorStop(0, 'rgba(180,210,255,0)')
    g.addColorStop(0.45, 'rgba(210,230,255,0.35)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.7)')
    g.addColorStop(0.55, 'rgba(210,230,255,0.35)')
    g.addColorStop(1, 'rgba(180,210,255,0)')
  } else {
    g.addColorStop(0, 'rgba(255,220,160,0)')
    g.addColorStop(0.45, 'rgba(255,240,200,0.55)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.55, 'rgba(255,240,200,0.55)')
    g.addColorStop(1, 'rgba(255,220,160,0)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const mask = ctx.createLinearGradient(0, 0, 0, h)
  mask.addColorStop(0, 'rgba(0,0,0,0)')
  mask.addColorStop(0.5, 'rgba(0,0,0,1)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function AdditiveSprite({
  map,
  scale,
  color,
  opacity,
  renderOrder,
  rotationZ = 0,
}: {
  map: THREE.Texture
  scale: [number, number]
  color: string
  opacity: number
  renderOrder: number
  rotationZ?: number
}) {
  return (
    <Billboard follow>
      <mesh
        renderOrder={renderOrder}
        scale={[scale[0], scale[1], 1]}
        rotation={[0, 0, rotationZ]}
        frustumCulled={false}
      >
        <planeGeometry />
        <meshBasicMaterial
          map={map}
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </Billboard>
  )
}

type SpriteLayer = {
  map: 'glow' | 'streak'
  scale: [number, number]
  color: string
  opacity: number
  renderOrder: number
  rotationZ?: number
}

const _celestialWorld = new THREE.Vector3()

/**
 * Sun/moon sits on a fixed WORLD DIRECTION (like a real body at infinity).
 * Each frame: camera.position + SUN_DIR * distance — so as the camera
 * turns along the path, the disc/glow slide across the sky.
 */
function FixedCelestial({ night, layers }: { night: boolean; layers: number }) {
  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.DirectionalLight>(null)
  const glowMap = useMemo(() => makeGlowTexture(night), [night])
  const streakMap = useMemo(() => makeStreakTexture(night), [night])
  const pulse = useRef(0)

  useFrame(({ camera }, delta) => {
    pulse.current += delta * (night ? 0.35 : 0.7)
    _celestialWorld.copy(camera.position).addScaledVector(SUN_DIR, SUN_DISTANCE)
    if (group.current) {
      group.current.position.copy(_celestialWorld)
      group.current.scale.setScalar(1 + Math.sin(pulse.current) * (night ? 0.02 : 0.045))
    }
    if (light.current) {
      light.current.position.copy(_celestialWorld)
      light.current.target.position.copy(camera.position)
      light.current.target.updateMatrixWorld()
    }
  })

  const sprites: SpriteLayer[] = night
    ? [
        { map: 'glow', scale: [90, 90], color: '#f4f7ff', opacity: 0.95, renderOrder: 2506 },
        { map: 'glow', scale: [180, 180], color: '#dce8ff', opacity: 0.7, renderOrder: 2505 },
        { map: 'glow', scale: [360, 360], color: '#a8c0e8', opacity: 0.4, renderOrder: 2503 },
        { map: 'glow', scale: [640, 640], color: '#6a88c0', opacity: 0.22, renderOrder: 2501 },
        { map: 'glow', scale: [980, 980], color: '#405888', opacity: 0.1, renderOrder: 2499 },
        { map: 'streak', scale: [720, 28], color: '#e8f0ff', opacity: 0.22, renderOrder: 2504 },
      ]
    : [
        { map: 'glow', scale: [160, 160], color: '#fff8e8', opacity: 0.95, renderOrder: 2505 },
        { map: 'glow', scale: [320, 320], color: '#ffe8b0', opacity: 0.75, renderOrder: 2504 },
        { map: 'glow', scale: [560, 560], color: '#ffd090', opacity: 0.45, renderOrder: 2502 },
        { map: 'glow', scale: [980, 980], color: '#ffb868', opacity: 0.28, renderOrder: 2500 },
        { map: 'glow', scale: [1500, 1500], color: '#ff9a40', opacity: 0.12, renderOrder: 2498 },
        { map: 'streak', scale: [1100, 56], color: '#fff4dc', opacity: 0.55, renderOrder: 2503 },
        {
          map: 'streak',
          scale: [980, 40],
          color: '#ffe2b0',
          opacity: 0.4,
          renderOrder: 2503,
          rotationZ: Math.PI / 2,
        },
        {
          map: 'streak',
          scale: [720, 28],
          color: '#ffd090',
          opacity: 0.28,
          renderOrder: 2501,
          rotationZ: Math.PI / 5,
        },
      ]

  const visible = sprites.slice(0, Math.max(1, layers))

  return (
    <>
      <directionalLight
        ref={light}
        intensity={night ? 1.15 : 1.85}
        color={night ? '#d4e0f4' : '#fff2d8'}
      >
        <object3D attach="target" />
      </directionalLight>
      <group ref={group} frustumCulled={false} renderOrder={2500}>
        {visible.map((s, i) => (
          <AdditiveSprite
            key={i}
            map={s.map === 'glow' ? glowMap : streakMap}
            scale={s.scale}
            color={s.color}
            opacity={s.opacity}
            renderOrder={s.renderOrder}
            rotationZ={s.rotationZ}
          />
        ))}
      </group>
    </>
  )
}

function StarField({ reducedMotion, count }: { reducedMotion: boolean; count: number }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ camera, invalidate }) => {
    group.current?.position.copy(camera.position)
    if (!reducedMotion && count > 0) invalidate()
  })
  if (count <= 0) return null
  return (
    <group ref={group} frustumCulled={false}>
      <Stars
        radius={1400}
        depth={280}
        count={count}
        factor={5.5}
        saturation={0.15}
        fade
        speed={reducedMotion ? 0 : 0.25}
      />
    </group>
  )
}

function Drift({
  children,
  speed,
  reducedMotion,
}: {
  children: ReactNode
  speed: number
  reducedMotion: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  useFrame((state, delta) => {
    if (!ref.current || reducedMotion) return
    ref.current.position.x += delta * speed
    if (ref.current.position.x > 1600) ref.current.position.x = -1600
    state.invalidate()
  })
  return <group ref={ref}>{children}</group>
}

type CloudDef = {
  seed: number
  segments: number
  bounds: [number, number, number]
  position: [number, number, number]
  volume: number
  smallestVolume: number
  opacity: number
  fade: number
  colorKey: 'hi' | 'mid' | 'low' | 'warm'
  concentrate?: 'random' | 'inside' | 'outside'
  speed: number
  drift?: boolean
}

function SceneClouds({
  reducedMotion,
  night,
  limit,
  maxCount,
  segmentsCap,
}: {
  reducedMotion: boolean
  night: boolean
  limit: number
  maxCount: number
  segmentsCap: number
}) {
  const drift = reducedMotion ? 0 : night ? 0.08 : 0.2
  const colors = {
    hi: night ? '#2a3548' : '#fff8f0',
    mid: night ? '#222c3c' : '#eef3f7',
    low: night ? '#1c2534' : '#dbe6ee',
    warm: night ? '#263244' : '#f5ebe0',
  }
  const opacityScale = night ? 0.55 : 1

  const defs: CloudDef[] = [
    {
      seed: 201,
      segments: 12,
      bounds: [520, 36, 200],
      position: [SUN_POS.x * 0.45, 860, SUN_POS.z * 0.45],
      volume: 32,
      smallestVolume: 7,
      opacity: 0.4,
      fade: 120,
      colorKey: 'hi',
      concentrate: 'random',
      speed: 0.01,
      drift: true,
    },
    {
      seed: 202,
      segments: 11,
      bounds: [380, 30, 150],
      position: [SUN_POS.x * 0.3 - 160, 820, SUN_POS.z * 0.4 + 100],
      volume: 24,
      smallestVolume: 5,
      opacity: 0.32,
      fade: 110,
      colorKey: 'warm',
      concentrate: 'random',
      speed: 0.01,
      drift: true,
    },
    {
      seed: 210,
      segments: 12,
      bounds: [440, 32, 160],
      position: [-200, 880, -1000],
      volume: 26,
      smallestVolume: 6,
      opacity: 0.34,
      fade: 115,
      colorKey: 'mid',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.008,
    },
    {
      seed: 211,
      segments: 11,
      bounds: [360, 28, 140],
      position: [640, 900, -820],
      volume: 22,
      smallestVolume: 5,
      opacity: 0.3,
      fade: 110,
      colorKey: 'mid',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.008,
    },
    {
      seed: 301,
      segments: 13,
      bounds: [240, 75, 400],
      position: [-1320, 180, 280],
      volume: 42,
      smallestVolume: 9,
      opacity: 0.4,
      fade: 80,
      colorKey: 'mid',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 302,
      segments: 11,
      bounds: [200, 65, 300],
      position: [-1280, 210, -160],
      volume: 34,
      smallestVolume: 7,
      opacity: 0.34,
      fade: 75,
      colorKey: 'low',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 310,
      segments: 12,
      bounds: [560, 58, 190],
      position: [100, 160, 760],
      volume: 38,
      smallestVolume: 8,
      opacity: 0.36,
      fade: 75,
      colorKey: 'mid',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 311,
      segments: 11,
      bounds: [400, 50, 160],
      position: [700, 190, 740],
      volume: 30,
      smallestVolume: 6,
      opacity: 0.32,
      fade: 70,
      colorKey: 'low',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 320,
      segments: 11,
      bounds: [480, 55, 180],
      position: [200, 190, -860],
      volume: 32,
      smallestVolume: 7,
      opacity: 0.34,
      fade: 75,
      colorKey: 'mid',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 330,
      segments: 12,
      bounds: [220, 70, 340],
      position: [1580, 170, -280],
      volume: 36,
      smallestVolume: 8,
      opacity: 0.38,
      fade: 75,
      colorKey: 'mid',
      concentrate: 'random',
      speed: drift * 0.5,
    },
    {
      seed: 410,
      segments: 11,
      bounds: [260, 40, 160],
      position: [-200, 190, 760],
      volume: 20,
      smallestVolume: 5,
      opacity: 0.28,
      fade: 65,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.01,
    },
    {
      seed: 411,
      segments: 10,
      bounds: [220, 36, 140],
      position: [580, 185, 680],
      volume: 16,
      smallestVolume: 4,
      opacity: 0.24,
      fade: 60,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.012,
    },
    {
      seed: 420,
      segments: 11,
      bounds: [240, 42, 170],
      position: [480, 180, 20],
      volume: 18,
      smallestVolume: 4,
      opacity: 0.26,
      fade: 60,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.01,
    },
    {
      seed: 421,
      segments: 10,
      bounds: [200, 36, 140],
      position: [300, 195, -200],
      volume: 15,
      smallestVolume: 4,
      opacity: 0.22,
      fade: 55,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.011,
    },
    {
      seed: 430,
      segments: 11,
      bounds: [250, 40, 160],
      position: [1600, 175, -220],
      volume: 18,
      smallestVolume: 4,
      opacity: 0.26,
      fade: 60,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.01,
    },
    {
      seed: 431,
      segments: 10,
      bounds: [210, 34, 140],
      position: [1200, 165, 500],
      volume: 15,
      smallestVolume: 4,
      opacity: 0.22,
      fade: 55,
      colorKey: 'low',
      concentrate: 'random',
      speed: reducedMotion ? 0 : 0.01,
    },
  ]

  const selected = defs.slice(0, maxCount)
  const drifting = selected.filter((d) => d.drift)
  const staticClouds = selected.filter((d) => !d.drift)

  const renderCloud = (d: CloudDef) => (
    <Cloud
      key={d.seed}
      seed={d.seed}
      segments={Math.min(d.segments, segmentsCap)}
      bounds={d.bounds}
      position={d.position}
      volume={d.volume}
      smallestVolume={d.smallestVolume}
      opacity={d.opacity * opacityScale}
      fade={d.fade}
      color={colors[d.colorKey]}
      concentrate={d.concentrate}
      speed={d.speed}
    />
  )

  return (
    <Clouds material={CloudMaterial} limit={limit} range={55} frustumCulled={false}>
      {drifting.length > 0 ? (
        <Drift speed={drift} reducedMotion={reducedMotion}>
          {drifting.map(renderCloud)}
        </Drift>
      ) : null}
      {staticClouds.map(renderCloud)}
    </Clouds>
  )
}

export function Atmosphere({
  reducedMotion,
  theme,
  quality,
}: {
  reducedMotion: boolean
  theme: Theme
  quality: QualitySettings
}) {
  const night = theme === 'dark'
  const sky = themeSky[theme]

  return (
    <>
      <fogExp2
        key={theme}
        attach="fog"
        args={[night ? FOG_COLOR_NIGHT : FOG_COLOR, night ? FOG_DENSITY_NIGHT : FOG_DENSITY]}
      />

      {quality.environment ? (
        <Environment
          key={theme}
          files={`${import.meta.env.BASE_URL}sky.jpg`}
          environmentIntensity={sky.envIntensity}
        />
      ) : null}

      {night ? (
        <>
          <ambientLight intensity={0.28} color="#9aacc8" />
          <hemisphereLight args={['#4a6088', '#1a222c', 0.62]} />
          <StarField reducedMotion={reducedMotion} count={quality.stars} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.34} color="#d8e6f0" />
          <hemisphereLight args={['#a8c8de', '#5f6b4e', 0.58]} />
        </>
      )}

      <FixedCelestial night={night} layers={quality.celestialLayers} />
      <SceneClouds
        reducedMotion={reducedMotion}
        night={night}
        limit={quality.cloudLimit}
        maxCount={quality.cloudMaxCount}
        segmentsCap={quality.cloudSegments}
      />
    </>
  )
}
