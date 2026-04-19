# Deploy Seachtain

Single-file HTML prototype. Two ways to get it live on Vercel.

## Option A — Quickest: CLI push (5 min)

One-time setup on your machine:

```bash
cd "path/to/Teaching Platform"
npx vercel@latest login     # opens browser, pick your email
```

Deploy:

```bash
npx vercel@latest --prod
```

The first run asks a few questions:
- Set up and deploy? **Y**
- Which scope? Your personal account
- Link to existing project? **N** (first time)
- Project name: **seachtain** (or whatever)
- In which directory is your code? **./**
- Override settings? **N**

Subsequent deploys: just `npx vercel@latest --prod` again. Vercel picks up `vercel.json`, serves `app.html` at `/`, and returns a live URL.

## Option B — GitHub → Vercel auto-deploy

1. Create an empty GitHub repo (name it e.g. `seachtain`).
2. From this folder:
   ```bash
   git init
   git add app.html vercel.json .gitignore DEPLOY.md
   git commit -m "Initial prototype"
   git branch -M main
   git remote add origin https://github.com/<you>/seachtain.git
   git push -u origin main
   ```
3. Go to https://vercel.com/new, import that repo, click Deploy.
4. Every push to `main` now redeploys automatically. To ship changes: edit `app.html`, commit, push.

## What's in this folder

- `app.html` — the whole app (HTML + CSS + JS, stores everything in localStorage)
- `vercel.json` — routes `/` to `/app.html` and sets a couple of sensible headers
- `.gitignore` — keeps `.vercel/`, `node_modules/`, etc. out of git

## Custom domain

Once deployed, add a domain in the Vercel project **Settings → Domains**. Follow their DNS instructions (CNAME or A-record). Usually live in ~5 minutes.
