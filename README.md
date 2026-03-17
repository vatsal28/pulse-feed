# Pulse Feed

A personal content radar — a daily-updated SPA that aggregates tech content from Hacker News, GitHub Trending, Reddit, RSS feeds, and newsletters into a clean, mobile-friendly feed.

**Live site:** https://vatsal28.github.io/pulse-feed/

## What it is

Pulse is a read-only news aggregator built as a static GitHub Pages site. Content is fetched daily by an automated pipeline and pushed as JSON files. The SPA reads these files directly — no backend, no API, just static files.

## Stack

- Vanilla JS SPA (no framework, no build step)
- CSS with CSS variables for theming
- GitHub Pages for hosting
- JSON data files updated daily via automated push

## Data

- `index.json` — manifest of available dates and item counts
- `raw-feed-YYYY-MM-DD.json` — daily feed data (last 7 days retained)

## Sources

| Section | Sources |
|---------|---------|
| Hacker News | HN Top Stories API |
| GitHub | GitHub Trending (unofficial) |
| Reddit | r/MachineLearning, r/LocalLLaMA, r/programming, r/technology, r/artificial |
| RSS | TechCrunch, ArXiv, Inc42, Techmeme, HuggingFace Blog, OpenAI, Google Blog, DeepMind |
| Newsletters | Rundown AI |
