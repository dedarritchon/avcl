import * as THREE from 'three'

/**
 * Mute teal satellite paint only on high slopes (false "lakes" on peaks).
 * Leaves real valley water textures alone.
 */
export function applyMutePeakWaterShader(material: THREE.MeshStandardMaterial) {
  if (material.userData.peakWaterMuted) return
  material.userData.peakWaterMuted = true

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPeakWorldPos;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vPeakWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPeakWorldPos;

float tealMask(vec3 c) {
  float avg = (c.r + c.g + c.b) * 0.333333;
  float cool = max(0.0, (c.g + c.b) * 0.5 - c.r);
  float notSnow = 1.0 - smoothstep(0.78, 0.92, avg);
  float mid = smoothstep(0.2, 0.35, avg) * (1.0 - smoothstep(0.65, 0.8, avg));
  return clamp(smoothstep(0.04, 0.14, cool) * notSnow * mid, 0.0, 1.0);
}
`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float m = tealMask(diffuseColor.rgb);
  // Only high elevations — peak false-water, not valley lakes
  float high = smoothstep(130.0, 170.0, vPeakWorldPos.y);
  if (m > 0.02 && high > 0.05) {
    vec3 rock = mix(diffuseColor.rgb, vec3(0.45, 0.46, 0.44), 0.65);
    diffuseColor.rgb = mix(diffuseColor.rgb, rock, m * high);
  }
}
`,
      )
  }

  material.customProgramCacheKey = () => 'mute-peak-water-v1'
  material.needsUpdate = true
}

export function configureTerrainMap(map: THREE.Texture, maxAnisotropy = 16) {
  map.colorSpace = THREE.SRGBColorSpace
  map.generateMipmaps = true
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  map.anisotropy = maxAnisotropy
  map.needsUpdate = true
}
