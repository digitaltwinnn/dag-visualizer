// `topojson-client` ships no types. Typed loosely — just enough for GlobeSurface's use of
// `feature()` to convert a TopoJSON topology object into GeoJSON-ish features.
declare module "topojson-client" {
  export function feature(
    topology: unknown,
    object: unknown,
  ): { features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> };
}
