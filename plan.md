# Plan: Make WanderMap Mobile-Friendly

## Overview

The **public widget** (`bundle.iife.js`) already has a solid 768px breakpoint with a horizontal bottom sidebar on mobile. The **editor** (`index.html`) is entirely desktop-only with a fixed 400px sidebar layout. This plan focuses primarily on making the editor responsive, with minor widget polish.

---

## Part 1: Editor (index.html) — Main Work

### 1. Responsive Layout: Stack sidebar below map on small screens
- Add `@media (max-width: 768px)` to switch the `body` flex layout from `row` to `column-reverse` (map on top, editor below)
- Make `#editor` full-width instead of fixed 400px
- Make `#map-container` full-width with a sensible height (e.g., `50vh` or `300px`)
- Ensure the editor panel is scrollable independently

### 2. Map height adjustments
- Change the fixed `520px` map height to be responsive — use `min(520px, 60vh)` or similar
- Fix mobile preview mode: `600px` height is too tall for actual phones; use `100%` of its container instead

### 3. Touch-friendly controls
- Increase touch targets for stop action buttons (edit/delete) — currently ~16px, need at least 44px
- Increase transport connector/dropdown tap area
- Add `:active` tap feedback states alongside existing `:hover` states

### 4. Modals: responsive on small screens
- Modal widths already use `max-width: 90%` which is good
- Make location search dropdown scrollable with `max-height` and `overflow-y: auto` to prevent viewport overflow
- Stack `.date-row` fields vertically on small screens
- Ensure modals aren't obscured by the mobile keyboard — add scroll-into-view when inputs are focused

### 5. Header & preview toggle
- Hide or collapse the desktop/mobile preview toggle on actual mobile devices (it's meaningless on a real phone)
- Make `#map-header` wrap gracefully if needed

### 6. Collapsible editor sections
- Make "Theme" and "Export" sections collapsible (already accordion-style, verify they work on mobile)
- Consider the stops list scroll behavior on small viewports

---

## Part 2: Public Widget (bundle.iife.js) — Polish

### 7. Squarespace embed: add viewport meta tag
- Add `<meta name="viewport" content="width=device-width, initial-scale=1.0">` to `squarespace-code.html`
- Note: Squarespace may already inject this, but having it explicitly ensures correctness

### 8. Mobile sidebar improvements
- Add visual scroll indicator (fade/gradient) on the horizontal stop list to hint at scrollability
- Ensure active stop auto-scrolls into view on mobile

### 9. Touch feedback on widget
- Add `:active` states for `.trip-stop` items (tap feedback since `:hover` doesn't work on touch)
- Ensure map stop number icons have adequate tap targets (currently 36px on mobile — acceptable but could be 44px)

---

## Files Modified

| File | Changes |
|------|---------|
| `index.html` | Steps 1-6: responsive CSS, touch targets, modal fixes, layout |
| `squarespace-code.html` | Step 7: viewport meta tag |
| `s/bundle.iife.js` | Steps 8-9: scroll indicator, touch feedback, sidebar polish |

## Approach
- CSS-only changes where possible (media queries, flexbox adjustments)
- No new dependencies or build tools
- Maintain the existing dark theme and design language
- Test against 375px (iPhone SE) and 768px (tablet) breakpoints
