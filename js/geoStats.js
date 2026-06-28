// Geo "data" layer, split out of globe.js: per-country tallies, the distribution score, and the
// flat node-browser list. These are PURE functions over the Globe's node arrays (`nodes` =
// validators, `metaNodes` = metagraph nodes) — no Three.js / mesh state — so they live on their
// own and globe.js stays focused on the 3D node engine. The Globe keeps thin wrappers that pass
// its arrays in (so the engine's call sites are unchanged).

// Tally located nodes by country, keyed per network id so the leaderboard and the distribution
// score can both read one selection out of it:
//   dag — the validator set (the DAG core); <metaId> — one metagraph's nodes;
//   all — the combined validator set (what the unfiltered leaderboard shows).
export function countryTallies(nodes, metaNodes) {
  const nets = {};
  const bump = (id, g) => {
    if (!g || !g.country) return;
    const m = (nets[id] ||= {});
    (m[g.country] ||= { country: g.country, cc: g.cc, count: 0 }).count++;
  };
  for (const u of nodes) {
    if (u.noGeo || !u.geoPrimary) continue; // one count per machine (skip hybrid siblings)
    // Validators ARE the DAG core: count each machine once under "dag" and once under "all".
    bump("dag", u.pick.geo);
    bump("all", u.pick.geo);
  }
  for (const r of metaNodes) if (r.geoPrimary ?? true) bump(r.metaId, r.pick.geo);
  return nets;
}

// Sorted [{ country, cc, count }] for one filter selection — drives the "Nodes by country"
// leaderboard.
export function countryStats(nodes, metaNodes, filter) {
  const m = countryTallies(nodes, metaNodes)[filter];
  return m ? Object.values(m).sort((a, b) => b.count - a.count) : [];
}

// Flat node list for one filter selection — drives the React node browser. Read-only: it just
// surfaces each plotted node's existing `pick` descriptor (so a click reuses the exact same
// inspector card as clicking the node on the globe) plus the few fields the browser groups/sorts
// on. all/dag → validators; <metaId> → that metagraph's nodes.
export function listNodes(nodes, metaNodes, filter) {
  const rows = [];
  const push = (pick, layer) => {
    const g = pick.geo || null;
    const node = pick.node || null;
    rows.push({
      pick,
      // Prefer the node ID (the stable identity); fall back to IP/place when absent.
      label: (node && (node.id || node.ip)) || (g && (g.city || g.country)) || "node",
      id: (node && node.id) || null,
      cc: g ? g.cc || null : null,
      country: g ? g.country || null : null,
      state: node ? node.state : null,
      layer,
      // The node's full role set (a hybrid runs several) — so the browser shows every layer it
      // serves, not just the shell it was de-duped into.
      roles: node && node.roles && node.roles.length ? node.roles : [layer],
    });
  };
  if (filter === "all" || filter === "dag") {
    for (const u of nodes) {
      if (u.noGeo || !u.geoPrimary) continue; // one row per machine (skip hybrid siblings)
      push(u.pick, u.layer);
    }
  } else {
    for (const r of metaNodes) {
      if (r.metaId === filter && (r.geoPrimary ?? true)) push(r.pick, r.layer); // one row per node
    }
  }
  return rows;
}

// A 1–100 "distribution score" (%) per network. Two ingredients, multiplied:
//   • geographic spread — the *effective* number of countries `exp(H)` (the Hill number of the
//     per-country Shannon entropy): rewards both how MANY countries and how EVENLY the nodes
//     spread (1 if all in one country, → #countries if perfectly even);
//   • scale — `log2(1 + N)` over the node count, with diminishing returns, so MORE nodes read as
//     more distributed (100 nodes in one place beat 3 there) without raw count dominating.
// The product is expressed as a % of the most-distributed selection (the full footprint in
// practice → 100%); every other network is relative to it, floored at 1%.
// Returns { scores: { id -> 1..100 }, refId }.
export function distributionScores(nodes, metaNodes) {
  const nets = countryTallies(nodes, metaNodes);
  const measure = (m) => {
    const counts = Object.values(m).map((c) => c.count);
    const n = counts.reduce((s, c) => s + c, 0);
    if (n <= 0) return 0;
    let h = 0;
    for (const c of counts)
      if (c > 0) {
        const p = c / n;
        h -= p * Math.log(p);
      }
    const effCountries = Math.exp(h); // 1..#countries — breadth + evenness
    const scale = Math.log2(1 + n); // node-count weight, diminishing
    return effCountries * scale;
  };
  const D = {};
  for (const id in nets) D[id] = measure(nets[id]);
  // Baseline = the most distributed selection (the full validator+metagraph footprint in
  // practice, since it has both the most nodes and the widest spread) → the 100% mark.
  let refId = null,
    base = 0;
  for (const id in D) if (D[id] > base) ((base = D[id]), (refId = id));
  const scores = {};
  for (const id in D) {
    scores[id] = base > 0 && D[id] > 0 ? Math.max(1, Math.min(100, Math.round((D[id] / base) * 100))) : 0;
  }
  return { scores, refId };
}
