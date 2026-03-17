# Pulse Feed 📡

My personal tech content radar. An automated pipeline scrapes Hacker News, GitHub Trending, Reddit, RSS feeds, and newsletters every morning, then pushes the results here as static JSON. A vanilla JS frontend reads those files and renders them into a browsable, mobile-friendly feed.

No backend. No API. No framework. Just static files on GitHub Pages.

**Live:** https://vatsal28.github.io/pulse-feed/

## How it works

1. An n8n pipeline runs daily at 8 AM UTC
2. It pulls content from ~20 sources, normalizes everything into a single JSON format
3. The JSON gets pushed to this repo
4. GitHub Pages serves the SPA, which reads the JSON client-side
5. Old data rolls off after 7 days

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
