#!/bin/bash

# Pre-Deployment File Verification
# Run this BEFORE building Docker images to ensure files are in correct locations

echo "=================================================="
echo "Pre-Deployment File Location Check"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MISSING_FILES=0

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅${NC} $description"
    else
        echo -e "${RED}❌${NC} $description"
        echo "   Missing: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
}

echo "Checking Backend Files..."
echo "========================="
check_file "apps/backend/src/community/types/community.types.ts" "Backend Types"
check_file "apps/backend/src/community/utils/categorizeEvent.ts" "Event Categorization Utility"
check_file "apps/backend/src/community/providers/ticketmaster.provider.ts" "Updated Ticketmaster Provider"
check_file "apps/backend/src/community/providers/trashSchedule.provider.ts" "Trash Schedule AI Provider"
check_file "apps/backend/src/community/community.service.ts" "Updated Community Service"
check_file "apps/backend/src/community/community.controller.ts" "Updated Community Controller"
check_file "apps/backend/src/community/community.routes.ts" "Updated Community Routes"

echo ""
echo "Checking Frontend Files..."
echo "=========================="
check_file "apps/frontend/src/components/community/EmptyState.tsx" "EmptyState Component"
check_file "apps/frontend/src/components/community/EventsTab.tsx" "Updated EventsTab"
check_file "apps/frontend/src/components/community/TrashTab.tsx" "Updated TrashTab"
check_file "apps/frontend/src/components/community/AlertsTab.tsx" "Updated AlertsTab"
check_file "apps/frontend/src/components/community/types.ts" "Frontend Community Types"

echo ""
echo "=================================================="

if [ $MISSING_FILES -eq 0 ]; then
    echo -e "${GREEN}✅ All files are in correct locations!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. cd apps/backend && npm run build"
    echo "2. cd apps/frontend && npm run build"
    echo "3. Build and push Docker images"
    echo "4. Deploy to Kubernetes"
else
    echo -e "${RED}❌ $MISSING_FILES files are missing or in wrong locations${NC}"
    echo ""
    echo "Please copy files to correct locations before building."
    echo "Refer to IMPLEMENTATION_SUMMARY.md for file paths."
fi

echo "=================================================="
echo ""

# Additional checks
echo "Additional Checks..."
echo "===================="

# Check if @google/generative-ai is installed
if [ -f "apps/backend/package.json" ]; then
    if grep -q "@google/generative-ai" apps/backend/package.json; then
        echo -e "${GREEN}✅${NC} @google/generative-ai found in package.json"
    else
        echo -e "${YELLOW}⚠️${NC}  @google/generative-ai not in package.json"
        echo "   Run: cd apps/backend && npm install @google/generative-ai"
    fi
fi

# Check for GEMINI_API_KEY in env
if [ -f "apps/backend/.env" ]; then
    if grep -q "GEMINI_API_KEY" apps/backend/.env; then
        echo -e "${GREEN}✅${NC} GEMINI_API_KEY found in .env"
    else
        echo -e "${YELLOW}⚠️${NC}  GEMINI_API_KEY not in .env"
        echo "   Add: GEMINI_API_KEY=your_key_here"
    fi
fi

echo ""
