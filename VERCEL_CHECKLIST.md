# Vercel Deployment Checklist

This checklist guides you through deploying to Vercel step-by-step.

## 🔍 Pre-Flight Checks (Run Locally First)

### Build Validation

```bash
# Clear previous builds
rm -rf dist node_modules

# Install dependencies
bun install

# Type check
npx tsc --noEmit
# Expected: No output (no errors)

# Build
bun run build
# Expected: ✓ built in X seconds

# Verify SPA files exist
ls dist/public/client/index.html
ls dist/public/client/assets/
# Expected: Files found
```

### Verification Script

```bash
#!/bin/bash
echo "🔍 Pre-deployment checks..."

echo "✓ TypeScript check..."
npx tsc --noEmit || exit 1

echo "✓ Building..."
bun run build || exit 1

echo "✓ Checking SPA entry point..."
if [ -f "dist/public/client/index.html" ]; then
  echo "  ✅ index.html found"
else
  echo "  ❌ index.html NOT found"
  exit 1
fi

echo "✓ Checking assets..."
if [ -d "dist/public/client/assets" ]; then
  echo "  ✅ assets directory found"
  echo "  📦 Files: $(ls dist/public/client/assets | wc -l)"
else
  echo "  ❌ assets directory NOT found"
  exit 1
fi

echo "✓ Checking configuration files..."
[ -f "vercel.json" ] && echo "  ✅ vercel.json" || (echo "  ❌ vercel.json missing" && exit 1)
[ -f ".vercelignore" ] && echo "  ✅ .vercelignore" || (echo "  ❌ .vercelignore missing" && exit 1)

echo ""
echo "✅ All pre-flight checks passed!"
echo ""
echo "Ready to deploy!"
```

## 📋 Step-by-Step Deployment

### 1. Verify Configuration Files

**vercel.json:**

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist/public/client",
  "framework": "vite"
  // ... (rewrites, headers, env)
}
```

✅ Check: File exists with correct `outputDirectory`

**.vercelignore:**

```
wrangler.jsonc
wrangler.lock
.env
# ... (other ignored files)
```

✅ Check: File exists and is not empty

**package.json:**
✅ Check: No `"@cloudflare/vite-plugin"` in dependencies

**vite.config.ts:**
✅ Check: Does NOT import Cloudflare config

### 2. Get Firebase Credentials

Go to: https://console.firebase.google.com

- Select your project
- ⚙️ Settings → Project Settings
- Tab: General
- Find: `const firebaseConfig = { ... }`

**Copy these values:**

```javascript
VITE_FIREBASE_API_KEY = apiKey;
VITE_FIREBASE_AUTH_DOMAIN = authDomain;
VITE_FIREBASE_PROJECT_ID = projectId;
VITE_FIREBASE_STORAGE_BUCKET = storageBucket;
VITE_FIREBASE_MESSAGING_SENDER_ID = messagingSenderId;
VITE_FIREBASE_APP_ID = appId;
```

### 3. Push to GitHub

```bash
git add .
git commit -m "feat: Configure for Vercel SPA deployment

- Remove Cloudflare configuration
- Update vite.config.ts for SPA mode
- Configure vercel.json with proper routing
- Add deployment documentation"

git push origin main
```

### 4. Create Vercel Project

**Option A: Using Vercel Dashboard**

1. Go to https://vercel.com
2. Sign in or create account
3. Click "Add New..." → "Project"
4. Select your repository
5. Click "Import"

**Option B: Using Vercel CLI**

```bash
npm install -g vercel
vercel link
vercel
```

### 5. Set Environment Variables

**In Vercel Dashboard:**

1. Go to your project
2. Click "Settings"
3. Click "Environment Variables"
4. Add each variable:

| Name                                | Value           |
| ----------------------------------- | --------------- |
| `VITE_FIREBASE_API_KEY`             | [from Firebase] |
| `VITE_FIREBASE_AUTH_DOMAIN`         | [from Firebase] |
| `VITE_FIREBASE_PROJECT_ID`          | [from Firebase] |
| `VITE_FIREBASE_STORAGE_BUCKET`      | [from Firebase] |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | [from Firebase] |
| `VITE_FIREBASE_APP_ID`              | [from Firebase] |

✅ Check: All 6 variables added
✅ Check: No typos in names (must start with `VITE_`)

### 6. Trigger Deployment

**Option A: Automatic**

- Push to `main` branch (configured during import)
- Vercel automatically deploys

**Option B: Manual**

- Go to Deployments tab
- Click "Deploy" on latest commit

**Wait for:**

- ✅ Build: [Bun build command runs]
- ✅ Install: [Dependencies installed]
- ✅ Build Output: [Vite builds SPA]
- ✅ Deploy: [Files deployed to CDN]
- ✅ Live: [Ready for traffic]

### 7. Test Deployment

**Test URL Patterns:**

```bash
# Your domain (replace with actual domain)
DOMAIN="https://your-project.vercel.app"

# Test routes
echo "Testing $DOMAIN"
curl -I $DOMAIN/                          # Should return 200 with index.html
curl -I $DOMAIN/dashboard                 # Should return 200 (rewritten to index.html)
curl -I $DOMAIN/dashboard/tasks           # Should return 200 (rewritten to index.html)
curl -I $DOMAIN/dashboard/customers       # Should return 200
curl -I $DOMAIN/assets/example.js         # Should return 200 (actual asset)
```

**Visual Test:**

1. Open https://your-project.vercel.app
2. Verify app loads
3. Check Network tab: No 404 errors
4. Test navigation: Click dashboard links
5. Test Firebase: Login, view data, etc.

---

## 🚨 Common Issues & Solutions

### Issue: Build Fails - "Command bun not found"

**Cause:** Vercel using npm instead of Bun  
**Solution:**

1. In Vercel Dashboard, go to Settings → Build & Development
2. Change package manager to Bun (or set `NODE_ENV=production` + use `npm`)

### Issue: Routes Return 404

**Cause:** `vercel.json` not properly configured  
**Solution:**

1. Check `vercel.json` exists in root
2. Verify `outputDirectory` is `dist/public/client`
3. Verify `rewrites` includes `"/(.*)" → "/index.html"`
4. Redeploy

### Issue: Firebase Variables Not Found

**Cause:** Variables not set or typo in name  
**Solution:**

1. Check Vercel Dashboard → Settings → Environment Variables
2. Verify all 6 variables present
3. Verify names start with `VITE_` (exact match)
4. Redeploy from Deployments tab

### Issue: CSS/Styling Broken

**Cause:** Tailwind CSS not loaded  
**Solution:**

1. Check build includes `tailwindcss` in dependencies
2. Verify `dist/public/client/assets/` has CSS file
3. Check Network tab for CSS loading
4. Clear browser cache (Ctrl+Shift+Delete)

### Issue: "Module not found" Errors in Console

**Cause:** Missing dependency or import path issue  
**Solution:**

1. Run locally: `bun run build` to reproduce
2. Check import paths in error message
3. Verify dependency in `package.json`
4. Check for circular dependencies

---

## 🔄 Re-deployment & Updates

### After Code Changes

```bash
# Test locally
bun run build
bun run preview

# Deploy
git add .
git commit -m "fix: description of changes"
git push origin main
# Vercel auto-deploys
```

### After Environment Variable Changes

```bash
# Update in Vercel Dashboard
# Go to Deployments → Redeploy latest commit
# Or push empty commit: git commit --allow-empty -m "redeploy"
```

### Rollback to Previous Deployment

1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "..." menu → "Promote to Production"

---

## 📊 Monitoring

### View Logs

- **Build logs:** Deployments tab → Click deployment → Logs
- **Runtime logs:** Click deployment → View Runtime Logs

### Check Deployment Status

```bash
# Using Vercel CLI
vercel --prod   # Deploy to production
vercel list     # List all deployments
```

### Performance Metrics

- Vercel Dashboard → Analytics tab
- Check: Page load times, edge requests, regions

---

## ✅ Verification Checklist

After deployment goes live:

- [ ] https://your-project.vercel.app loads without errors
- [ ] All routes work (dashboard, tasks, customers, etc.)
- [ ] Browser console has no 404 errors
- [ ] Firebase authentication works (login screen)
- [ ] Firestore data loads properly
- [ ] File uploads work (if applicable)
- [ ] Analytics/reports load
- [ ] Mobile responsive design works
- [ ] Performance is acceptable (<3s initial load)
- [ ] Environment variables loaded correctly

---

## 🎉 Success!

Your app is now live on Vercel with:

- ✅ Automatic HTTPS
- ✅ Global CDN distribution
- ✅ Serverless deployment
- ✅ Zero-downtime deployments
- ✅ Automatic rollback on failure
- ✅ Git-based workflow

**Share your deployment:**

- Production URL: `https://your-project.vercel.app`
- Visit Vercel Dashboard to share team access
