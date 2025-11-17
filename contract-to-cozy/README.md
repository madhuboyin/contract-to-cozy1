# Phase 1 Color Update Package

This package contains all files needed to update Contract to Cozy to the new teal color scheme.

## 📦 Package Contents

1. **globals.css** - Updated CSS variables and utility classes
2. **tailwind.config.js** - Updated Tailwind configuration with teal mappings
3. **PHASE1_COLOR_MIGRATION.md** - Complete documentation and testing guide
4. **deploy.sh** - Automated deployment script
5. **README.md** - This file

## 🚀 Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Place this folder in your project root as 'phase1-color-update'
mv phase1-color-update /path/to/contract-to-cozy/

# 2. Run the deployment script
cd /path/to/contract-to-cozy
./phase1-color-update/deploy.sh
```

### Option 2: Manual Deployment

```bash
# 1. Backup existing files
cp apps/frontend/src/app/globals.css apps/frontend/src/app/globals.css.backup
cp apps/frontend/tailwind.config.js apps/frontend/tailwind.config.js.backup

# 2. Copy new files
cp phase1-color-update/globals.css apps/frontend/src/app/globals.css
cp phase1-color-update/tailwind.config.js apps/frontend/tailwind.config.js

# 3. Rebuild
cd apps/frontend
npm run build

# 4. Test
npm run dev
```

## 🎨 What This Updates

- ✅ All primary buttons → Teal (#009688)
- ✅ All hover states → Light teal (#4DB6AC)
- ✅ All links → Teal
- ✅ Footer background → Dark (#263238)
- ✅ Focus states → Teal rings
- ✅ All blue-* Tailwind classes → Teal equivalents

## 📋 Testing Checklist

After deployment:

- [ ] Landing page displays correctly
- [ ] All buttons are teal
- [ ] Links are teal and change to light teal on hover
- [ ] Footer has dark background
- [ ] Dashboard pages work correctly
- [ ] Forms and inputs have proper focus states
- [ ] Mobile responsive design maintained

## 🔄 Rollback

If you need to revert:

```bash
cp apps/frontend/src/app/globals.css.backup apps/frontend/src/app/globals.css
cp apps/frontend/tailwind.config.js.backup apps/frontend/tailwind.config.js
cd apps/frontend && npm run build
```

## 📚 Documentation

See **PHASE1_COLOR_MIGRATION.md** for:
- Complete color palette details
- Detailed file changes
- Comprehensive testing guide
- Troubleshooting tips
- WCAG contrast ratios

## ⚠️ Important Notes

- **Phase 1 ONLY updates colors** - No layout, typography, or spacing changes
- All changes are backward compatible
- Components using hardcoded colors will automatically update through Tailwind
- CSS variables ensure consistency across all components

## 🆘 Support

Issues? Check:
1. PHASE1_COLOR_MIGRATION.md (this package)
2. PROJECT_STATUS_v1_3_0.md (project root)
3. Clear browser cache and rebuild

---

**Version:** 1.0  
**Date:** November 16, 2025  
**Phase:** 1 - Color Scheme Update
