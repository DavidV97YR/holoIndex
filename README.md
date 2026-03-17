# holoIndex

A single-page web app for tracking Hololive talent birthdays, debut anniversaries, and events — with live countdowns, a multi-year archive, and full offline support via PWA.

![HTML](https://img.shields.io/badge/HTML-96.3%25-e34c26?style=flat-square) ![JavaScript](https://img.shields.io/badge/JavaScript-3.7%25-f1e05a?style=flat-square) [![GitHub Pages](https://img.shields.io/badge/deployed-GitHub%20Pages-brightgreen?style=flat-square)](https://davidv97yr.github.io/holoIndex/)

---

## Features

- **4 views** — Monthly grid, Timeline, Upcoming, and Weekly
- **Live countdowns** — Second-level ticking for events within 7 days
- **Birthday & Debut tracking** — Handles same-day birthday+debut, debut-only rows, and birthday-only rows
- **Branch filtering** — JP / EN / ID / DEV_IS / Events
- **Search** — Filter by name, generation, or branch
- **Multi-year archive** — 2023–2026, switchable via year buttons
- **Detail modal** — Avatar, info rows, and live countdown per talent or event
- **Day modal** — Click any calendar cell to see all entries on that date
- **Local + JST clocks** — Sticky clock bar always visible
- **PWA** — Installable, fully offline via service worker with CSV caching
- **Starfield background** — Canvas-based, 24fps-capped, battery-friendly

---

## Data Sources

All data is pulled live from Google Sheets published as CSV:

| Sheet | Contents |
|---|---|
| Talent sheet | All talent: name, birthday, debut date, branch, generation, avatar URL, emoji |
| Year sheets (2023–2026) | Events per year: name, date, category, region, image URL |

Data is fetched in parallel on load and cached by the service worker for offline use.

---

## Project Structure

```
holoIndex/
├── index.html       # Entire app — HTML, CSS, and JS in one file
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (offline + CSV caching)
├── favicon.ico      # Site icon
└── icons/           # PWA icons (icon-192.png, etc.)
```

---

## Deployment

The app is deployed via **GitHub Pages** from the `main` branch root. Any push to `main` automatically redeploys.

Live URL: **https://davidv97yr.github.io/holoIndex/**

---

## Architecture Notes

- **No framework, no build toolchain** — vanilla JS, single HTML file
- **Dirty-check render keys** — views only re-render when filter state actually changes
- **Memoized parsing** — `parseMMDD` and `daysUntil` results are cached to avoid redundant computation on large datasets
- **IntersectionObserver lazy loading** — month card entry rows are rendered only as they scroll into view
- **Single-pass data grouping** — all 12 months are pre-grouped in one pass over the data rather than 24+ separate filter calls
- **Cached DOM refs** — all frequently-accessed elements (overlays, panes, clocks, filter buttons) are queried once at startup
- **Shared Intl formatters** — `Intl.DateTimeFormat` instances are module-level constants, not re-instantiated per render
- **O(1) day modal lookup** — a pre-built `Map` keyed by `"month-day"` replaces per-tap data filtering

---

## License

Personal project. Data sourced from publicly available Hololive information.
