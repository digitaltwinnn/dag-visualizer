// THE CSS STAMP (dev only, 2026-10-04). Turbopack can serve a STALE compile of app/globals.css —
// within one server and across restarts (CLAUDE.md, the stale-CSS trap; it cost a restart four
// times in one session). This plugin writes the hash of the SOURCE a compile was built from into
// the compiled sheet as `--css-stamp`, and DevCssCanary compares it with the hash of the file on
// disk (/api/dev/css-stamp): a mismatch is a stale compile, said out loud, before anyone debugs a
// cascade that is not there. Same hash on both sides: `cssSourceStamp` in ./cssSourceStamp.mjs.
import { cssSourceStamp } from "./cssSourceStamp.mjs";

const plugin = () => ({
  postcssPlugin: "css-stamp",
  Once(root) {
    if (process.env.NODE_ENV === "production") return;
    const input = root.source?.input;
    if (!input?.file?.replace(/\\/g, "/").endsWith("app/globals.css")) return;
    root.append(`:root{--css-stamp:"${cssSourceStamp(input.css)}"}`);
  },
});
plugin.postcss = true;
export default plugin;
