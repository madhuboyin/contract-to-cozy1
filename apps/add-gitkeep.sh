#!/bin/bash

################################################################################
# Contract to Cozy - Add .gitkeep to Empty Directories
# 
# Git doesn't track empty directories. This script adds .gitkeep files
# to all empty directories so they'll be committed to GitHub.
#
# Usage: ./add-gitkeep.sh
################################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Adding .gitkeep files to empty directories...${NC}\n"

count=0

# Find all empty directories (excluding .git)
while IFS= read -r dir; do
    # Skip .git directory
    if [[ "$dir" == *".git"* ]]; then
        continue
    fi
    
    # Add .gitkeep file
    touch "$dir/.gitkeep"
    echo -e "${GREEN}✓${NC} Added .gitkeep to: $dir"
    ((count++))
done < <(find . -type d -empty -not -path '*/\.git/*')

echo -e "\n${GREEN}✓ Added .gitkeep to $count empty directories${NC}\n"

# Show git status
echo -e "${BLUE}Git status:${NC}"
git status --short | head -20

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. git add ."
echo "2. git commit -m 'chore: add .gitkeep to empty directories'"
echo "3. git push origin main"
