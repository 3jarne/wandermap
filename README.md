# WanderFlur — Trip Map Widget

A map widget that shows your travel route with animated stops, embedded on [wanderflur.com](https://www.wanderflur.com) via Squarespace. Built with [MapLibre GL](https://maplibre.org/) and [MapTiler](https://www.maptiler.com/).

## How it works

The map reads two pieces of data:

- **Stops** — your list of destinations (city, coordinates, dates, transport mode)
- **Config** — colours, icon sizes, map style, home view bounds

On the live site these are embedded inline inside `squarespace-code.html`. During local editing, `stops.json` is loaded separately so you can add/remove stops in a visual editor.

## Project structure

```
wandermap/
├── s/                        ← Static assets (uploaded to Squarespace at /s/)
│   ├── bundle.iife.js        ← The compiled map widget
│   ├── trip-config.json      ← Map configuration (colours, icons, view)
│   ├── boat.svg              ← Transport mode icons
│   ├── bus.svg
│   ├── car.svg
│   ├── dot.svg
│   ├── home.svg
│   ├── plane.svg
│   └── train.svg
├── index.html                ← Local editor UI (not on the live site)
├── server.js                 ← Local dev server (Node.js)
├── stops.json                ← Working copy of your stops data
└── squarespace-code.html     ← The snippet pasted into Squarespace
```

## Common tasks

### Edit stops (add/remove/reorder destinations)

1. Start the local editor:
   ```
   node server.js
   ```
2. Open http://localhost:3000 in your browser.
3. Use the editor to add, remove, or drag-reorder stops. Changes auto-save to `stops.json`.
4. When you're happy, copy the updated stops JSON into the `<script id="trip-stops">` block inside `squarespace-code.html`, then paste that snippet into your Squarespace code block.

### Change colours or map styling

Edit `s/trip-config.json`. The main things you'd change:

| Key | What it controls |
|-----|-----------------|
| `colors.route` | The line connecting your stops |
| `colors.currentDot` | The pulsing "you are here" dot |
| `colors.pill.fill` / `pill.fg` | Background and text colour of stop labels |
| `colors.pillCurrent` | Same, but for the current stop |
| `icons.iconSize` / `badgeSize` | Size of transport icons on the map |
| `homeView.bounds` | The default map view (corner coordinates) |

After editing, also update the matching values inside the `<script id="trip-config">` block in `squarespace-code.html` (the live site reads config from there, not from the JSON file).

### Rebuild the JavaScript bundle

The bundle (`s/bundle.iife.js`) is the compiled widget code. If you need to change map behaviour (not just data/styling), the bundle needs to be rebuilt. This was set up using a JavaScript bundler — ask your AI assistant to help rebuild it when needed.

## Deploying to Squarespace

1. Upload all files in the `s/` folder to your Squarespace site's `/s/` path (via the file manager or custom CSS/JS upload).
2. Paste the contents of `squarespace-code.html` into a **Code Block** on your page.
3. Make sure the inline stops and config in that snippet are up to date.

## Services and keys

- **MapTiler** — provides the map tiles and style. The API key is in `trip-config.json` and in the Squarespace snippet.
- **MapLibre GL** — the open-source map rendering library, loaded from a CDN.
