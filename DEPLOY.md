# PIKABOO — Deployment Guide
### Frontend: InfinityFree · Backend: Render

---

## Overview

| Part | Host | Cost | URL pattern |
|---|---|---|---|
| React frontend | InfinityFree | Free | `https://pikaboo.rf.gd` |
| Node.js API | Render | Free | `https://pikaboo-api.onrender.com` |
| PostgreSQL DB | Render | Free | Attached to API automatically |

---

## Step 1 — Deploy the Backend on Render

### 1a. Push your code to GitHub

```bash
cd pikaboo-api
git init
git add .
git commit -m "initial pikaboo api"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/pikaboo-api.git
git push -u origin main
```

### 1b. Create the service on Render

1. Go to [render.com](https://render.com) → Sign up free
2. Click **New** → **Web Service**
3. Connect your GitHub repo (`pikaboo-api`)
4. Render detects `render.yaml` automatically — it pre-fills everything
5. Set these **Environment Variables** in the Render dashboard:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and paste the result |
| `CLIENT_URL` | Your InfinityFree URL, e.g. `https://pikaboo.rf.gd` |
| `DATABASE_URL` | Render fills this automatically once you add the DB (next step) |

### 1c. Add the PostgreSQL database

1. In Render dashboard → **New** → **PostgreSQL**
2. Name it `pikaboo-db`, plan: **Free**, region: **Frankfurt**
3. Once created, go to its **Info** tab → copy the **Internal Database URL**
4. Paste it as `DATABASE_URL` in your Web Service environment variables

### 1d. Deploy

Click **Deploy** — Render will:
- Install dependencies
- Compile TypeScript (`npm run build`)
- Copy `schema.sql` into `dist/db/`
- Run `node dist/start.js` which applies migrations then starts Express

**Your API is live at:** `https://pikaboo-api.onrender.com`

Test it: `https://pikaboo-api.onrender.com/health` should return `{"status":"ok"}`

> **Note:** Render free tier spins down after 15 minutes of inactivity.
> First request after sleep takes ~30 seconds. Upgrade to Starter ($7/mo) to keep it always on.

### 1e. Seed demo data (optional)

```bash
# From your local machine with the Render DATABASE_URL
DATABASE_URL="postgres://..." npm run db:seed
```

---

## Step 2 — Build the React Frontend

Update `.env.production` with your actual Render URL:

```
REACT_APP_API_URL=https://pikaboo-api.onrender.com/api
```

Then build:

```bash
cd pikaboo
npm run build
```

This creates a `build/` folder — that's what goes on InfinityFree.

---

## Step 3 — Upload to InfinityFree

### 3a. Create an InfinityFree account

1. Go to [infinityfree.com](https://infinityfree.com) → Sign up free
2. Create a hosting account — you get a free subdomain like `pikaboo.rf.gd`

### 3b. Upload the build folder

**Option A — File Manager (easiest):**
1. Log into InfinityFree → **Control Panel** → **File Manager**
2. Navigate to `htdocs/` (this is your web root)
3. **Delete** any placeholder `index.html` that's already there
4. Click **Upload** → select all files from your `build/` folder
5. Also upload the `.htaccess` file from `build/.htaccess`
   (it may be hidden — enable "Show hidden files" in File Manager)

**Option B — FTP (faster for large uploads):**
1. InfinityFree Control Panel → **FTP Accounts** → note the FTP host/user/pass
2. Use FileZilla (free): connect to the FTP host
3. Upload all contents of `build/` into `htdocs/`

### 3c. Verify the `.htaccess` is there

In File Manager, inside `htdocs/`, confirm `.htaccess` exists.
If it's missing, create a new file named `.htaccess` and paste:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

---

## Step 4 — Test Everything

1. Open `https://YOUR_SUBDOMAIN.rf.gd`
2. You should see the PIKABOO splash screen
3. Log in with: `demo@pikaboo.app` / `pikaboo123`
4. Check the browser console — API calls should go to `pikaboo-api.onrender.com`

### Common issues

| Problem | Fix |
|---|---|
| White screen on refresh | `.htaccess` not uploaded or not being read |
| API calls fail (CORS) | Set `CLIENT_URL` env var on Render to your exact InfinityFree URL |
| "Network Error" on login | Render free tier is sleeping — wait 30s and try again |
| Images not loading | Check `img/avatars/` folder is inside `htdocs/` |

---

## Step 5 — Future Deploys

After any code change:

```bash
# Rebuild frontend
cd pikaboo
npm run build
# Re-upload build/ to InfinityFree (overwrite files)

# Backend auto-deploys on git push to main
cd pikaboo-api
git add . && git commit -m "update" && git push
```

---

## Upgrading Later

When you outgrow the free tier:

| Service | Free → Paid | Benefit |
|---|---|---|
| Render API | Free → Starter $7/mo | No sleep, faster cold start |
| Render DB | Free → Starter $7/mo | More storage, backups |
| Frontend | InfinityFree → Netlify free | Instant deploys via `netlify deploy` |
| Media | None → AWS S3 | Real photo/video uploads |
| Real-time | None → Render + Socket.io | Live chat, notifications |
