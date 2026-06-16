#!/usr/bin/env python3
"""Bake an IP -> geolocation cache for the current Constellation validator set.

Fetches the live Global L0 and DAG L1 clusters, collects the unique validator
IPs, geolocates them via ip-api.com (free batch endpoint), and writes the result
to data/geo.json. The web app loads that file so the globe view works instantly
and offline.

Usage:  python3 scripts/bake-geo.py
"""
import json
import os
import time
import urllib.request

L0 = "https://l0-lb-mainnet.constellationnetwork.io/cluster/info"
L1 = "https://l1-lb-mainnet.constellationnetwork.io/cluster/info"
FIELDS = "status,country,countryCode,city,lat,lon,query"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "geo.json")


def get(url):
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.load(r)


def batch_geo(ips):
    out = {}
    for i in range(0, len(ips), 100):
        chunk = ips[i:i + 100]
        req = urllib.request.Request(
            f"http://ip-api.com/batch?fields={FIELDS}",
            data=json.dumps(chunk).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            for e in json.load(r):
                if e.get("status") == "success":
                    out[e["query"]] = {
                        "lat": e["lat"], "lon": e["lon"],
                        "city": e.get("city", ""), "country": e.get("country", ""),
                        "cc": e.get("countryCode", ""),
                    }
        time.sleep(1.4)  # stay under the free rate limit (45 req/min)
    return out


def main():
    nodes = get(L0) + get(L1)
    ips = sorted({n["ip"] for n in nodes if n.get("ip")})
    print(f"unique validator IPs: {len(ips)}")
    geo = batch_geo(ips)
    print(f"geolocated: {len(geo)}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(geo, f, separators=(",", ":"))
    print(f"wrote {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
