# Ideas

## Bhoomi Lens: land intelligence for India

[`bhoomi-lens/`](bhoomi-lens) is an interactive map of India that does four things:

- Shows indicative modelled prices across 820 districts.
- Explores assumed infrastructure scenarios and price paths.
- Displays heuristic risk and opportunity scores for each district.
- Lets you draw any area or simulate a new airport, metro or expressway.

It runs in the browser with an internet connection for the map. From this directory, run `python3 -m http.server 8000 --directory bhoomi-lens` and open `http://localhost:8000/`. Estimates, forecast bands and scores have not been validated for plot-level decisions.

**App:** https://hasen1506.github.io/Ideas/bhoomi-lens/ — deployed with GitHub Pages from `main` and `/ (root)`.

See [bhoomi-lens/README.md](bhoomi-lens/README.md) for the full feature list and how the model works.
