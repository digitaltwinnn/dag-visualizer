# Node card — design options (proposal, 2026-10-02)

User: "show me node card design options in the localhost design session".

`index.html` draws four layouts, each for a fully measured DAG validator and a sparse metagraph
data node: A as built · B three labelled groups (Runs / Operator / Archive) · C what it runs,
drawn as three layer cells, plus an archive section (recommended) · D the archive as a timeline.
Serve `docs/superpowers/design` on :3100 and open `/2026-10-02-node-card/`. 
**Picked C and built** (`LayerCells` in `components/inspector/parts.tsx`): Runs (three layer cells) ·
Archive (value on the label, bar, note) · plain rows. **No "staked" chip** (user: "do we have
data actually saying this?" — no: the registry only says the operator REGISTERED as a
delegated-staking candidate, not that any stake is delegated), so "Delegated staking" stays a row.
