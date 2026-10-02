# The raw snapshot page on phone — options (proposal, 2026-10-02)

User: "Do a design pass on the snapshot details page (search, snapshot list, content tabs etc)
for mobile … use the localhost server to show some designs".

`index.html` (serve `docs/superpowers/design` on :3100, open `/2026-10-02-raw-phone/`): A today
(list and detail share one panel) · B list, then a page per snapshot · C list with the detail as a
bottom sheet (recommended) · D the row opens in place · E two-line rows (fee and size return on
phone; works with any layout). The search sheet is already right and is unchanged. 
**Picked B + E and built**: on phone the list is the whole panel with two-line rows (network ·
snapshot · age, then "into <global> · fee · size"); a row tap opens the snapshot as its own page
with a "‹ Snapshots" back row. **No title or count** on the panel (user: the count is "just a
cache — why should our end user care about our cache?"). Sorting by header is desktop/tablet only.
