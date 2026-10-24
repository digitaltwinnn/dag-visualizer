import * as THREE from "three";
import { R, LAND_H } from "../domain/geoLayout";

// EXACT OCCLUSION BY THE GLOBE — ONE HOME (review, 2026-10-24: the six-line segment-to-sphere test
// was written three times, with its rim numbers split across two files). The hologram globe is
// additive and never writes depth, so nothing behind it is depth-occluded; a hemisphere "facing"
// fade is wrong for a mark that lies OUTSIDE the sphere — a point on the far side is in plain view
// beside the silhouette. So a fragment asks the exact question: does the line of sight from the eye
// to this fragment pass through the plateau sphere? The closest approach of that segment to the
// globe's centre (the origin of the frame the eye is given in) against the plateau radius, smoothed
// over a short rim so a mark crossing the limb never pops, is the fragment's alpha factor.
// Users: the base rings (world space, through `hookOcclusion` on a stock material) and the packet
// arcs' trail and head shaders (group-local, through `occlusionGlsl` in their own GLSL).

/** The occluding body: the globe's plateau radius, with a soft rim either side. */
export const OCCLUDER_R = R + LAND_H;
export const OCCLUDER_SOFT_IN = 0.9;
export const OCCLUDER_SOFT_OUT = 0.4;

/** The test as a GLSL statement block: reads the eye position `cam` and the fragment position `pos`
 *  (both in one frame whose origin is the globe's centre), writes the alpha factor into `out`,
 *  which the caller must have declared as a float. */
export function occlusionGlsl(cam: string, pos: string, out: string): string {
  return `{
    vec3 d = ${pos} - ${cam};
    float L = length(d);
    vec3 dir = d / max(L, 1e-5);
    float t = clamp(dot(-${cam}, dir), 0.0, L);
    float dist = length(${cam} + dir * t);
    ${out} = smoothstep(${(OCCLUDER_R - OCCLUDER_SOFT_IN).toFixed(2)}, ${(OCCLUDER_R + OCCLUDER_SOFT_OUT).toFixed(2)}, dist);
  }`;
}

/** The same test hooked into a stock three material (world space): one uniform, the camera's world
 *  position, which the owner copies per frame into `uCam`. */
export function hookOcclusion(mat: THREE.Material, uCam: THREE.Vector3): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = { value: uCam };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "varying vec3 vWorld;\n#include <common>")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "uniform vec3 uCam; varying vec3 vWorld;\n#include <common>")
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
{
  float occl;
  ${occlusionGlsl("uCam", "vWorld", "occl")}
  diffuseColor.a *= occl;
}`,
      );
  };
  mat.customProgramCacheKey = () => "globe-occluded";
}
