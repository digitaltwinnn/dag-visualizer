// IP geolocation: loads the baked cache shipped with the app, and (best effort)
// resolves any validators not in the cache at runtime. Results are remembered
// in localStorage so the globe fills in over time.

const LS_KEY = "dag-geo-cache-v1";

export async function loadGeoCache() {
  const map = {};
  // baked cache (covers the current validator set)
  try {
    const res = await fetch("./data/geo.json");
    if (res.ok) Object.assign(map, await res.json());
  } catch (e) { /* ignore */ }
  // anything resolved on previous visits
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    Object.assign(map, saved);
  } catch (e) { /* ignore */ }
  return map;
}

function persist(map, additions) {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    Object.assign(saved, additions);
    localStorage.setItem(LS_KEY, JSON.stringify(saved));
  } catch (e) { /* ignore */ }
  Object.assign(map, additions);
}

// Resolve IPs missing from the cache. Uses ip-api batch when the page is served
// over http (local dev); otherwise falls back to the HTTPS ipwho.is endpoint so
// it still works when the site is hosted. Calls onResolved(map) as data arrives.
export async function resolveMissing(map, ips, onResolved) {
  const missing = ips.filter((ip) => ip && !map[ip]);
  if (!missing.length) return;
  const isHttps = location.protocol === "https:";

  // Try the fast batch path first (http only).
  if (!isHttps) {
    try {
      const found = {};
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const res = await fetch("http://ip-api.com/batch?fields=status,country,countryCode,city,lat,lon,query", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chunk),
        });
        const arr = await res.json();
        for (const e of arr) {
          if (e.status === "success") found[e.query] = { lat: e.lat, lon: e.lon, city: e.city || "", country: e.country || "", cc: e.countryCode || "" };
        }
      }
      if (Object.keys(found).length) { persist(map, found); onResolved(map); return; }
    } catch (e) { /* fall through to https path */ }
  }

  // HTTPS per-IP fallback, capped so we never hammer the service.
  const found = {};
  for (const ip of missing.slice(0, 60)) {
    try {
      const res = await fetch(`https://ipwho.is/${ip}`);
      const d = await res.json();
      if (d && d.success !== false && d.latitude != null) {
        found[ip] = { lat: d.latitude, lon: d.longitude, city: d.city || "", country: d.country || "", cc: d.country_code || "" };
      }
    } catch (e) { /* skip */ }
  }
  if (Object.keys(found).length) { persist(map, found); onResolved(map); }
}
