import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invalidate, useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { sampleHeight } from '../lib/heightmap'
import {
  CAMERA_PATH_KEYFRAMES,
  type CameraKeyframe,
} from '../lib/cameraPath'

export type EditorWaypoint = {
  id: string
  position: [number, number, number]
  lookAt: [number, number, number]
}

type Props = {
  waypoints: EditorWaypoint[]
  onChange: (next: EditorWaypoint[]) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
}

const _hit = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _right = new THREE.Vector3()
const _wish = new THREE.Vector3()

function Markers({
  waypoints,
  selectedId,
  onSelect,
  onFlyTo,
}: {
  waypoints: EditorWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  onFlyTo: (wp: EditorWaypoint) => void
}) {
  return (
    <group>
      {waypoints.map((wp, i) => {
        const selected = wp.id === selectedId
        return (
          <group key={wp.id}>
            <mesh
              position={wp.position}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(wp.id)
                onFlyTo(wp)
              }}
            >
              <sphereGeometry args={[selected ? 18 : 12, 16, 16]} />
              <meshBasicMaterial color={selected ? '#ff6b2c' : '#ffe08a'} depthTest={false} />
            </mesh>
            <Html position={[wp.position[0], wp.position[1] + 28, wp.position[2]]} center>
              <div className="edit-marker-label">{i + 1}</div>
            </Html>
            <Line
              points={[wp.position, wp.lookAt]}
              color={selected ? '#ff6b2c' : '#9ec9ff'}
              lineWidth={1}
              transparent
              opacity={0.7}
            />
            <mesh position={wp.lookAt}>
              <sphereGeometry args={[8, 12, 12]} />
              <meshBasicMaterial color={selected ? '#ff9a6b' : '#7eb6ff'} depthTest={false} />
            </mesh>
          </group>
        )
      })}
      {waypoints.length > 1 ? (
        <Line
          points={waypoints.map((w) => w.position)}
          color="#ffffff"
          lineWidth={1.5}
          transparent
          opacity={0.45}
        />
      ) : null}
    </group>
  )
}

/**
 * Unconstrained free-fly: left/right-drag look, scroll dolly, WASD + Q/E move.
 * No polar-angle / min-distance limits — full ground-level freedom.
 */
function FreeFlyControls() {
  const { camera, gl } = useThree()
  const keys = useRef(new Set<string>())
  const looking = useRef(false)
  const yaw = useRef(0)
  const pitch = useRef(0)
  const speed = useRef(180)
  const primed = useRef(false)
  const dolly = useRef(0)

  const syncFromCamera = useCallback(() => {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ')
    yaw.current = e.y
    pitch.current = e.x
  }, [camera])

  useEffect(() => {
    if (primed.current) return
    primed.current = true
    syncFromCamera()
  }, [syncFromCamera])

  useEffect(() => {
    const onGoto = () => syncFromCamera()
    window.addEventListener('path-editor-goto', onGoto)
    return () => window.removeEventListener('path-editor-goto', onGoto)
  }, [syncFromCamera])

  useEffect(() => {
    const el = gl.domElement
    el.style.cursor = 'grab'
    el.tabIndex = 0

    const startLook = (e: PointerEvent) => {
      // Left or right button — trackpads rarely expose a reliable right-drag
      if (e.button !== 0 && e.button !== 2) return
      looking.current = true
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
      el.focus({ preventScroll: true })
    }
    const endLook = (e: PointerEvent) => {
      if (!looking.current) return
      if (e.type === 'pointerup' && e.button !== 0 && e.button !== 2) return
      looking.current = false
      el.style.cursor = 'grab'
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    const move = (e: PointerEvent) => {
      if (!looking.current) return
      yaw.current -= e.movementX * 0.0024
      pitch.current -= e.movementY * 0.0024
      pitch.current = Math.max(-1.55, Math.min(1.55, pitch.current))
      invalidate()
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.shiftKey) {
        const factor = e.deltaY > 0 ? 0.88 : 1.14
        speed.current = Math.min(2000, Math.max(8, speed.current * factor))
        return
      }
      // Scroll = dolly along look direction (zoom feel)
      const step = Math.min(140, Math.max(12, speed.current * 0.22))
      dolly.current += (e.deltaY > 0 ? -1 : 1) * step
      invalidate()
    }
    const keyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code)
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        e.preventDefault()
      }
      invalidate()
    }
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.code)
    const context = (e: Event) => e.preventDefault()

    el.addEventListener('pointerdown', startLook)
    el.addEventListener('pointerup', endLook)
    el.addEventListener('pointercancel', endLook)
    el.addEventListener('pointermove', move)
    el.addEventListener('lostpointercapture', endLook)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', context)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)

    return () => {
      el.removeEventListener('pointerdown', startLook)
      el.removeEventListener('pointerup', endLook)
      el.removeEventListener('pointercancel', endLook)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('lostpointercapture', endLook)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', context)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      el.style.cursor = ''
    }
  }, [gl])

  useFrame(({ invalidate }, delta) => {
    const dt = Math.min(delta, 0.05)
    camera.rotation.order = 'YXZ'
    camera.rotation.y = yaw.current
    camera.rotation.x = pitch.current
    camera.rotation.z = 0

    let busy = false

    if (dolly.current !== 0) {
      camera.getWorldDirection(_fwd)
      camera.position.addScaledVector(_fwd, dolly.current)
      dolly.current = 0
      busy = true
    }

    const k = keys.current
    _wish.set(0, 0, 0)
    camera.getWorldDirection(_fwd)
    _fwd.y = 0
    if (_fwd.lengthSq() > 1e-6) _fwd.normalize()
    else _fwd.set(0, 0, -1)
    _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize()

    if (k.has('KeyW')) _wish.add(_fwd)
    if (k.has('KeyS')) _wish.sub(_fwd)
    if (k.has('KeyD')) _wish.add(_right)
    if (k.has('KeyA')) _wish.sub(_right)
    if (k.has('KeyE') || k.has('Space')) _wish.y += 1
    if (k.has('KeyQ') || k.has('ControlLeft') || k.has('ControlRight')) _wish.y -= 1

    if (_wish.lengthSq() > 0) {
      _wish.normalize()
      const sprint = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.2 : 1
      camera.position.addScaledVector(_wish, speed.current * sprint * dt)
      busy = true
    }

    ;(gl.domElement as HTMLElement).dataset.flySpeed = String(Math.round(speed.current))
    if (busy || k.size > 0) invalidate()
  })

  return null
}

/** Free-fly editor — lives inside the Canvas */
export function PathEditorScene({ waypoints, onChange, selectedId, onSelect }: Props) {
  const { camera, gl, scene } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])

  const flyTo = useCallback(
    (wp: EditorWaypoint) => {
      camera.position.set(...wp.position)
      camera.lookAt(wp.lookAt[0], wp.lookAt[1], wp.lookAt[2])
      camera.rotation.order = 'YXZ'
      window.dispatchEvent(new Event('path-editor-goto'))
      invalidate()
    },
    [camera],
  )

  // Double-click terrain: set look-at of selected waypoint (or face that point)
  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.button !== 0 || event.detail < 2) return
      const rect = gl.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hits = raycaster.intersectObjects(scene.children, true)
      const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh)
      if (!hit) return
      _hit.copy(hit.point)

      if (selectedId) {
        onChange(
          waypoints.map((w) =>
            w.id === selectedId
              ? { ...w, lookAt: [_hit.x, _hit.y, _hit.z] as [number, number, number] }
              : w,
          ),
        )
      } else {
        camera.lookAt(_hit)
        camera.rotation.order = 'YXZ'
        window.dispatchEvent(new Event('path-editor-goto'))
      }
    },
    [camera, gl, onChange, pointer, raycaster, scene, selectedId, waypoints],
  )

  useEffect(() => {
    const el = gl.domElement
    el.addEventListener('pointerdown', onPointerDown)
    return () => el.removeEventListener('pointerdown', onPointerDown)
  }, [gl, onPointerDown])

  return (
    <>
      <FreeFlyControls />
      <Markers
        waypoints={waypoints}
        selectedId={selectedId}
        onSelect={onSelect}
        onFlyTo={flyTo}
      />
    </>
  )
}

type PanelProps = {
  waypoints: EditorWaypoint[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onChange: (next: EditorWaypoint[]) => void
  getView: () => { position: [number, number, number]; lookAt: [number, number, number] } | null
  goToView: (position: [number, number, number], lookAt: [number, number, number]) => void
}

const GROUND_EYE = 8

function keyframesToWaypoints(frames: CameraKeyframe[]): EditorWaypoint[] {
  return frames.map((kf) => ({
    id: crypto.randomUUID(),
    position: [...kf.position] as [number, number, number],
    lookAt: [...kf.lookAt] as [number, number, number],
  }))
}

/** Accepts exported `const KEYFRAMES = [...]` or a bare `[...]` array. */
function parseKeyframesPaste(raw: string): CameraKeyframe[] | null {
  const text = raw.trim()
  if (!text) return null
  try {
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start < 0 || end <= start) return null
    const jsonish = text
      .slice(start, end + 1)
      .replace(/(\w+)\s*:/g, '"$1":')
      .replace(/,\s*([\]}])/g, '$1')
    const parsed = JSON.parse(jsonish) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const frames: CameraKeyframe[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') return null
      const { t, position, lookAt } = item as Record<string, unknown>
      if (
        typeof t !== 'number' ||
        !Array.isArray(position) ||
        !Array.isArray(lookAt) ||
        position.length !== 3 ||
        lookAt.length !== 3 ||
        !position.every((v) => typeof v === 'number') ||
        !lookAt.every((v) => typeof v === 'number')
      ) {
        return null
      }
      frames.push({
        t,
        position: position as [number, number, number],
        lookAt: lookAt as [number, number, number],
      })
    }
    return frames
  } catch {
    return null
  }
}

export function PathEditorPanel({
  waypoints,
  selectedId,
  onSelect,
  onChange,
  getView,
  goToView,
}: PanelProps) {
  const [copied, setCopied] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

  const makeWaypoint = (): EditorWaypoint | null => {
    const view = getView()
    if (!view) return null
    return {
      id: crypto.randomUUID(),
      position: view.position,
      lookAt: view.lookAt,
    }
  }

  const addKeyframe = (where: 'end' | 'start' | 'before' | 'after' = 'end') => {
    const wp = makeWaypoint()
    if (!wp) return
    const next = [...waypoints]
    let index = next.length
    if (where === 'start') index = 0
    else if (where === 'before' || where === 'after') {
      const sel = selectedId ? next.findIndex((w) => w.id === selectedId) : -1
      if (sel < 0) index = where === 'before' ? 0 : next.length
      else index = where === 'before' ? sel : sel + 1
    }
    next.splice(index, 0, wp)
    onChange(next)
    onSelect(wp.id)
  }

  const moveWaypoint = (id: string, delta: -1 | 1) => {
    const i = waypoints.findIndex((w) => w.id === id)
    if (i < 0) return
    const j = i + delta
    if (j < 0 || j >= waypoints.length) return
    const next = [...waypoints]
    const [item] = next.splice(i, 1)
    next.splice(j, 0, item)
    onChange(next)
  }

  const updateSelectedFromView = () => {
    if (!selectedId) return
    const view = getView()
    if (!view) return
    onChange(waypoints.map((w) => (w.id === selectedId ? { ...w, ...view } : w)))
  }

  const flyToSelected = () => {
    const wp = waypoints.find((w) => w.id === selectedId)
    if (!wp) return
    goToView(wp.position, wp.lookAt)
  }

  const dropToGround = () => {
    const view = getView()
    if (!view) return
    const [x, , z] = view.position
    const y = sampleHeight(x, z, 3) + GROUND_EYE
    goToView([x, y, z], view.lookAt)
  }

  const removeSelected = () => {
    if (!selectedId) return
    onChange(waypoints.filter((w) => w.id !== selectedId))
    onSelect(null)
  }

  const clearAll = () => {
    onChange([])
    onSelect(null)
  }

  const exportTs = () => {
    const n = Math.max(1, waypoints.length - 1)
    const body = waypoints
      .map((w, i) => {
        const t = waypoints.length === 1 ? 0 : i / n
        const p = w.position.map((v) => Math.round(v))
        const l = w.lookAt.map((v) => Math.round(v))
        return `  {\n    t: ${t.toFixed(2)},\n    position: [${p.join(', ')}],\n    lookAt: [${l.join(', ')}],\n  },`
      })
      .join('\n')
    const text = `const KEYFRAMES = [\n${body}\n]`
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  const applyKeyframes = (frames: CameraKeyframe[]) => {
    const next = keyframesToWaypoints(frames)
    onChange(next)
    onSelect(next[0]?.id ?? null)
    setImportError(null)
    setImportText('')
    setImportOpen(false)
  }

  const loadShippedPath = () => {
    if (
      waypoints.length > 0 &&
      !window.confirm('Replace current waypoints with the shipped cameraPath?')
    ) {
      return
    }
    applyKeyframes(CAMERA_PATH_KEYFRAMES)
  }

  const importPaste = () => {
    const frames = parseKeyframesPaste(importText)
    if (!frames) {
      setImportError('Could not parse KEYFRAMES — paste the exported array.')
      return
    }
    if (
      waypoints.length > 0 &&
      !window.confirm(`Replace current waypoints with ${frames.length} imported points?`)
    ) {
      return
    }
    applyKeyframes(frames)
  }

  return (
    <aside className="path-editor">
      <header className="path-editor__head">
        <h1>Path editor</h1>
        <p>
          <strong>Drag</strong> look · <strong>scroll</strong> zoom · <strong>WASD</strong> move ·{' '}
          <strong>Q/E</strong> down/up · <strong>Shift</strong> sprint · <strong>Shift+scroll</strong>{' '}
          speed.
          <br />
          Double-click terrain to aim.
        </p>
      </header>

      <div className="path-editor__actions">
        <button type="button" onClick={() => addKeyframe('end')}>
          + Save at end
        </button>
        <button type="button" onClick={() => addKeyframe('start')}>
          + Insert at start
        </button>
        <button type="button" onClick={() => addKeyframe('before')} disabled={!selectedId}>
          + Insert before selected
        </button>
        <button type="button" onClick={() => addKeyframe('after')} disabled={!selectedId}>
          + Insert after selected
        </button>
        <button type="button" onClick={dropToGround}>
          Drop to ground
        </button>
        <button type="button" onClick={updateSelectedFromView} disabled={!selectedId}>
          Update selected from view
        </button>
        <button type="button" onClick={flyToSelected} disabled={!selectedId}>
          Fly to selected
        </button>
        <button type="button" onClick={removeSelected} disabled={!selectedId}>
          Delete selected
        </button>
        <button type="button" onClick={clearAll} disabled={waypoints.length === 0}>
          Clear all
        </button>
        <button
          type="button"
          className="path-editor__export"
          onClick={exportTs}
          disabled={waypoints.length === 0}
        >
          {copied ? 'Copied!' : 'Copy KEYFRAMES'}
        </button>
        <button type="button" className="path-editor__import" onClick={loadShippedPath}>
          Load shipped cameraPath
        </button>
        <button
          type="button"
          className="path-editor__import"
          onClick={() => {
            setImportOpen((v) => !v)
            setImportError(null)
          }}
        >
          {importOpen ? 'Hide paste import' : 'Paste KEYFRAMES…'}
        </button>
      </div>

      {importOpen ? (
        <div className="path-editor__paste">
          <textarea
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value)
              setImportError(null)
            }}
            placeholder="Paste const KEYFRAMES = [ ... ] here"
            rows={7}
            spellCheck={false}
          />
          {importError ? <p className="path-editor__paste-error">{importError}</p> : null}
          <button type="button" onClick={importPaste} disabled={!importText.trim()}>
            Import pasted path
          </button>
        </div>
      ) : null}

      <ol className="path-editor__list">
        {waypoints.length === 0 ? (
          <li className="path-editor__empty">No points yet — fly to a view and save it.</li>
        ) : (
          waypoints.map((w, i) => (
            <li key={w.id} className="path-editor__row">
              <button
                type="button"
                className={w.id === selectedId ? 'is-selected' : undefined}
                onClick={() => {
                  onSelect(w.id)
                  goToView(w.position, w.lookAt)
                }}
              >
                <strong>#{i + 1}</strong>
                <span>
                  pos [{w.position.map((v) => Math.round(v)).join(', ')}]
                  <br />
                  look [{w.lookAt.map((v) => Math.round(v)).join(', ')}]
                </span>
              </button>
              <div className="path-editor__order">
                <button
                  type="button"
                  aria-label={`Move #${i + 1} earlier`}
                  disabled={i === 0}
                  onClick={() => moveWaypoint(w.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move #${i + 1} later`}
                  disabled={i === waypoints.length - 1}
                  onClick={() => moveWaypoint(w.id, 1)}
                >
                  ↓
                </button>
              </div>
            </li>
          ))
        )}
      </ol>

      <p className="path-editor__hint">
        Open with <code>?edit=1</code> · <strong>Load shipped cameraPath</strong> restores{' '}
        <code>src/lib/cameraPath.ts</code> if localStorage was cleared · Copy / Paste KEYFRAMES to
        sync edits.
      </p>
    </aside>
  )
}
