# Popovichfit static video library

A very simple static site for GitHub Pages.

## What is included

- `index.html` — the app page
- `styles.css` — styles
- `app.js` — login, filters, rendering
- `users.js` — hardcoded users in a separate file
- `data/source-*.json` — source data files
- `data/catalog.json` — generated catalog used by the site
- `scripts/build.py` — generator script for future files

## Default users

Change them in `users.js`.

```js
window.APP_USERS = [
  { username: 'admin', password: 'admin123', displayName: 'Administrator' },
  { username: 'demo', password: 'demo123', displayName: 'Demo User' }
];
```

## How to add more files later

1. Put a new JSON file into `data/` with a name like `source-something.json`.
2. Keep the same shape as the current file (`trainings`, `extras`, `subfolders`).
3. Run:

```bash
python3 scripts/build.py
```

4. Commit updated `data/catalog.json` and push to GitHub Pages.

## Local preview

Because the site uses `fetch()`, open it through a local server instead of double-clicking the file.

```bash
cd popovichfit-site
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy to GitHub Pages

1. Create a GitHub repo.
2. Upload all files from this folder.
3. In GitHub: **Settings → Pages**.
4. Source: **Deploy from a branch**.
5. Branch: `main` and folder `/ (root)`.
6. Save.

GitHub Pages will publish the site after the push.
