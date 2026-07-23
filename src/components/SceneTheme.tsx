import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Theme } from '../lib/theme'
import { makeSkyTexture, themeSky } from '../lib/theme'

/** Keeps WebGL clear color, exposure, and scene sky in sync with day/night. */
export function SceneTheme({ theme }: { theme: Theme }) {
  const { scene, gl, invalidate } = useThree()

  useEffect(() => {
    const sky = makeSkyTexture(theme)
    const prev = scene.background
    scene.background = sky
    const cfg = themeSky[theme]
    gl.setClearColor(cfg.clear, 1)
    gl.toneMappingExposure = cfg.exposure
    invalidate()

    return () => {
      if (scene.background === sky) scene.background = null
      sky.dispose()
      if (prev instanceof THREE.Texture && prev !== sky) prev.dispose()
    }
  }, [theme, scene, gl, invalidate])

  return null
}
