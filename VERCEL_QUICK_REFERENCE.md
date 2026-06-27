# Vercel Deployment - Quick Reference Card

## 🎯 One-Pager for Team

### Status: ✅ READY FOR VERCEL

---

## 📋 Changed Files

| File                 | Change                               | Why                                        |
| -------------------- | ------------------------------------ | ------------------------------------------ |
| `vite.config.ts`     | Removed Cloudflare, added SPA config | Build for Vercel SPA instead of CF Workers |
| `package.json`       | Removed `@cloudflare/vite-plugin`    | Not needed for Vercel                      |
| `vercel.json`        | Complete rewrite                     | SPA routing + Firebase env vars            |
| `.vercelignore`      | NEW                                  | Skip unnecessary files during build        |
| `.vercelenv.example` | NEW                                  | Document Firebase env variables            |

---

## 🚀 Deploy in 5 Minutes

### 1. Get Firebase Credentials (2 min)

```
Firebase Console → Your Project → Settings → Project Settings
Copy: API Key, Auth Domain, Project ID, Storage Bucket, Sender ID, App ID
```

### 2. Push to GitHub (1 min)

```bash
git add .
git commit -m "feat: Vercel SPA deployment"
git push origin main
```

### 3. Connect Vercel (1 min)

- https://vercel.com → Add Project → Select repo

### 4. Set Environment Variables (30 sec)

```
Vercel Dashboard → Settings → Environment Variables
Add 6 Firebase variables from step 1
```

### 5. Deploy (30 sec)

- Vercel auto-deploys on push
- Or click "Deploy" in Deployments tab

✅ **Done!** App live at `https://your-project.vercel.app`

---

## ✅ Verify Deployment

```bash
# Test homepage
https://your-project.vercel.app

# Test routes (all should work)
https://your-project.vercel.app/dashboard
https://your-project.vercel.app/dashboard/tasks
https://your-project.vercel.app/dashboard/customers

# Browser console should have NO 404 errors
# Check: Network tab for all green ✅
```

---

## 🚨 Common Issues

| Issue                         | Solution                                             |
| ----------------------------- | ---------------------------------------------------- |
| **404 on routes**             | Check `vercel.json` exists, verify `outputDirectory` |
| **Firebase vars not working** | All 6 variables added? Names start with `VITE_`?     |
| **CSS broken**                | Clear browser cache (Ctrl+Shift+Delete)              |
| **Build fails**               | Run locally: `bun run build` to debug                |

---

## 📚 Full Documentation

| Document                          | For                                       |
| --------------------------------- | ----------------------------------------- |
| `VERCEL_DEPLOYMENT.md`            | Complete guide & architecture decisions   |
| `VERCEL_CHECKLIST.md`             | Step-by-step deployment + troubleshooting |
| `VERCEL_CONFIGURATION_SUMMARY.md` | All changes explained                     |

---

## 🔄 After Deployment

### Update Code

```bash
git push origin main
# Vercel auto-deploys ✅
```

### Update Env Vars

```
Vercel Dashboard → Environment Variables → Save
Then: Deployments → Redeploy latest
```

### Rollback

```
Vercel Dashboard → Deployments → Previous deployment → Promote
```

---

## 💡 Key Facts

✅ **SPA Mode**: All routing client-side (React Router)  
✅ **Firebase Only**: No backend server needed  
✅ **Static Deployment**: Served from global CDN  
✅ **Zero Config**: Vercel handles HTTPS, caching, optimization  
✅ **Build Time**: ~14 seconds (Vite optimized)  
✅ **Routes**: All work (/, /dashboard, /dashboard/tasks, etc.)

---

**Start deployment:** Follow `VERCEL_CHECKLIST.md`
