import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Canvas, invalidate } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents } from '@react-three/drei'
import * as THREE from 'three'
import { TerrainExperience } from './components/TerrainExperience'
import { ScrollNarrative } from './components/ScrollNarrative'
import { Loader } from './components/Loader'
import type { EditorWaypoint } from './components/PathEditor'
import { useScrollProgress } from './hooks/useScrollProgress'
import { useLocale } from './hooks/useLocale'
import { useTheme } from './hooks/useTheme'
import {
  useQuality,
  useReportFps,
  QualityProvider,
  QualityFpsProbe,
} from './hooks/useQuality'
import { makeSkyTexture, themeSky } from './lib/theme'

const PathEditorPanel = lazy(() =>
  import('./components/PathEditor').then((m) => ({ default: m.PathEditorPanel })),
)

const STORAGE_KEY = 'varela-path-editor-v1'

function useEditMode() {
  const [editMode, setEditMode] = useState(
    () => new URLSearchParams(window.location.search).has('edit'),
  )

  useEffect(() => {
    const sync = () => setEditMode(new URLSearchParams(window.location.search).has('edit'))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return editMode
}

function loadWaypoints(): EditorWaypoint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as EditorWaypoint[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function AppShell() {
  const { progress, progressRef } = useScrollProgress(() => invalidate())
  const { locale, setLocale } = useLocale()
  const { theme, setTheme } = useTheme()
  const quality = useQuality()
  const reportFps = useReportFps()
  const [ready, setReady] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const editMode = useEditMode()
  const [waypoints, setWaypoints] = useState<EditorWaypoint[]>(loadWaypoints)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const viewApiRef = useRef<{
    getView: () => {
      position: [number, number, number]
      lookAt: [number, number, number]
    }
    goToView: (
      position: [number, number, number],
      lookAt: [number, number, number],
    ) => void
  } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!editMode) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(waypoints))
  }, [editMode, waypoints])

  useEffect(() => {
    invalidate()
  }, [theme, editMode, quality.tier])

  const getView = useCallback(() => viewApiRef.current?.getView() ?? null, [])
  const goToView = useCallback(
    (position: [number, number, number], lookAt: [number, number, number]) => {
      viewApiRef.current?.goToView(position, lookAt)
      invalidate()
    },
    [],
  )

  return (
    <div className={`app${editMode ? ' app--edit' : ''}`} data-theme={theme}>
      <div className="canvas-wrap" aria-hidden={!ready}>
        <Canvas
          dpr={[1, quality.dprMax]}
          frameloop="demand"
          gl={{
            antialias: quality.antialias,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          camera={{
            fov: 48,
            near: 1,
            far: quality.cameraFar,
            position: [-1041, 124, 790],
          }}
          performance={{ min: 0.5 }}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            const cfg = themeSky[theme]
            gl.toneMappingExposure = cfg.exposure
            // Opaque sky gradient — no transparent holes / white voids at DEM edges
            scene.background = makeSkyTexture(theme)
            gl.setClearColor(cfg.clear, 1)
            invalidate()
          }}
        >
          <AdaptiveDpr pixelated />
          <AdaptiveEvents />
          <QualityFpsProbe onReport={reportFps} />
          <Suspense fallback={null}>
            <TerrainExperience
              progressRef={progressRef}
              reducedMotion={reducedMotion}
              theme={theme}
              quality={quality}
              onReady={() => setReady(true)}
              editMode={editMode}
              waypoints={waypoints}
              onWaypointsChange={setWaypoints}
              selectedId={selectedId}
              onSelectWaypoint={setSelectedId}
              viewApiRef={viewApiRef}
            />
          </Suspense>
        </Canvas>
      </div>

      <Loader visible={!ready} locale={locale} />

      {editMode ? (
        <Suspense fallback={null}>
          <PathEditorPanel
            waypoints={waypoints}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setWaypoints}
            getView={getView}
            goToView={goToView}
          />
        </Suspense>
      ) : (
        <ScrollNarrative
          progress={progress}
          locale={locale}
          onLocaleChange={setLocale}
          theme={theme}
          onThemeChange={setTheme}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <QualityProvider>
      <AppShell />
    </QualityProvider>
  )
}
