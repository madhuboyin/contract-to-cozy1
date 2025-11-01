#!/bin/bash

################################################################################
# Contract to Cozy - Repository Verification Script
# 
# This script verifies that the repository structure is correctly set up.
# Run this after setup-repo.sh to ensure everything is in place.
#
# Usage: ./verify-setup.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS_COUNT++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL_COUNT++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN_COUNT++))
}

print_header "Contract to Cozy - Repository Verification"
echo ""

################################################################################
# Check Root Files
################################################################################

print_header "1. Checking Root Files"

# Required files
files=(
    ".gitignore"
    ".dockerignore"
    ".editorconfig"
    ".nvmrc"
    "README.md"
    "CONTRIBUTING.md"
    "CODE_OF_CONDUCT.md"
    "CHANGELOG.md"
    "LICENSE"
    "Makefile"
)

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
    fi
done

echo ""

################################################################################
# Check GitHub Directory
################################################################################

print_header "2. Checking GitHub Configuration"

github_files=(
    ".github/PULL_REQUEST_TEMPLATE.md"
    ".github/ISSUE_TEMPLATE/bug_report.md"
    ".github/ISSUE_TEMPLATE/feature_request.md"
    ".github/dependabot.yml"
)

for file in "${github_files[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
    fi
done

if [ -d ".github/workflows" ]; then
    check_pass ".github/workflows/ directory exists"
    workflow_count=$(find .github/workflows -name "*.yml" -o -name "*.yaml" | wc -l)
    if [ $workflow_count -gt 0 ]; then
        check_pass "Found $workflow_count workflow(s)"
    else
        check_warn "No workflows found (will be added later)"
    fi
else
    check_fail ".github/workflows/ directory missing"
fi

echo ""

################################################################################
# Check Main Directories
################################################################################

print_header "3. Checking Main Directories"

main_dirs=(
    "apps/frontend"
    "apps/backend"
    "apps/workers"
    "infrastructure/kubernetes"
    "infrastructure/helm"
    "infrastructure/terraform"
    "infrastructure/ansible"
    "infrastructure/docker"
    "infrastructure/scripts"
    "database/migrations"
    "database/seeds"
    "config/prometheus"
    "config/grafana"
    "docs/architecture"
    "docs/api"
    "docs/deployment"
    "tests/e2e"
    "tests/load"
)

for dir in "${main_dirs[@]}"; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_fail "$dir/ missing"
    fi
done

echo ""

################################################################################
# Check Apps Structure
################################################################################

print_header "4. Checking Apps Structure"

apps_frontend_dirs=(
    "apps/frontend/src/app"
    "apps/frontend/src/components"
    "apps/frontend/src/lib"
    "apps/frontend/src/store"
    "apps/frontend/tests"
)

for dir in "${apps_frontend_dirs[@]}"; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_fail "$dir/ missing"
    fi
done

apps_backend_dirs=(
    "apps/backend/src/routes"
    "apps/backend/src/controllers"
    "apps/backend/src/services"
    "apps/backend/src/models"
    "apps/backend/src/middleware"
    "apps/backend/tests"
)

for dir in "${apps_backend_dirs[@]}"; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_fail "$dir/ missing"
    fi
done

echo ""

################################################################################
# Check Infrastructure Structure
################################################################################

print_header "5. Checking Infrastructure Structure"

k8s_dirs=(
    "infrastructure/kubernetes/base"
    "infrastructure/kubernetes/apps/frontend"
    "infrastructure/kubernetes/apps/backend"
    "infrastructure/kubernetes/data/postgres"
    "infrastructure/kubernetes/data/redis"
    "infrastructure/kubernetes/ingress"
    "infrastructure/kubernetes/monitoring"
    "infrastructure/kubernetes/overlays/raspberry-pi"
    "infrastructure/kubernetes/overlays/staging"
    "infrastructure/kubernetes/overlays/production"
)

for dir in "${k8s_dirs[@]}"; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_fail "$dir/ missing"
    fi
done

echo ""

################################################################################
# Check Git Setup
################################################################################

print_header "6. Checking Git Configuration"

if [ -d .git ]; then
    check_pass "Git repository initialized"
    
    # Check branches
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    if [ $? -eq 0 ]; then
        check_pass "Current branch: $current_branch"
    fi
    
    # Check for commits
    commit_count=$(git rev-list --count HEAD 2>/dev/null || echo "0")
    if [ $commit_count -gt 0 ]; then
        check_pass "Found $commit_count commit(s)"
    else
        check_warn "No commits yet"
    fi
    
    # Check for develop branch
    if git show-ref --verify --quiet refs/heads/develop; then
        check_pass "develop branch exists"
    else
        check_warn "develop branch not found"
    fi
    
    # Check for remote
    if git remote -v | grep -q origin; then
        remote_url=$(git remote get-url origin)
        check_pass "Remote configured: $remote_url"
    else
        check_warn "No remote configured yet"
    fi
else
    check_fail "Git repository not initialized"
fi

echo ""

################################################################################
# Directory Count
################################################################################

print_header "7. Structure Statistics"

total_dirs=$(find . -type d -not -path '*/\.git/*' | wc -l)
total_files=$(find . -type f -not -path '*/\.git/*' | wc -l)

echo -e "Total directories: ${GREEN}$total_dirs${NC}"
echo -e "Total files: ${GREEN}$total_files${NC}"

if [ $total_dirs -gt 100 ]; then
    check_pass "Directory count looks good ($total_dirs)"
else
    check_warn "Expected 150+ directories, found $total_dirs"
fi

if [ $total_files -gt 20 ]; then
    check_pass "File count looks good ($total_files)"
else
    check_warn "Expected 50+ files, found $total_files"
fi

echo ""

################################################################################
# Check .gitignore Patterns
################################################################################

print_header "8. Checking .gitignore"

if [ -f .gitignore ]; then
    patterns=(
        "node_modules"
        ".env"
        "dist/"
        "*.log"
        "secrets.yaml"
    )
    
    for pattern in "${patterns[@]}"; do
        if grep -q "$pattern" .gitignore; then
            check_pass ".gitignore includes: $pattern"
        else
            check_warn ".gitignore missing: $pattern"
        fi
    done
else
    check_fail ".gitignore not found"
fi

echo ""

################################################################################
# Check Makefile Targets
################################################################################

print_header "9. Checking Makefile"

if [ -f Makefile ]; then
    check_pass "Makefile exists"
    
    targets=(
        "help"
        "install"
        "dev"
        "test"
        "build"
        "deploy-pi"
    )
    
    for target in "${targets[@]}"; do
        if grep -q "^$target:" Makefile; then
            check_pass "Makefile has target: $target"
        else
            check_warn "Makefile missing target: $target"
        fi
    done
else
    check_fail "Makefile not found"
fi

echo ""

################################################################################
# Summary
################################################################################

print_header "Verification Summary"

echo ""
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${YELLOW}Warnings: $WARN_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ Repository structure verified successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Push to GitHub: git push -u origin main"
    echo "  2. Configure GitHub settings (see AUTOMATED_SETUP_GUIDE.md)"
    echo "  3. Start development: make install && make dev"
    exit 0
elif [ $FAIL_COUNT -le 5 ]; then
    echo -e "${YELLOW}⚠ Repository structure mostly complete with some issues${NC}"
    echo ""
    echo "Review the failures above and:"
    echo "  1. Re-run setup-repo.sh to fix missing items"
    echo "  2. Or manually create missing files/directories"
    exit 1
else
    echo -e "${RED}✗ Repository structure incomplete${NC}"
    echo ""
    echo "Please run setup-repo.sh to create the structure"
    exit 1
fi
