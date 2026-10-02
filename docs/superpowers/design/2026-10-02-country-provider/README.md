# Country and provider cards — options (proposal, 2026-10-02)

User: "Country & Provider card have the same content; any ideas? show me options" — "the node
part I mean": both cards cut their nodes by network, so the provider's table is the country's,
smaller.

`index.html` (serve `docs/superpowers/design` on :3100, open `/2026-10-02-country-provider/`)
draws the two cards stacked, four ways: A today · B each card cuts by the next level down
(country by provider, provider by network — recommended) · C each card shows its share of the
one above as a strip · D country by city, provider by what its nodes run. 
**Picked B and built**: `providerParts` cuts the country (top three hosts + "N others"), the provider
keeps its network cut and its lead states its share of the country.
