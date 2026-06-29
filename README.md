# Prism Layer Calculator

A single-page tool for sizing CFD prism (boundary) layers, modeled as a
geometric series. Everything runs client-side in the browser — no build step,
no dependencies, no server.

## What it does

The prism stack is described by four quantities, related by a geometric series:

- **Near-wall layer thickness** `t₁` — height of the first cell at the wall
- **Stretch factor** `r` — growth ratio between consecutive layers
- **Number of prism layers** `n`
- **Mesh size**, expressed either as:
  - **Total thickness** `T` — combined height of all layers, or
  - **Near-core layer thickness** `t_n` — height of the last layer

The governing relation is:

```
T = t₁ · (rⁿ − 1) / (r − 1)        (and  t_n = t₁ · r^(n−1))
```

Pick the value you want computed with the `=` toggle, enter the others, and the
result updates live. Total and near-core layer thickness are interchangeable —
edit whichever you know and the other is derived automatically.

### Features

- Solve for any of: near-wall thickness, stretch factor, layer count, or mesh size
- Total ↔ near-core layer thickness handled as one "size" input (last edited wins)
- Per-field length units (m / mm) with automatic conversion
- Per-layer breakdown table (near-core → wall) with cumulative wall distance
- Stepper buttons for the layer count, snapping non-integer results to whole numbers
- Responsive layout: calculator and breakdown sit side by side on wide screens,
  stack on narrow ones

## Running locally

It's plain static files, so just open the page:

```sh
open index.html        # macOS
```

Or serve the folder if you prefer a local web server:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Deploying to GitHub Pages

The site is served straight from the repository root:

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Choose the `main` branch and the `/ (root)` folder, then **Save**.

The page will be published at `https://<user>.github.io/<repo>/`.

## Project layout

```
.
├── index.html   # markup + styles
├── app.js       # calculator logic
├── README.md
└── .gitignore
```
