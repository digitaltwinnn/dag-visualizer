# The Briefing

## Why

October: 271 visitors, two in three on phones, and 71 arrivals from t.co saw 77 pages, nearly all of
them `/`. Bounce is about 60%. Most visitors never reach a second view. The Briefing shows every view
once, in the AI's words, on every entry to `/`, and Skip ends it. It says something new each time,
so it reads as a daily briefing rather than an intro.

## What the visitor gets

1. `/` opens on Geography, which is now the default view.
2. The tour plays Geography, Snapshots, Hypergraph, History. Each stop is about 4.9 seconds, about 20
   seconds in all, and each shows two or three lines from Constellation Gate AI, typed in.
3. The stage clears on every screen size: the HUD steps aside, the scene fills the screen and lifts,
   and large words stand beneath it. Phones keep progress and Skip at the top, as the mock showed.
4. The progress bar's segments, and the arrow keys, move back and forward between stops.
   Skip or Escape ends it and leaves the visitor in that view, the words fading as the interface
   arrives. The scene stays live: a drag orbits as usual and holds the stop's clock, and a tap on it
   does nothing, so a visitor exploring never ends the tour by accident. Finishing returns to the globe in three beats: the words go, the scene
   moves alone, and the interface arrives as it lands. Either way the interface arrives, which shows
   this is a tool and not a video.

## Rules

- Only on `/`, on mainnet, once per browser session. A deep link goes straight to its view.
- Tour stops are not page views: the URL stays on `/` and nothing is pushed. The view a visitor stops
  on publishes its URL and `view-switch` as usual. `briefing-stop` and `briefing-end` custom events
  record how far people watch and where they leave.
- The tour clock never outruns the scene: a stop ends at about 4.9 seconds, or when the transition lands
  if that is later, so a slow phone gets its whole view.
- Faster transition for the tour only (`BRIEFING_PACE`, about 3 seconds), through the clock `?slowmo` already scales.
  Normal switching is unchanged.
- Reduced motion uses the app's normal view switch, and the line appears without typing.
- A stop with no note shows a plain sentence with no AI mark. No number is invented (rule 10).
- No WebGL, or a scene that is not ready in time: the tour stands down and the app opens as normal.

## The line

The model writes one extra `LINE:`, one or two sentences, for the four notes the tour reads, in the same answer as the note,
so there is no second call. It passes the same honesty gate and code adds the percentage as usual. A
line that fails, runs long or leads with a negative is dropped, and the tour falls back to the note's
opening.

## How it is built

- `src/engine/domain/briefing.ts`: order, timing, pace, cover, when the tour plays.
- `store.briefing`: the stop on screen, or null. One channel, read by everything below.
- `useBootStage` answers stage 0 while it is set, so `BootFade` hides and inerts the HUD and brings
  it back with the fade it already has. Tablet and phone therefore clear the same way as desktop.
- Desktop and tablet also set `railsHidden`, which is what frames the scene for the full width.
- `Engine`: the pace on the choreography clock, and the cover added to the sheet shift, so the scene
  lifts by the same projection offset a phone sheet uses.
- `RouteSync` holds publishing while the tour runs and publishes the result when it ends.
- `components/Briefing.tsx`: the controller and the caption.
