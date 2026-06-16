#!/usr/bin/env python3
"""Bake the real mainnet metagraphs and their validator nodes.

The block-explorer API doesn't expose metagraph node locations directly, but the
dagexplorer API lists every mainnet metagraph and its own L0/L1 load balancers.
Each metagraph runs its own cluster, so `<lb>/cluster/info` returns its nodes
(with IPs) exactly like the Global L0 / DAG L1 clusters.

This script:
  1. lists all mainnet metagraphs,
  2. reads each metagraph's L0 / cL1 / dL1 cluster nodes,
  3. geolocates every IP (ip-api.com batch), merging into data/geo.json,
  4. writes data/metagraphs.json describing each metagraph and its nodes.

The web app loads metagraphs.json so the geography view can plot metagraph nodes
and filter by metagraph — instantly and offline.

Usage:  python3 scripts/bake-metagraphs.py
"""
import json
import os
import subprocess
import time
import urllib.request

API = "https://production.dagexplorer-api.constellationnetwork.net/mainnet"
FIELDS = "status,country,countryCode,city,lat,lon,query"
HERE = os.path.dirname(__file__)
OUT_META = os.path.join(HERE, "..", "data", "metagraphs.json")
OUT_GEO = os.path.join(HERE, "..", "data", "geo.json")

# Each metagraph runs its own L0 plus currency-L1 (cl1) and/or data-L1 (dl1)
# cluster. A single node often serves several of these roles, so we record every
# role a node has (`roles`) and assign one "primary" layer for layout by probing
# in this priority order: l0 first (consensus / inner shell), then dl1, then cl1
# last — currency-L1 is rarely a standalone node, so it sits on the outer shell
# and is usually empty (no gap in between).
LAYERS = [("l0", "l0"), ("dl1", "dl1"), ("cl1", "cl1")]


def get(url, timeout=15):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "dag-visualizer-bake"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        # Some cluster hosts only resolve/route via the system curl in restricted
        # environments — fall back to it so the bake still works there.
        out = subprocess.run(
            ["curl", "-s", "--max-time", str(timeout),
             "-H", "User-Agent: dag-visualizer-bake", url],
            capture_output=True, text=True,
        )
        return json.loads(out.stdout)


def list_metagraphs():
    data = get(f"{API}/metagraphs?limit=100").get("data", [])
    return data


def metagraph_urls(mid):
    d = get(f"{API}/metagraphs/{mid}?v=v2").get("data", {})
    return d.get("urls") or {}


def cluster_nodes(base_url):
    """Return [{ip, state}] for a metagraph cluster load balancer, or []."""
    url = base_url.rstrip("/") + "/cluster/info"
    try:
        nodes = get(url, timeout=12)
    except Exception as e:
        print(f"    ! {url}: {e}")
        return []
    out = []
    for n in nodes if isinstance(nodes, list) else []:
        ip = n.get("ip")
        if ip:
            out.append({"ip": ip, "state": n.get("state", "Unknown")})
    return out


def batch_geo(ips):
    out = {}
    ips = sorted(ips)
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
    metagraphs = list_metagraphs()
    print(f"metagraphs: {len(metagraphs)}")

    baked = []
    all_ips = set()
    for m in metagraphs:
        mid = m.get("id")
        name = m.get("name") or mid
        sym = m.get("symbol") or ""
        if not mid:
            continue
        print(f"- {name} ({sym})")
        try:
            urls = metagraph_urls(mid)
        except Exception as e:
            print(f"    ! detail failed: {e}")
            urls = {}

        # A node can appear in several clusters; record every role it has and keep
        # the first (highest-priority) layer as its primary one for layout.
        primary, roles, state_of = {}, {}, {}
        for key, layer in LAYERS:
            base = urls.get(key)
            if not base:
                continue
            for n in cluster_nodes(base):
                ip = n["ip"]
                roles.setdefault(ip, []).append(layer)
                if ip not in primary:
                    primary[ip] = layer
                    state_of[ip] = n["state"]
                    all_ips.add(ip)
            time.sleep(0.2)
        nodes = [
            {"ip": ip, "state": state_of[ip], "layer": primary[ip], "roles": roles[ip]}
            for ip in primary
        ]

        print(f"    nodes: {len(nodes)}")
        baked.append({
            "id": mid,
            "name": name,
            "symbol": sym,
            "description": m.get("description") or "",
            "siteUrl": m.get("siteUrl") or "",
            "iconUrl": m.get("iconUrl") or "",
            "nodes": nodes,
        })

    # geolocate every metagraph IP and merge into the shared geo cache
    print(f"unique metagraph IPs: {len(all_ips)}")
    geo = {}
    if os.path.exists(OUT_GEO):
        with open(OUT_GEO) as f:
            geo = json.load(f)
    missing = [ip for ip in all_ips if ip not in geo]
    print(f"geolocating {len(missing)} new IPs")
    if missing:
        try:
            geo.update(batch_geo(missing))
        except Exception as e:
            print(f"    ! geolocation failed ({e}); leaving {len(missing)} unlocated")

    os.makedirs(os.path.dirname(OUT_META), exist_ok=True)
    with open(OUT_GEO, "w") as f:
        json.dump(geo, f, separators=(",", ":"))
    with open(OUT_META, "w") as f:
        json.dump(baked, f, separators=(",", ":"))
    located = sum(1 for m in baked for n in m["nodes"] if n["ip"] in geo)
    total = sum(len(m["nodes"]) for m in baked)
    print(f"wrote {os.path.relpath(OUT_META)} ({located}/{total} nodes located)")


if __name__ == "__main__":
    main()
