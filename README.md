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

All data is maintained in two Google Sheets workbooks published as CSV and fetched on page load.

### Talents sheet — 82 rows

One row per talent. Used across all years since birthdays and debut anniversaries recur annually.

| Column | Description |
|---|---|
| `Name` | Talent display name |
| `Birthday` | Format `MM/DD` |
| `Generation` | e.g. Gen 0, Myth, Promise |
| `Branch` | JP / EN / ID / DEV_IS |
| `Emoji` | Fallback emoji if no avatar |
| `AvatarURL` | Profile image URL |
| `ImageURL` | Full portrait URL (shown in detail modal) |
| `DebutDate` | Format `MM/DD/YYYY` |
| `Type` | Always `birthday` |

### Events sheets — one sheet per year (2023–2026)

Each sheet covers one calendar year. Current row counts: 4 (2023), 4 (2024), 4 (2025), 6 (2026).

| Column | Description |
|---|---|
| `Name` | Event display name |
| `Date` | Format `MM/DD` |
| `Category` | e.g. Expo, Fes. |
| `Region` | Target branch (e.g. All, JP) |
| `Emoji` | Fallback emoji |
| `AvatarURL` | Event thumbnail URL |
| `ImageURL` | Full event image URL |
| `Type` | Always `event` |

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
