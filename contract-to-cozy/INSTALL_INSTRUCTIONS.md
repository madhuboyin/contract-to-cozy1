# Installation Instructions - Phase 1 Color Update

## 🚀 Step-by-Step Installation

### Prerequisites
- Access to Contract to Cozy repository
- Node.js and npm installed
- Git (for version control)

### Step 1: Navigate to Project Root
```bash
cd /path/to/contract-to-cozy
```

### Step 2: Place Update Package
```bash
# Move the phase1-color-update folder to project root
# Should be at: contract-to-cozy/phase1-color-update/
```

### Step 3: Run Automated Deployment
```bash
# Make the script executable (if not already)
chmod +x phase1-color-update/deploy.sh

# Run deployment
./phase1-color-update/deploy.sh
```

The script will:
1. ✅ Create backups of current files
2. ✅ Copy new CSS and Tailwind config
3. ✅ Rebuild the frontend
4. ✅ Confirm completion

### Step 4: Test Locally
```bash
cd apps/frontend
npm run dev
```

Visit `http://localhost:3000` and verify:
- Buttons are teal
- Links are teal
- Footer is dark
- Hover states work

### Step 5: Deploy to Production
```bash
# If tests pass, deploy using your normal process
make deploy-pi
# Or your custom deployment command
```

## 📋 Alternative: Manual Installation

If you prefer manual control:

```bash
# 1. Backup
cp apps/frontend/src/app/globals.css apps/frontend/src/app/globals.css.backup
cp apps/frontend/tailwind.config.js apps/frontend/tailwind.config.js.backup

# 2. Copy files
cp phase1-color-update/globals.css apps/frontend/src/app/globals.css
cp phase1-color-update/tailwind.config.js apps/frontend/tailwind.config.js

# 3. Clear cache and rebuild
rm -rf apps/frontend/.next
cd apps/frontend
npm run build

# 4. Test
npm run dev
```

## 🔍 Verification Steps

### Visual Verification
1. Open landing page
2. Check hero buttons are teal (#009688)
3. Hover over buttons - should be light teal (#4DB6AC)
4. Check footer background is dark slate (#263238)
5. Click through all pages

### Code Verification
```bash
# Check CSS variables are updated
grep "color-primary" apps/frontend/src/app/globals.css

# Should show:
# --color-primary: 174 100% 29%;  /* #009688 */
```

### Browser Cache
```bash
# Clear browser cache or use incognito
# Force refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
```

## 🔄 Rollback Procedure

If you need to revert:

```bash
# Restore backups
cp apps/frontend/src/app/globals.css.backup apps/frontend/src/app/globals.css
cp apps/frontend/tailwind.config.js.backup apps/frontend/tailwind.config.js

# Rebuild
cd apps/frontend
rm -rf .next
npm run build
npm run dev
```

## 🐛 Troubleshooting

### Issue: Colors not updating
**Solution:**
```bash
# Clear Next.js cache
rm -rf apps/frontend/.next
# Rebuild
npm run build
# Hard refresh browser: Cmd+Shift+R
```

### Issue: Build errors
**Solution:**
```bash
# Check Node.js version (should be 20+)
node --version

# Reinstall dependencies
cd apps/frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Styles conflict
**Solution:**
```bash
# Ensure no other CSS overrides
# Check for hardcoded colors in components
grep -r "#2563EB" apps/frontend/src/
# Should return no results (old blue color)
```

## 📊 Post-Deployment Checklist

- [ ] Automated deployment completed successfully
- [ ] Local testing passed
- [ ] All pages verified visually
- [ ] Mobile responsive maintained
- [ ] Browser compatibility confirmed
- [ ] Production deployment completed
- [ ] Backups created and saved
- [ ] Documentation updated

## 🎓 Understanding the Changes

### What got updated?
1. **globals.css**: All CSS variables changed to teal palette
2. **tailwind.config.js**: Blue classes remapped to teal

### What automatically updates?
- All buttons using `bg-blue-*`
- All links using `text-blue-*`
- All borders using `border-blue-*`
- Focus states using `ring-blue-*`
- shadcn/ui components using `primary`

### What stays the same?
- Component structure
- HTML markup
- JavaScript logic
- Layout and spacing
- Typography
- Animations

## 📞 Need Help?

1. Check **PHASE1_COLOR_MIGRATION.md** for detailed documentation
2. Check **COLOR_COMPARISON.md** for visual examples
3. Review **QUICK_SUMMARY.md** for overview
4. Contact project maintainer if issues persist

---

**Estimated Time:** 5-10 minutes  
**Difficulty:** Easy  
**Rollback Time:** 2 minutes
