# CueCut Deployment Guide

## Option 1: Vercel (Recommended - 5 minutes)

### Step 1: Sign Up for Vercel

1. Go to https://vercel.com/signup
2. Click "Continue with GitHub" (easiest)
3. Or create account directly

### Step 2A: Deploy via GitHub (Recommended)

```bash
# From the project folder
cd /Users/ericfrintu/music257final

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/cuecut.git
git branch -M main
git push -u origin main
```

Then:
1. Go to https://vercel.com/new
2. Select "Import Git Repository"
3. Paste your GitHub repo URL
4. Click "Deploy"
5. ✅ You'll get a public HTTPS URL instantly (e.g., `https://cuecut.vercel.app`)

### Step 2B: Deploy via Drag & Drop (No GitHub needed)

1. Go to https://vercel.com/new
2. Select "Other" or "Get started"
3. Drag and drop the `/Users/ericfrintu/music257final` folder
4. Click "Deploy"
5. ✅ Done! Get public URL

---

## Option 2: Netlify

### Step 1: Sign Up

Go to https://app.netlify.com and click "Sign up"

### Step 2: Deploy

1. Drag and drop `/Users/ericfrintu/music257final` folder into Netlify
2. Or connect your GitHub repo
3. ✅ Get public HTTPS URL (e.g., `https://cuecut-yourname.netlify.app`)

---

## Option 3: GitHub Pages

### Step 1: Create GitHub Repo

```bash
cd /Users/ericfrintu/music257final
git remote add origin https://github.com/YOUR_USERNAME/cuecut.git
git push -u origin main
```

### Step 2: Enable Pages

1. Go to your repo on GitHub
2. Settings → Pages
3. Select "Deploy from a branch"
4. Choose `main` branch
5. ✅ URL: `https://YOUR_USERNAME.github.io/music257final`

---

## Add to Meta Ray-Ban Display Glasses

Once you have a public HTTPS URL:

1. **On your phone**, open the **Meta AI app**
2. Go to **Devices** or **Wearables**
3. Select **Ray-Ban Display**
4. Tap **Add Web App** or **Browser**
5. Paste your Vercel/Netlify/GitHub Pages URL
6. Save
7. **On the glasses**, navigate to the app from the app menu
8. Use **D-Pad** to navigate and **Select** to activate

---

## Testing After Deployment

Once deployed, test:

1. ✅ App loads at public URL
2. ✅ All screens display correctly
3. ✅ Keyboard/D-pad navigation works
4. ✅ Start Session works
5. ✅ Cue displays and plays audio
6. ✅ Timing capture works
7. ✅ Export CSV works
8. ✅ Settings persist after reload
9. ✅ Responsive on 600×600 viewport (test in browser DevTools)

---

## Troubleshooting Deployment

**Q: "Can't find my GitHub repo"**
- Make sure you pushed to GitHub: `git push -u origin main`
- Check that repo is public or Vercel has access

**Q: "Vercel says 'not a valid project'"**
- This is normal for static sites. It should still deploy.
- If stuck, use drag-and-drop instead

**Q: "Motion sensor doesn't work"**
- Must be HTTPS (all three options provide this)
- Browser must grant DeviceMotion permission
- Works best on actual phone/glasses, not desktop

**Q: "Where do I get my public URL?"**
- Vercel: Shows after deployment completes
- Netlify: Shows in dashboard
- GitHub Pages: `https://username.github.io/cuecut`

---

## Quick Reference: Already-Configured Files

These files are already in place for deployment:

- `vercel.json` — Tells Vercel how to serve the app (static)
- `.gitignore` — Excludes unnecessary files from Git
- `index.html`, `styles.css`, `app.js` — All static files, no build needed

Just push/upload and you're done!

---

## Environment Variables

**Note**: CueCut doesn't need any environment variables. Everything runs in the browser locally (localStorage).

No API keys, backend URLs, or auth tokens required.

---

## Performance & CDN

- Vercel: Global CDN, ~100ms response time worldwide
- Netlify: Global CDN, similar performance
- GitHub Pages: GitHub's CDN, slightly slower in some regions

Recommendation: **Use Vercel for best performance.**

---

## Custom Domain (Optional)

Once deployed:

- Vercel: Settings → Domains → Add custom domain
- Netlify: Domain management → Add domain

Example: `cuecut.myname.com` → Points to Vercel deployment

---

**Status**: Ready to deploy! Choose one option above and you'll have a public HTTPS URL in minutes.
