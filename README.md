# Pulse Feed 📡

My personal tech pulse. An automated pipeline scraped Hacker News, GitHub Trending, Reddit, RSS feeds, and newsletters every morning, then pushed the results here as static JSON. A vanilla JS frontend reads those files and renders them into a browsable, mobile-friendly feed.

No backend. No API. No framework. Just static files on GitHub Pages.

**Live:** https://vatsal28.github.io/pulse-feed/

## Status: parked

Pulse is parked for now. The GitHub Pages site stays live for archive browsing, but new feeds are not being generated and data may be stale.

To revive the public site behavior:

1. Re-enable the n8n Content Radar pipeline or replacement feed generator
2. Resume scheduled pushes of `index.json` and `data/raw-feed-YYYY-MM-DD.json`
3. Remove or update the parking notice in `index.html`
4. Bump `CACHE_VERSION` in `sw.js` so returning visitors receive the updated app shell

## How it works

1. The n8n pipeline runs daily at 8 AM UTC when active
2. It pulls content from ~20 sources, normalizes everything into a single JSON format
3. The JSON gets pushed to this repo
4. GitHub Pages serves the SPA, which reads the JSON client-side
5. Old data rolls off after 7 days when generation is active

## Stack

- Vanilla JS (zero dependencies, zero build step)
- CSS variables for dark/light theming
- GitHub Pages hosting
- Data pipeline: n8n + scheduled push scripts

## Data format

- `index.json` lists available dates and item counts
- `data/raw-feed-YYYY-MM-DD.json` contains each day's content (last 7 days)

## Sources

| Section | What gets pulled |
|---------|-----------------|
| Hacker News | Top 50 stories (score > 50) |
| GitHub | Trending repos across languages |
| Reddit | r/MachineLearning, r/LocalLLaMA, r/programming, r/technology, r/artificial |
| RSS | TechCrunch, ArXiv, Inc42, Techmeme, HuggingFace, OpenAI, Google AI, DeepMind |
| Newsletters | Rundown AI (via RSS) |

## Built by

[@cryptikcell](https://x.com/cryptikcell)
