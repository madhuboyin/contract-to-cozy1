#!/bin/bash
# Phase 1 Color Update Deployment Script
# Contract to Cozy

echo "🎨 Phase 1 Color Update - Deployment Script"
echo "==========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "apps/frontend" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

echo "📦 Step 1: Creating backups..."
cp apps/frontend/src/app/globals.css apps/frontend/src/app/globals.css.backup
cp apps/frontend/tailwind.config.js apps/frontend/tailwind.config.js.backup
echo "✅ Backups created"
echo ""

echo "📝 Step 2: Applying new color scheme..."
cp phase1-color-update/globals.css apps/frontend/src/app/globals.css
cp phase1-color-update/tailwind.config.js apps/frontend/tailwind.config.js
echo "✅ Files updated"
echo ""

echo "🔨 Step 3: Rebuilding..."
cd apps/frontend
npm run build
echo "✅ Build complete"
echo ""

echo "✅ Phase 1 Color Update Applied Successfully!"
echo ""
echo "📋 Next Steps:"
echo "  1. Test locally: npm run dev"
echo "  2. Review all pages for color consistency"
echo "  3. Deploy to production when ready"
echo ""
echo "🔄 To rollback:"
echo "  cp apps/frontend/src/app/globals.css.backup apps/frontend/src/app/globals.css"
echo "  cp apps/frontend/tailwind.config.js.backup apps/frontend/tailwind.config.js"
echo "  cd apps/frontend && npm run build"
