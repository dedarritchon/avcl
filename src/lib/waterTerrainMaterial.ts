import * as THREE from 'three'

/**
 * Terrain albedo polish:
 * - Mute teal satellite paint only on high slopes (false "lakes" on peaks)
 * - Sharper sampling (negative LOD bias) + mild contrast/unsharp so rock reads clearer
 *   against the soft 2K satellite map stretched over the whole park
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

vec3 sharpenAlbedo(sampler2D map, vec2 uv, vec3 color) {
  // Prefer a sharper mip level — satellite DEM maps blur quickly with trilinear
  vec3 sharpSample = texture(map, uv, -0.85).rgb;
  vec2 texel = 1.0 / vec2(textureSize(map, 0));
  vec3 blur =
    texture(map, uv + vec2( texel.x, 0.0), -0.85).rgb +
    texture(map, uv + vec2(-texel.x, 0.0), -0.85).rgb +
    texture(map, uv + vec2(0.0,  texel.y), -0.85).rgb +
    texture(map, uv + vec2(0.0, -texel.y), -0.85).rgb;
  blur *= 0.25;
  vec3 unsharp = sharpSample + (sharpSample - blur) * 0.55;
  // Slight contrast — rock faces / snow edges read closer to a photo
  unsharp = (unsharp - 0.5) * 1.12 + 0.5;
  return mix(color, clamp(unsharp, 0.0, 1.0), 0.85);
}
`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  diffuseColor.rgb = sharpenAlbedo(map, vMapUv, diffuseColor.rgb);

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

  material.customProgramCacheKey = () => 'terrain-sharpen-v2'
  material.needsUpdate = true
}

export function configureTerrainMap(map: THREE.Texture, maxAnisotropy = 16) {
  map.colorSpace = THREE.SRGBColorSpace
  map.generateMipmaps = true
  map.minFilter = THREE.LinearMipmapLinearFilter
  map.magFilter = THREE.LinearFilter
  // Cap anisotropy — 16x is rarely worth the bandwidth on this stretched DEM map
  map.anisotropy = Math.min(8, Math.max(2, maxAnisotropy))
  map.needsUpdate = true
}
