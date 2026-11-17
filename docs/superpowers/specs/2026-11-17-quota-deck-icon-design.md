# QuotaDeck CN Icon Redesign

## 1. Context

`media/icon.png` is the marketplace icon for the `alexmultiagent.quota-deck` extension. It is the
only visual identity the product has on the VS Code Marketplace — the extension's in-editor
presence is a `$(pulse)` codicon in the status bar, and the dashboard uses its own theme tokens.

The shipped icon is a dark navy rounded square holding three hard-edged vertical bars in green,
blue and orange over a light baseline. It has three problems:

1. **It is generic.** A bar chart on a rounded tile is the default "analytics dashboard" mark. It
   carries no reference to quota, to QuotaDeck, or to the product's actual job of reporting how much
   allowance is left across several providers.
2. **It is crudely rendered.** `scripts/make-icon.mjs` fills rectangles pixel by pixel with no
   antialiasing, so every rounded corner and every bar end is visibly stair-stepped.
3. **It leans on colour alone** to distinguish the bars, which the product's own rule in the design
   spec §8 forbids for meaning-bearing colour.

## 2. Goals

1. Replace the generic chart with a mark that reads as *remaining quota* at a glance.
2. Drop the multi-colour scheme in favour of the established brand colour, so the icon does not
   imply that colour carries meaning.
3. Render every edge cleanly at 128 × 128 and stay legible down to 24px.
4. Keep the icon regenerable from source with a documented command and a checked output.

## 3. Non-goals

- **The status bar, tooltip, dashboard, and provider colours are untouched.** The icon is
  marketplace-only.
- **The gallery banner colour stays `#1baf7a`.** It already matches the new icon's accent.
- **The shipped asset stays 128 × 128.** Spec §13 requires it, and spec §13 is the release
  contract. The generator is parameterised by output size, so a larger marketplace export is a
  one-parameter change if the release contract is amended later.
- **The icon is not made to encode per-provider data.** It is a brand mark, not a chart.

## 4. Direction chosen

**A gauge dial** was chosen over three alternatives, each of which was drawn and reviewed as a
full-size mockup:

| Direction | Description | Why not |
| --- | --- | --- |
| A — Gauge dial | 240° meter with a value arc and a knob | **Chosen.** Reads as "how much is left"; survives 24px; needs one accent colour. |
| B — Card deck | Fanned quota cards, one per provider | Literal to the name, but densest of the four at 20px and busy at marketplace size. |
| C — Columns, refined | The current bar chart, redrawn | Better craft, but still a generic chart and still carries no QuotaDeck meaning. |
| D — Bare ring glyph | Transparent background, brand green only | Most logo-like, but a transparent glyph floats against the marketplace's own tile grid. |

Within direction A, treatment **A1 (Signal)** was chosen over three colour variants: a flat
near-black tile without a glow (loses the brand tie), a solid brand-green tile with a white gauge
(fights the dark gallery banner), and a knob-less pure arc (loses the "pointer at a reading" that
makes the mark read as a gauge).

## 5. Visual specification

All coordinates are in a 128 × 128 canvas with the origin at the top-left.

### 5.1 Tile

| Property | Value |
| --- | --- |
| Shape | Rounded rectangle, full bleed (0,0)–(128,128) |
| Corner radius | 27 |
| Fill | Linear gradient, 135°, `#1A2937` → `#0A1219` |

The corners outside the rounded rectangle are transparent.

### 5.2 Glow

| Property | Value |
| --- | --- |
| Shape | Radial gradient, centre (35.8, 19.2), radius 108.8 |
| Colour | `#1baf7a` |
| Opacity | 0.34 at the centre, falling to 0 at the radius |

The glow is composited over the tile fill and under the gauge.

### 5.3 Gauge

Both arcs are centred on (64, 64) with radius 39 and stroke width 13.

| Element | Angular extent | Colour | Caps |
| --- | --- | --- | --- |
| Track | 150° → 390° (240°, gap centred on the bottom) | white at 22% opacity | butt |
| Value | 150° → 294° (144°, 60% of the sweep) | `#1baf7a` | round |

Angles are measured clockwise from the positive x-axis, matching SVG's convention.

### 5.4 Knob

| Property | Value |
| --- | --- |
| Shape | Circle |
| Centre | (79.9, 28.4) — the terminus of the value arc |
| Radius | 7.5 |
| Fill | white |

### 5.5 Palette

| Role | Colour |
| --- | --- |
| Tile top | `#1A2937` |
| Tile bottom | `#0A1219` |
| Brand / value arc / glow | `#1baf7a` |
| Knob | `#ffffff` |

`#1baf7a` is the existing brand green: it is already `galleryBanner.color` and already the MiniMax
accent in `src/presentation/dashboard/viewModel.ts`. The icon introduces no new colour.

### 5.6 Fill level

The value arc covers 60% of the sweep. This is a deliberate design decision rather than a data
readout: it reads as "a healthy amount of headroom" and avoids both an empty and a nearly-full
gauge. The arc is static and does not encode live quota.

## 6. Generator implementation

`scripts/make-icon.mjs` is rewritten. It keeps the repository's dependency-free PNG encoder —
`crc32`, `chunk`, `deflateSync`, and the 8-bit RGBA (`colour type 6`) header — and replaces only the
drawing stage.

### 6.1 Sampling

For each of the 128 × 128 output pixels, 8 × 8 = 64 sub-pixel samples are taken at
`(px + (i + 0.5) / 8, py + (j + 0.5) / 8)`. Each sample is evaluated against the continuous
geometry, so edges resolve by coverage rather than by rounding.

Samples are accumulated **premultiplied** — `r·a`, `g·a`, `b·a` and `a` are summed — and
unpremultiplied at the end by dividing the colour sums by `Σa`. Premultiplication is required
because the tile's corners are transparent; averaging straight alpha would darken the antialiased
corner pixels.

The colour sums are already in the 0–255 range after that division, because each sample's colour
components are 0–255 and only its alpha is normalised. The final alpha is `Σa / 64`, scaled to
0–255 for the PNG. **The colour channels must not be scaled by 255 a second time** — doing so
overflows the byte and wraps modulo 256, turning white into 1.

### 6.2 Shape tests

Each sample is resolved as a stack of layers composited with source-over:

1. **Tile** — inside the rounded rectangle, with the linear gradient evaluated at the sample point.
   Outside it, the sample is transparent.
2. **Glow** — inside the tile only. The radial gradient's opacity is evaluated at the sample point
   and composited in `#1baf7a`.
3. **Track** — inside the annular band `|d − 39| ≤ 6.5` **and** inside the angular range
   150°–390° (interpreted modulo 360°), at white 22% opacity.
4. **Value** — inside the annular band `|d − 39| ≤ 6.5` **and** inside the angular range
   150°–294°, **or** within 6.5 of either cap centre, at full `#1baf7a`. The cap centres are
   (30.2, 83.5) at 150° and (79.9, 28.4) at 294°, both on the radius-39 circle.
5. **Knob** — within 7.5 of (79.9, 28.4), at full white.

The round caps are expressed as the union of the band and the two cap discs, which reproduces
`stroke-linecap: round` exactly.

### 6.3 Output

`renderIcon(size)` returns the PNG buffer. `size` defaults to 128. The module also exports the
palette and geometry constants so the test and the release gate can assert against the same source
of truth rather than against duplicated literals.

Writing the file stays behind a CLI guard, matching the pattern in `scripts/guard-fixtures.mjs`:
the module exports its functions and only writes when invoked directly.

## 7. Supporting changes

### 7.1 `npm run icon`

`package.json` gains an `icon` script that runs the generator. Today `scripts/make-icon.mjs` is
manual-only and is not reachable from any npm script, which makes the asset easy to lose or to
regenerate inconsistently.

### 7.2 `scripts/make-icon.test.ts`

A test following the existing `scripts/*.test.ts` pattern, importing the `.mjs` module directly:

- the output is a valid PNG signature
- the IHDR declares 128 × 128
- two renders are byte-identical, so the asset is deterministic
- the four corner pixels are fully transparent and the centre pixel is fully opaque, which
  proves the tile is full-bleed with rounded corners and that the rasteriser resolves both the
  corner curve and the gauge

### 7.3 Release gate

`scripts/release-gate.mjs` gains a check that `media/icon.png` exists and its IHDR declares
128 × 128. Nothing validates the icon today, so a mis-sized or truncated regeneration would ship
silently. The check reads the PNG header directly and does not need an image decoder.

### 7.4 Changelog

`CHANGELOG.md` gains an unreleased entry describing the icon redesign.

## 8. Verification

1. `npm run icon` regenerates `media/icon.png`.
2. `npm test` passes, including the new icon test.
3. `npm run typecheck` passes.
4. `node scripts/release-gate.mjs` passes with the icon check in place.
5. `npm run package` produces a `.vsix` containing the new icon and no stray dev files.
6. The generated icon is inspected at 128, 64, 48, 32 and 24px on both light and dark backgrounds,
   and confirmed to match the geometry in §5.

## 9. Acceptance criteria

1. `media/icon.png` is a 128 × 128 RGBA PNG matching the geometry in §5.
2. The icon renders the gauge dial of §5.3 with the value arc and knob legible at 24px.
3. The transparent corners are antialiased, with no stair-stepping.
4. No colour outside the §5.5 palette appears in the icon.
5. `npm run icon` reproduces the committed file byte for byte.
6. The release gate fails if the icon is missing or not 128 × 128.
7. The status bar, tooltip, dashboard, provider accents and gallery banner are unchanged.
