import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cssSourceStamp } from "@/postcss/cssSourceStamp.mjs";

// DEV ONLY: the stamp of app/globals.css as it is ON DISK, for DevCssCanary to compare with the
// stamp the served stylesheet carries (postcss/cssStamp.mjs). Production answers 404.
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const text = await readFile(join(process.cwd(), "app/globals.css"), "utf8");
  return Response.json({ stamp: cssSourceStamp(text) }, { headers: { "Cache-Control": "no-store" } });
}
