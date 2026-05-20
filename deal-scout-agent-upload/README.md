# Deal Scout Agent

This is your first price-comparison agent. It has two modes:

1. Manual mode: open `index.html`, search with the shortcut links, paste listings into the app, and let it rank the best deal.
2. Auto Search mode: run the local server and connect a search API so the app can look up listings for you.

## How to edit it

- `index.html`: the page structure and text.
- `styles.css`: colors, spacing, layout, and visual design.
- `app.js`: the deal-ranking logic.
- `server.py`: the backend that can call search APIs without exposing private keys in the browser.
- `.env`: your private API key. Do not share this file.

Good beginner edits:

- Change the scoring formula in `scoreListing()` inside `app.js`.
- Add more stores in `renderSearchLinks()` inside `app.js`.
- Change the trust scores in `trust_for_store()` inside `server.py`.
- Change the colors at the top of `styles.css`.
- Use the Agent Settings sliders in the app to tune ranking without editing code.

## How to run the current app

Manual mode works by opening `index.html` directly in your browser.

## How to turn on Auto Search

You need a SerpAPI key because Google Shopping does not let normal browser JavaScript safely scrape results.

1. Create a SerpAPI account and copy your API key.
2. Make a file named `.env` in this folder.
3. Put this inside `.env`, replacing the fake value with your real key:

```text
SERPAPI_API_KEY=paste-your-key-here
```

4. In Terminal, go to this folder and run:

```bash
python3 server.py
```

5. Open:

```text
http://localhost:8000
```

6. Type a product name like `Hollister graphic t-shirt` and press `Auto Search`.

## Why this needs a backend

If you put an API key directly in browser JavaScript, anyone can see and steal it. `server.py` keeps the key on your computer and lets the webpage ask your own local server for search results.

## Next upgrades

- Add the eBay Browse API for better eBay prices.
- Add an OpenAI call to judge whether a listing is actually the same product.
- Save past searches in a small database.
- Add price-drop alerts.

## How to share it

Do not share your `.env` file. It contains your private SerpAPI key.

For friends on the same Wi-Fi:

1. Run `python3 server.py`.
2. Find your computer's local IP address.
3. Have them open `http://your-ip-address:8000`.

For people on the internet, deploy the project to a host like Render, Railway, or Fly.io. Set `SERPAPI_API_KEY` as a private environment variable on the host. The app reads the host's `PORT` automatically.

See `SHARE.md` for the step-by-step sharing guide.
