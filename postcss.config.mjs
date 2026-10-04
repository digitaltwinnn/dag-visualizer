import { join } from "node:path";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // Dev only: stamps the compiled globals.css with its source's hash (see the plugin's header).
    // ABSOLUTE: Turbopack resolves plugin names from its own build chunks, so a "./" path misses.
    [join(process.cwd(), "postcss/cssStamp.mjs")]: {},
  },
};
export default config;
