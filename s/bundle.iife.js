/* bundle.iife.js — Wanderflur trip map (inline JSON, zero-fetch; icons from /s/*.svg)
   - Scroll-to-zoom disabled
   - + / − buttons
   - Idle reset returns to the EXACT initial camera (snapshotted after style settles)
   - Theme colors come from embed code config
*/
(function () {
  "use strict";

  // ---------- DEFAULTS (overridden by inline #trip-config if present) ----------
  var CFG = {
    maptiler: {
      key: (window.TRIPMAP_CONFIG && window.TRIPMAP_CONFIG.MAPTILER_KEY) || "",
      mapId: (window.TRIPMAP_CONFIG && window.TRIPMAP_CONFIG.MAP_ID) || "landscape"
    },
    icons: { root: "/s/", iconSize: 12, badgeSize: 24 },
    // Theme colors (can be overridden via embed code config)
    theme: {
      gold: "#FFB12D",
      red: "#A64C4F",
      darkRed: "#79494A"
    },
    colors: {
      route: "#FFB12D",
      currentDot: "#A64C4F",
      pill: { fg: "#FFFFFF", fill: "#79494A", stroke: "transparent" },
      pillCurrent: { fg: "#FFFFFF", fill: "#79494A", stroke: "transparent" }
    },
    pill: { fontSize: 16, padX: 16, padY: 8, radius: 999 },
    idleMs: 20000,
    homeView: { bounds: [[90, -12], [150, 50]], padding: { top: 60, right: 200, bottom: 60, left: 200 }, maxZoom: 6.5 }
  };

  // ---------- UTILS ----------
  function deepMerge(t, s) {
    for (const k in s) {
      if (s[k] && typeof s[k] === "object" && !Array.isArray(s[k])) {
        if (!t[k]) t[k] = {};
        deepMerge(t[k], s[k]);
      } else {
        t[k] = s[k];
      }
    }
    return t;
  }
  async function fetchText(u) {
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error(`${u} ${r.status}`);
    return r.text();
  }
  async function fetchJSON(u) { return JSON.parse(await fetchText(u)); }
  function cityOnly(name) { if (!name) return ""; const i = name.indexOf(","); return i === -1 ? name.trim() : name.slice(0, i).trim(); }
  function setStatus(msg, err) { const el = document.getElementById("trip-map-status"); if (!el) return; el.textContent = msg || ""; el.classList.toggle("error", !!err); }

  // English month abbreviations
  const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function formatDateEN(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = MONTHS_EN[d.getMonth()];
    return `${day} ${month}`;
  }

  // Extract country from full location name (e.g. "Paris, France" -> "France")
  function countryOnly(name) {
    if (!name) return '';
    const parts = name.split(',');
    return parts.length > 1 ? parts[parts.length - 1].trim() : '';
  }

  // ---------- MERGE FULL INLINE CONFIG (no fetch) ----------
  (function () {
    var el = document.getElementById("trip-config");
    if (!el) return;
    try {
      var inlineCfg = JSON.parse(el.textContent || "{}");
      if (inlineCfg.maptiler) {
        window.TRIPMAP_CONFIG = {
          MAPTILER_KEY: inlineCfg.maptiler.key || "",
          MAP_ID: inlineCfg.maptiler.mapId || "landscape"
        };
      }
      deepMerge(CFG, inlineCfg);
    } catch (e) { /* ignore */ }
  })();

  // ---------- DATA BUILD ----------
  // Calculate bearing (angle) from point A to point B in degrees
  // 0° = North, 90° = East, 180° = South, 270° = West
  function calculateBearing(lon1, lat1, lon2, lat2) {
    const toRad = (deg) => deg * Math.PI / 180;
    const toDeg = (rad) => rad * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const lat1Rad = toRad(lat1);
    const lat2Rad = toRad(lat2);
    const x = Math.sin(dLon) * Math.cos(lat2Rad);
    const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    let bearing = toDeg(Math.atan2(x, y));
    // Since icons face right (East = 90°), we need to adjust: bearing - 90
    // This makes 0° (North) become -90° rotation, 90° (East) become 0° rotation, etc.
    return bearing - 90;
  }
  // Create a bezier curve between two points with offset control point
  function createBezierCurve(lon1, lat1, lon2, lat2, offsetDirection, curveAmount = 0.08) {
    // Calculate midpoint
    const midLon = (lon1 + lon2) / 2;
    const midLat = (lat1 + lat2) / 2;

    // Calculate perpendicular offset
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Perpendicular vector (normalized), scaled by curve amount and line length
    // For a consistent "right-hand" curve, use -dy, dx as perpendicular
    const perpX = -dy / len * len * curveAmount * offsetDirection;
    const perpY = dx / len * len * curveAmount * offsetDirection;

    // Control point offset from midpoint
    const ctrlLon = midLon + perpX;
    const ctrlLat = midLat + perpY;

    // Generate bezier curve points (quadratic bezier)
    const points = [];
    const steps = 20;
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const oneMinusT = 1 - t;
      const x = oneMinusT * oneMinusT * lon1 + 2 * oneMinusT * t * ctrlLon + t * t * lon2;
      const y = oneMinusT * oneMinusT * lat1 + 2 * oneMinusT * t * ctrlLat + t * t * lat2;
      points.push([x, y]);
    }

    // Calculate the actual midpoint of the curve (at t=0.5) for icon placement
    const t = 0.5;
    const oneMinusT = 0.5;
    const curveMidLon = oneMinusT * oneMinusT * lon1 + 2 * oneMinusT * t * ctrlLon + t * t * lon2;
    const curveMidLat = oneMinusT * oneMinusT * lat1 + 2 * oneMinusT * t * ctrlLat + t * t * lat2;

    // Return curve points and the curve midpoint (for icon placement)
    return { points, curveMidLon, curveMidLat };
  }

  function buildGeo(stops) {
    const stopPoints = {
      type: "FeatureCollection",
      features: stops.map((s, i) => ({
        type: "Feature",
        properties: { idx: i, name: s.name || "", city: cityOnly(s.name || ""), pillId: `pill-${i}` },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] }
      }))
    };
    const segLines = { type: "FeatureCollection", features: [] };
    const segIcons = { type: "FeatureCollection", features: [] };

    // Track segments to detect return trips (A→B and later B→A)
    // Key: sorted coordinates as string, Value: { count, firstDirection }
    const segmentTracker = new Map();

    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      let t = (a.to || "other").toLowerCase(); if (t === "ferry") t = "boat";

      // Calculate bearing for plane icon rotation (top-down view)
      const bearing = calculateBearing(a.lon, a.lat, b.lon, b.lat);

      // Determine if traveling west (left) for side-view icons that need flipping
      const goingWest = b.lon < a.lon;

      // Create a unique key for this segment pair (order-independent)
      const coords = [[a.lon, a.lat], [b.lon, b.lat]];
      coords.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const segKey = coords.map(c => c.join(',')).join('|');

      // Determine if this is a first occurrence or return trip
      // Simple logic: first occurrence = +1, any repeat = -1
      let curveOffset = 0;
      if (segmentTracker.has(segKey)) {
        // This is a repeat trip (could be same direction or opposite)
        curveOffset = -1; // Always curve opposite way from first
        segmentTracker.get(segKey).count++;
      } else {
        // Check if this exact route appears again later (look ahead)
        let hasReturnLater = false;
        for (let j = i + 1; j < stops.length - 1; j++) {
          const c = stops[j], d = stops[j + 1];
          const futureCoords = [[c.lon, c.lat], [d.lon, d.lat]];
          futureCoords.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
          const futureKey = futureCoords.map(co => co.join(',')).join('|');
          if (futureKey === segKey) {
            hasReturnLater = true;
            break;
          }
        }

        if (hasReturnLater) {
          // First occurrence curves one way
          curveOffset = 1;
          segmentTracker.set(segKey, { count: 1 });
        }
      }

      // Create line geometry (curved or straight)
      let lineCoords;
      let iconLon, iconLat;

      if (curveOffset !== 0) {
        // Create bezier curve
        const curve = createBezierCurve(a.lon, a.lat, b.lon, b.lat, curveOffset);
        lineCoords = curve.points;
        // Place icon at curve midpoint (t=0.5)
        iconLon = curve.curveMidLon;
        iconLat = curve.curveMidLat;
      } else {
        // Straight line
        lineCoords = [[a.lon, a.lat], [b.lon, b.lat]];
        iconLon = (a.lon + b.lon) / 2;
        iconLat = (a.lat + b.lat) / 2;
      }

      segLines.features.push({
        type: "Feature",
        properties: { transport: t },
        geometry: { type: "LineString", coordinates: lineCoords }
      });
      segIcons.features.push({
        type: "Feature",
        properties: { transport: t, bearing: bearing, goingWest: goingWest },
        geometry: { type: "Point", coordinates: [iconLon, iconLat] }
      });
    }
    return { stopPoints, segLines, segIcons };
  }

  // ---------- CANVAS RENDERERS ----------
  async function addSvgBadgeIconFromUrl(map, name, url, opts) {
    const iconSize = (opts && opts.iconSize) || CFG.icons.iconSize;
    const badgeSize = (opts && opts.badgeSize) || CFG.icons.badgeSize;
    const flip = opts && opts.flip; // Horizontal flip for side-view icons going west
    const color = "#fff", badgeFill = CFG.colors.route, badgeStroke = "rgba(0,0,0,.12)";
    if (map.hasImage && map.hasImage(name)) map.removeImage(name);
    try {
      let svg = await fetchText(url);
      svg = svg.replace(/stroke="[^"]*"/g, `stroke="${color}"`).replace(/fill="[^"]*"/g, `fill="${color}"`);
      if (!/viewBox=/.test(svg)) svg = svg.replace("<svg", `<svg viewBox="0 0 16 16"`);
      const img = new Image(); img.crossOrigin = "anonymous"; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      await new Promise((ok, err) => { img.onload = ok; img.onerror = err; });
      const pxB = badgeSize * 2, pxI = iconSize * 2, c = document.createElement("canvas"); c.width = c.height = pxB; const ctx = c.getContext("2d");
      ctx.fillStyle = badgeFill; ctx.beginPath(); ctx.arc(pxB / 2, pxB / 2, pxB * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = badgeStroke; ctx.lineWidth = Math.max(1, pxB * 0.02); ctx.stroke();
      const off = Math.round((pxB - pxI) / 2);
      if (flip) {
        // Flip horizontally: translate to center, scale -1, draw, then restore
        ctx.save();
        ctx.translate(pxB, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, off, off, pxI, pxI);
        ctx.restore();
      } else {
        ctx.drawImage(img, off, off, pxI, pxI);
      }
      map.addImage(name, ctx.getImageData(0, 0, pxB, pxB), { pixelRatio: 2 });
    } catch (e) {
      const s = 32, c = document.createElement("canvas"); c.width = c.height = s; const ctx = c.getContext("2d");
      ctx.fillStyle = badgeFill; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2); ctx.fill();
      map.addImage(name, ctx.getImageData(0, 0, s, s), { pixelRatio: 2 });
      console.warn("[icons] fallback:", name, url, e);
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  async function addTextPill(map, id, text, useCurrentStyle) {
    // Always use darkRed for pill background (ignore config overrides)
    const theme = CFG.theme || { darkRed: "#79494A" };
    const base = { fg: "#FFFFFF", fill: theme.darkRed, stroke: "transparent" };
    const { fontSize, padX, padY, radius } = CFG.pill;
    const scale = 2, font = `${fontSize * scale}px "IBM Plex Mono", monospace`;
    const m = document.createElement("canvas").getContext("2d"); m.font = font;
    const textW = Math.ceil(m.measureText(text).width), textH = Math.ceil(fontSize * 1.2 * scale);
    const w = textW + (padX * 2 * scale), h = textH + (padY * 2 * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
    const r = Math.min(radius * scale, Math.min(w, h) / 2);
    ctx.fillStyle = base.fill; ctx.beginPath(); roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r); ctx.fill();
    if (base.stroke !== "transparent") { ctx.strokeStyle = base.stroke; ctx.lineWidth = Math.max(1, scale); ctx.stroke(); }
    ctx.fillStyle = base.fg; ctx.font = font; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, w / 2, h / 2 + 0.5);
    if (map.hasImage && map.hasImage(id)) map.removeImage(id);
    map.addImage(id, c.getContext("2d").getImageData(0, 0, w, h), { pixelRatio: 2 });
  }
  function addWavePattern(map, name) {
    name = name || "wave-24"; if (map.hasImage && map.hasImage(name)) return;
    const s = 24, c = document.createElement("canvas"); c.width = c.height = s; const ctx = c.getContext("2d");
    ctx.strokeStyle = CFG.colors.route; ctx.lineWidth = Math.max(2, Math.round(s * 0.15)); ctx.lineCap = "round"; ctx.beginPath();
    for (let x = 0; x <= s; x++) { const t = (x / s) * Math.PI * 2, y = s * 0.5 + Math.sin(t) * (s * 0.25); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); map.addImage(name, ctx.getImageData(0, 0, s, s), { pixelRatio: 1 });
  }

  // ---------- MAP INIT ----------
  function makeMap(styleUrl) {
    const hv = CFG.homeView;
    const isMobile = window.innerWidth <= 768;
    const pad = isMobile
      ? { top: 40, right: 20, bottom: 160, left: 20 }
      : hv.padding;
    const map = new maplibregl.Map({
      container: "trip-map",
      style: styleUrl,
      bounds: hv.bounds,
      fitBoundsOptions: { padding: pad, maxZoom: hv.maxZoom, duration: 0 },
      dragRotate: false, pitchWithRotate: false
    });

    // Disable scroll zoom and rotation; we’ll add buttons
    map.scrollZoom.disable();
    map.boxZoom.disable();
    map.touchZoomRotate.disableRotation();

    window.addEventListener("resize", () => { try { map.resize(); } catch { } }, { passive: true });
    return map;
  }

  function hideBaseStyleClutter(map) {
    const layers = (map.getStyle().layers || []);
    for (const l of layers) {
      const id = l.id || "", type = l.type || "", srcLayer = l["source-layer"] || "";
      const isCountryLabel = type === "symbol" && (/country/.test(id) || /country/.test(srcLayer) || /country_name/.test(srcLayer));
      const isGraticule = /(graticule|grid|equator|meridian|parallel|latitude|longitude)/i.test(id);
      if (isCountryLabel) { try { map.setLayoutProperty(id, "visibility", "visible"); } catch { } }
      if (isGraticule) { try { map.setLayoutProperty(id, "visibility", "none"); } catch { } }
    }
  }

  function addSources(map, geo) {
    if (!map.getSource("stops")) map.addSource("stops", { type: "geojson", data: geo.stopPoints });
    if (!map.getSource("segments")) map.addSource("segments", { type: "geojson", data: geo.segLines });
    if (!map.getSource("segIcons")) map.addSource("segIcons", { type: "geojson", data: geo.segIcons });
  }

  function addRouteAndIcons(map) {
    const R = CFG.colors.route;
    const line50 = (paint) => Object.assign({ "line-color": R, "line-opacity": 0.5 }, paint || {});
    if (!map.getLayer("segments-car")) map.addLayer({ id: "segments-car", type: "line", source: "segments", filter: ["==", ["get", "transport"], "car"], paint: line50({ "line-width": 2.5 }) });
    if (!map.getLayer("segments-bus")) map.addLayer({ id: "segments-bus", type: "line", source: "segments", filter: ["==", ["get", "transport"], "bus"], paint: line50({ "line-width": 2.5, "line-dasharray": [2, 2] }) });
    if (!map.getLayer("segments-plane")) map.addLayer({ id: "segments-plane", type: "line", source: "segments", filter: ["==", ["get", "transport"], "plane"], paint: line50({ "line-width": 2.5, "line-dasharray": [4, 4] }) });
    if (!map.getLayer("segments-other")) map.addLayer({ id: "segments-other", type: "line", source: "segments", filter: ["==", ["get", "transport"], "other"], paint: line50({ "line-width": 2.5, "line-dasharray": [1, 2] }) });
    if (!map.getLayer("segments-boat")) map.addLayer({ id: "segments-boat", type: "line", source: "segments", filter: ["==", ["get", "transport"], "boat"], paint: line50({ "line-width": 2.5, "line-dasharray": [1, 1] }) });
    if (!map.getLayer("segments-train-left"))
      map.addLayer({ id: "segments-train-left", type: "line", source: "segments", filter: ["==", ["get", "transport"], "train"], layout: { "line-join": "round", "line-cap": "round" }, paint: line50({ "line-width": 2.5, "line-offset": -3 }) });
    if (!map.getLayer("segments-train-right"))
      map.addLayer({ id: "segments-train-right", type: "line", source: "segments", filter: ["==", ["get", "transport"], "train"], layout: { "line-join": "round", "line-cap": "round" }, paint: line50({ "line-width": 2.5, "line-offset": 3 }) });

    if (!map.getLayer("segments-icons")) {
      map.addLayer({
        id: "segments-icons", type: "symbol", source: "segIcons",
        layout: {
          // Complex icon selection:
          // - Plane: uses rotation (top-down view)
          // - Side-view icons: select flipped version when goingWest
          "icon-image": [
            "case",
            ["==", ["get", "transport"], "plane"], "icon-plane",
            ["==", ["get", "transport"], "train"], ["case", ["get", "goingWest"], "icon-train-flip", "icon-train"],
            ["==", ["get", "transport"], "bus"], ["case", ["get", "goingWest"], "icon-bus-flip", "icon-bus"],
            ["==", ["get", "transport"], "car"], ["case", ["get", "goingWest"], "icon-car-flip", "icon-car"],
            ["==", ["get", "transport"], "boat"], ["case", ["get", "goingWest"], "icon-boat-flip", "icon-boat"],
            "icon-other"
          ],
          "icon-size": 1,
          "icon-allow-overlap": true,
          // Only plane uses rotation
          "icon-rotate": ["case", ["==", ["get", "transport"], "plane"], ["get", "bearing"], 0],
          "icon-rotation-alignment": "map"
        }
      });
    }

    // Create numbered stop icons (24x24px dark brown circles with white numbers)
    if (!map.getLayer("stops-numbers")) {
      map.addLayer({
        id: "stops-numbers", type: "symbol", source: "stops",
        layout: {
          "icon-image": ["concat", "stop-num-", ["to-string", ["+", ["get", "idx"], 1]]],
          "icon-allow-overlap": true,
          "icon-size": 1
        }
      });
    }
  }

  // Generate numbered stop icons (24px circles with numbers)
  async function addNumberedStopIcons(map, count) {
    const theme = CFG.theme || { darkRed: "#79494A", beige: "#E8DDCD" };
    const size = 64; // 32px * 2 for retina

    for (let i = 1; i <= count; i++) {
      const name = `stop-num-${i}`;
      if (map.hasImage(name)) continue;

      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");

      // Dark brown circle
      ctx.fillStyle = theme.darkRed;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.fill();

      // White number with monospace font (loads reliably in canvas)
      ctx.fillStyle = "#fff";
      ctx.font = `${size * 0.45}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i), size / 2, size / 2 + 1);

      map.addImage(name, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
    }
  }

  function addCityPills(map, lastIdx) {
    if (!map.getLayer("city-pills")) {
      map.addLayer({
        id: "city-pills", type: "symbol", source: "stops",
        filter: ["==", ["get", "idx"], lastIdx],
        layout: { "icon-image": ["get", "pillId"], "icon-allow-overlap": true, "icon-offset": [0, -38] }
      });
    }
  }

  // ---------- SIDEBAR ----------
  function injectSidebarCSS() {
    if (document.getElementById('trip-sidebar-styles')) return;
    const style = document.createElement('style');
    style.id = 'trip-sidebar-styles';
    // Use CFG.theme for colors (comes from embed code config)
    const theme = CFG.theme || { gold: "#FFB12D", red: "#A64C4F", darkRed: "#79494A", cream: "#F4EDE4", beige: "#E8DDCD" };
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Crimson+Text&family=IBM+Plex+Mono:wght@400;500&family=Sorts+Mill+Goudy&display=swap');
      
      #trip-map {
        position: relative !important;
        overflow: hidden !important;
      }
      #trip-sidebar {
        position: absolute;
        top: 12px;
        left: 12px;
        width: 234px;
        height: calc(100% - 24px);
        max-height: calc(100% - 24px);
        background: linear-gradient(180deg, rgba(244, 237, 228, 0.96) 0%, rgba(232, 221, 205, 0.96) 100%);
        border-radius: 16px;
        overflow-y: scroll;
        overflow-x: hidden;
        z-index: 10;
        box-sizing: border-box;
        padding: 8px 0;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      }
      /* Always show scrollbar - forced visible */
      #trip-sidebar::-webkit-scrollbar { width: 10px; }
      #trip-sidebar::-webkit-scrollbar-track { background: rgba(121, 73, 74, 0.25); border-radius: 5px; }
      #trip-sidebar::-webkit-scrollbar-thumb { background: ${theme.darkRed}; border-radius: 5px; min-height: 30px; }
      #trip-sidebar::-webkit-scrollbar-thumb:hover { background: ${theme.red}; }
      #trip-sidebar { scrollbar-width: auto; scrollbar-color: ${theme.darkRed} rgba(121, 73, 74, 0.25); }
      
      .trip-stop {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        cursor: pointer;
        transition: background 0.2s, opacity 0.05s;
        position: relative;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      .trip-stop:hover { background: rgba(0,0,0,0.05); }
      .trip-stop:active { opacity: 0.7; }
      .trip-stop.active { background: ${theme.red}; }
      
      /* Stop number circle */
      .stop-number {
        flex-shrink: 0;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${theme.darkRed};
        color: #fff;
        font-family: 'IBM Plex Mono', monospace;
        font-weight: normal;
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .trip-stop.active .stop-number {
        background: #fff;
        color: ${theme.darkRed};
      }
      
      /* Stop content (dates, city, country) */
      .stop-content {
        flex: 1;
        min-width: 0;
      }
      
      /* Dates above city name - IBM Plex Mono */
      .stop-dates {
        display: block;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 13px;
        color: ${theme.darkRed};
        letter-spacing: 0.3px;
        margin-bottom: 4px;
      }
      .trip-stop.active .stop-dates { color: rgba(255,255,255,0.85); }
      
      /* City name - elegant font */
      .stop-city {
        display: block;
        font-family: 'Sorts Mill Goudy', serif;
        font-size: 24px;
        color: #333;
        line-height: 1.1;
      }
      .trip-stop.active .stop-city { color: #fff; }
      
      /* Country name under city */
      .stop-country {
        display: block;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 12px;
        color: #666;
        margin-top: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .trip-stop.active .stop-country { color: rgba(255,255,255,0.7); }
      
      /* Thin divider line between stops - no margin to blend with selected bg */
      .trip-divider {
        height: 1px;
        margin: 0;
        background: rgba(0,0,0,0.1);
      }
      
      /* Force scrollbar always visible */
      #trip-sidebar {
        scrollbar-width: auto;
        overflow-y: scroll !important;
      }
      #trip-sidebar::-webkit-scrollbar {
        width: 10px;
        display: block !important;
      }
      #trip-sidebar::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.08);
        border-radius: 5px;
      }
      #trip-sidebar::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.25);
        border-radius: 5px;
        min-height: 30px;
      }
      #trip-sidebar::-webkit-scrollbar-thumb:hover {
        background: rgba(0,0,0,0.35);
      }
      
      /* MapLibre navigation controls - theme colors */
      .maplibregl-ctrl-group {
        background: ${theme.cream} !important;
        border-radius: 8px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
        overflow: hidden !important;
      }
      .maplibregl-ctrl-group button {
        background-color: transparent !important;
        border: none !important;
        width: 32px !important;
        height: 32px !important;
      }
      .maplibregl-ctrl-group button:hover {
        background-color: ${theme.beige} !important;
      }
      .maplibregl-ctrl-group button + button {
        border-top: 1px solid rgba(0,0,0,0.1) !important;
      }
      .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon,
      .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background-image: none !important;
        font-size: 18px !important;
        font-weight: bold !important;
        color: ${theme.darkRed} !important;
      }
      .maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon::before { content: '+'; }
      .maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon::before { content: '−'; }
      
      /* Mobile responsive - horizontal bottom strip */
      @media (max-width: 768px) {
        #trip-sidebar {
          top: auto !important;
          bottom: 12px !important;
          left: 12px !important;
          right: 12px !important;
          width: auto !important;
          height: auto !important;
          max-height: 140px !important;
          overflow-y: hidden !important;
          overflow-x: scroll !important;
          display: flex !important;
          flex-direction: row !important;
          padding: 0 !important;
          gap: 0 !important;
          scrollbar-width: thin !important;
        }
        
        #trip-sidebar::-webkit-scrollbar {
          height: 8px !important;
          display: block !important;
        }
        
        .trip-stop {
          flex-direction: column !important;
          flex-shrink: 0 !important;
          width: 100px !important;
          padding: 10px 8px !important;
          gap: 4px !important;
          text-align: center;
          border-radius: 0 !important;
        }
        
        .trip-stop.active {
          background: #A64C4F !important;
        }
        
        .stop-number {
          width: 36px !important;
          height: 36px !important;
          font-size: 14px !important;
          margin: 0 auto !important;
        }
        
        .stop-content {
          display: block !important;
        }
        
        .stop-city {
          font-size: 16px !important;
          line-height: 1.2 !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 96px;
          display: block !important;
        }
        
        .stop-country {
          font-size: 12px !important;
          display: block !important;
          margin-top: 2px !important;
        }
        
        .stop-dates {
          display: none !important;
        }
        
        .trip-divider {
          width: 1px !important;
          height: auto !important;
          flex-shrink: 0 !important;
          margin: 0 !important;
          background: rgba(0,0,0,0.15) !important;
          display: block !important;
        }
        
        /* Move zoom controls to top right on mobile */
        .maplibregl-ctrl-top-right {
          top: 12px !important;
          right: 12px !important;
        }

        /* Scroll indicator: right-edge fade on horizontal sidebar */
        #trip-sidebar::after {
          content: '';
          position: sticky;
          right: 0;
          top: 0;
          flex-shrink: 0;
          width: 24px;
          min-height: 100%;
          background: linear-gradient(to left, rgba(244,237,228,0.95), transparent);
          pointer-events: none;
        }
      }
      
      /* Class-based mobile preview (for editor toggle) */
      #trip-map.mobile-preview #trip-sidebar {
        top: auto !important;
        bottom: 12px !important;
        left: 12px !important;
        right: 12px !important;
        width: auto !important;
        height: auto !important;
        max-height: 140px !important;
        overflow-y: hidden !important;
        overflow-x: scroll !important;
        display: flex !important;
        flex-direction: row !important;
        padding: 0 !important;
        gap: 0 !important;
        scrollbar-width: thin !important;
      }
      
      #trip-map.mobile-preview #trip-sidebar::-webkit-scrollbar {
        height: 8px !important;
        display: block !important;
      }
      
      #trip-map.mobile-preview .trip-stop {
        flex-direction: column !important;
        flex-shrink: 0 !important;
        width: 100px !important;
        padding: 10px 8px !important;
        gap: 4px !important;
        text-align: center;
        border-radius: 0 !important;
      }
      
      #trip-map.mobile-preview .trip-stop.active {
        background: #A64C4F !important;
      }
      
      #trip-map.mobile-preview .stop-number {
        width: 36px !important;
        height: 36px !important;
        font-size: 14px !important;
        margin: 0 auto !important;
      }
      
      #trip-map.mobile-preview .stop-content {
        display: block !important;
      }
      
      #trip-map.mobile-preview .stop-city {
        font-size: 16px !important;
        line-height: 1.2 !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 96px;
        display: block !important;
      }
      
      #trip-map.mobile-preview .stop-country {
        font-size: 12px !important;
        display: block !important;
        margin-top: 2px !important;
      }
      
      #trip-map.mobile-preview .stop-dates {
        display: none !important;
      }
      
      #trip-map.mobile-preview .trip-divider {
        width: 1px !important;
        height: auto !important;
        flex-shrink: 0 !important;
        margin: 0 !important;
        background: rgba(0,0,0,0.15) !important;
        display: block !important;
      }
    `;
    document.head.appendChild(style);
  }

  function createSidebar(stops, lastIdx, map) {
    injectSidebarCSS();

    // Remove existing sidebar if present
    const existing = document.getElementById('trip-sidebar');
    if (existing) existing.remove();

    const sidebar = document.createElement('div');
    sidebar.id = 'trip-sidebar';

    // Get map container for appending sidebar
    const tripMap = document.getElementById('trip-map');

    // Add stops in chronological order (oldest first, newest at bottom)
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const item = document.createElement('div');
      item.className = 'trip-stop' + (i === lastIdx ? ' active' : '');
      item.dataset.idx = i;
      item.dataset.lon = stop.lon;
      item.dataset.lat = stop.lat;

      // Format dates (dates appear ABOVE city name)
      // For last stop without depart date, show "NOW"
      let dateStr = '';
      if (stop.arrive) {
        const arriveStr = formatDateEN(stop.arrive);
        const departStr = stop.depart ? formatDateEN(stop.depart) : (i === lastIdx ? 'NOW' : '');
        dateStr = departStr ? `${arriveStr} → ${departStr}` : arriveStr;
      }

      // Get country name
      const country = countryOnly(stop.name);

      // Stop number (1-indexed)
      const stopNum = i + 1;

      // Numbered circle + content wrapper
      item.innerHTML = `
        <div class="stop-number">${stopNum}</div>
        <div class="stop-content">
          ${dateStr ? `<span class="stop-dates">${dateStr}</span>` : ''}
          <span class="stop-city">${cityOnly(stop.name)}</span>
          ${country ? `<span class="stop-country">${country}</span>` : ''}
        </div>
      `;
      sidebar.appendChild(item);

      // Add thin divider line between stops (except after the last stop)
      if (i < stops.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'trip-divider';
        sidebar.appendChild(divider);
      }
    }

    // Insert into the actual map container (not the wrapper) for proper height constraint
    if (tripMap) {
      tripMap.style.position = 'relative';
      tripMap.appendChild(sidebar);

      // Scroll to active item (latest stop)
      const activeItem = sidebar.querySelector('.trip-stop.active');
      if (activeItem) {
        setTimeout(() => {
          activeItem.scrollIntoView({ block: 'end', behavior: 'smooth' });
        }, 100);
      }
    }

    // Event delegation for clicks
    sidebar.addEventListener('click', async (e) => {
      const stopEl = e.target.closest('.trip-stop');
      if (!stopEl) return;

      const lon = parseFloat(stopEl.dataset.lon);
      const lat = parseFloat(stopEl.dataset.lat);
      const idx = parseInt(stopEl.dataset.idx);
      const stop = stops[idx];
      const cityName = cityOnly(stop.name);

      // Fly to location
      map.flyTo({ center: [lon, lat], zoom: 8, duration: 1000 });

      // Update active state
      sidebar.querySelectorAll('.trip-stop').forEach(el => el.classList.remove('active'));
      stopEl.classList.add('active');

      // Create pill for this stop if it doesn't exist
      const pillId = `pill-${idx}`;
      if (!map.hasImage(pillId)) {
        await addTextPill(map, pillId, cityName, idx === lastIdx);
      }

      // Update city-pills layer to show this stop's pill
      if (map.getLayer("city-pills")) {
        map.setFilter("city-pills", ["==", ["get", "idx"], idx]);
      }
    });

    return sidebar;
  }

  // Accept a concrete snapshot object (not a function), so it never drifts
  function setupIdleAndControls(map, INITIAL_VIEW) {
    map.addControl(new maplibregl.NavigationControl({
      showCompass: false,
      visualizePitch: false
    }), "top-right");

    let idleTimer = null;
    const resetToInitial = () => {
      map.easeTo({
        center: INITIAL_VIEW.center,
        zoom: INITIAL_VIEW.zoom,
        bearing: INITIAL_VIEW.bearing,
        pitch: INITIAL_VIEW.pitch,
        duration: 600
      });

      // Also reset sidebar to show latest stop as active
      const sidebar = document.getElementById('trip-sidebar');
      if (sidebar) {
        const stops = sidebar.querySelectorAll('.trip-stop');
        const lastIdx = stops.length - 1;
        stops.forEach(el => el.classList.remove('active'));
        const lastStop = stops[lastIdx];
        if (lastStop) {
          lastStop.classList.add('active');
          setTimeout(() => lastStop.scrollIntoView({ block: 'end', behavior: 'smooth' }), 100);
        }

        // Restore city pill to last stop
        if (map.getLayer("city-pills")) {
          map.setFilter("city-pills", ["==", ["get", "idx"], lastIdx]);
        }
      }
    };
    const bumpIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(resetToInitial, CFG.idleMs); };

    const el = document.getElementById("trip-map");
    ["dragstart", "dragend", "zoomstart", "zoomend", "moveend"].forEach(e => map.on(e, bumpIdle));
    ["mousedown", "mousemove", "wheel", "touchstart", "touchmove", "keydown"].forEach(e => { el && el.addEventListener(e, bumpIdle, { passive: true }); });

    bumpIdle(); // arm once
  }

  // ---------- BOOT ----------
  (async function boot() {
    try {
      const el = document.getElementById("trip-map");
      const styleUrl = `https://api.maptiler.com/maps/${CFG.maptiler.mapId}/style.json?key=${encodeURIComponent(CFG.maptiler.key)}`;

      const map = makeMap(styleUrl);
      map.on("load", async function () {
        try {
          hideBaseStyleClutter(map);

          // Icons from files - normal versions (facing right/east)
          const root = CFG.icons.root.replace(/\/+$/, "") + "/";
          await Promise.all([
            // Plane uses rotation, no flip needed
            addSvgBadgeIconFromUrl(map, "icon-plane", root + "plane.svg"),
            // Side-view icons - normal (facing right)
            addSvgBadgeIconFromUrl(map, "icon-train", root + "train.svg"),
            addSvgBadgeIconFromUrl(map, "icon-bus", root + "bus.svg"),
            addSvgBadgeIconFromUrl(map, "icon-car", root + "car.svg"),
            addSvgBadgeIconFromUrl(map, "icon-boat", root + "boat.svg"),
            addSvgBadgeIconFromUrl(map, "icon-other", root + "dot.svg"),
            // Side-view icons - flipped (facing left, for traveling west)
            addSvgBadgeIconFromUrl(map, "icon-train-flip", root + "train.svg", { flip: true }),
            addSvgBadgeIconFromUrl(map, "icon-bus-flip", root + "bus.svg", { flip: true }),
            addSvgBadgeIconFromUrl(map, "icon-car-flip", root + "car.svg", { flip: true }),
            addSvgBadgeIconFromUrl(map, "icon-boat-flip", root + "boat.svg", { flip: true })
          ]);

          addWavePattern(map, "wave-24");
          setStatus("loading trip data…");

          // Stops: external attr (if ever used) OR inline <script id="trip-stops">
          const jsonAttr = el?.getAttribute("data-json");
          let stops = [];
          if (jsonAttr) stops = await fetchJSON(jsonAttr);
          else { const inline = document.getElementById("trip-stops"); if (inline) stops = JSON.parse(inline.textContent); }

          const geo = buildGeo(stops);
          addSources(map, geo);

          // Generate numbered stop icons before adding layers
          await addNumberedStopIcons(map, stops.length);

          addRouteAndIcons(map);

          // Add click handler for numbered stops on map
          map.on('click', 'stops-numbers', async (e) => {
            if (!e.features || e.features.length === 0) return;
            const idx = e.features[0].properties.idx;
            const stop = stops[idx];
            const cityName = cityOnly(stop.name);

            // Find and update the corresponding sidebar item
            const sidebarEl = document.getElementById('trip-sidebar');
            if (sidebarEl) {
              const stopEls = sidebarEl.querySelectorAll('.trip-stop');
              stopEls.forEach(el => el.classList.remove('active'));
              const targetStop = stopEls[idx];
              if (targetStop) {
                targetStop.classList.add('active');
                targetStop.scrollIntoView({ block: 'center', behavior: 'smooth' });
              }
            }

            // Fly to location (same as sidebar click)
            map.flyTo({ center: [stop.lon, stop.lat], zoom: 8, duration: 1000 });
            // Create pill for this stop if it doesn't exist
            const pillId = `pill-${idx}`;
            if (!map.hasImage(pillId)) {
              await addTextPill(map, pillId, cityName, idx === lastIdx);
            }

            // Update city-pills layer to show this stop's pill
            if (map.getLayer("city-pills")) {
              map.setFilter("city-pills", ["==", ["get", "idx"], idx]);
            }
          });

          // Change cursor on hover
          map.on('mouseenter', 'stops-numbers', () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', 'stops-numbers', () => { map.getCanvas().style.cursor = ''; });

          // City pills (only current stop gets a pill)
          const lastIdx = geo.stopPoints.features.length - 1;
          const currentStop = stops[lastIdx];

          // Only create pill for current stop
          const currentFeature = geo.stopPoints.features[lastIdx];
          if (currentFeature) {
            const text = currentFeature.properties.city || "", id = currentFeature.properties.pillId;
            if (text) await addTextPill(map, id, text, true);
          }
          addCityPills(map, lastIdx);

          // Create sidebar
          createSidebar(stops, lastIdx, map);

          // Zoom to current location (zoom 7 = good overview)
          if (currentStop) {
            map.jumpTo({
              center: [currentStop.lon, currentStop.lat],
              zoom: 8
            });
          }

          // Wait for idle, then setup controls with current location as home
          map.once("idle", () => {
            const INITIAL_VIEW = {
              center: currentStop ? [currentStop.lon, currentStop.lat] : map.getCenter(),
              zoom: 8,
              bearing: 0,
              pitch: 0
            };
            setupIdleAndControls(map, INITIAL_VIEW);
          });

          setStatus("");
        } catch (e) {
          console.error("[trip-map] load err:", e);
          setStatus("map init failed: " + e.message, true);
        }
      });
    } catch (e) {
      console.error("[trip-map] boot err:", e);
      setStatus("map boot failed: " + e.message, true);
    }
  })();

})();