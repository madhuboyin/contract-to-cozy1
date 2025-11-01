#!/bin/bash

################################################################################
# Contract to Cozy - Repository Setup Script
# 
# This script automates the complete repository structure creation.
# Run this script in an empty directory or your repository root.
#
# Usage: ./setup-repo.sh [--skip-git]
#
# Options:
#   --skip-git    Skip git initialization (if already initialized)
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_NAME="contract-to-cozy"
SKIP_GIT=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --skip-git)
            SKIP_GIT=true
            shift
            ;;
    esac
done

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

create_directory() {
    local dir=$1
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_success "Created: $dir"
    else
        print_info "Exists: $dir"
    fi
}

create_file() {
    local file=$1
    local content=$2
    
    # Create parent directory if it doesn't exist
    local dir=$(dirname "$file")
    mkdir -p "$dir"
    
    if [ ! -f "$file" ]; then
        echo "$content" > "$file"
        print_success "Created: $file"
    else
        print_info "Exists: $file"
    fi
}

################################################################################
# Main Setup
################################################################################

print_header "Contract to Cozy - Repository Setup"
echo ""
echo "This script will create the complete repository structure."
echo ""

# Check if we're in a git repository
if [ -d .git ] && [ "$SKIP_GIT" = false ]; then
    print_warning "Already in a git repository. Use --skip-git to skip git initialization."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

################################################################################
# Step 1: Create Directory Structure
################################################################################

print_header "Step 1: Creating Directory Structure"

# GitHub specific
create_directory ".github/workflows"
create_directory ".github/ISSUE_TEMPLATE"

# Application code
create_directory "apps/frontend/src/app/(auth)/login"
create_directory "apps/frontend/src/app/(auth)/signup"
create_directory "apps/frontend/src/app/(auth)/reset-password"
create_directory "apps/frontend/src/app/(dashboard)/properties"
create_directory "apps/frontend/src/app/(dashboard)/bookings"
create_directory "apps/frontend/src/app/(dashboard)/savings"
create_directory "apps/frontend/src/app/(dashboard)/profile"
create_directory "apps/frontend/src/components/ui"
create_directory "apps/frontend/src/components/forms"
create_directory "apps/frontend/src/components/layout"
create_directory "apps/frontend/src/components/features"
create_directory "apps/frontend/src/lib/api"
create_directory "apps/frontend/src/lib/hooks"
create_directory "apps/frontend/src/lib/utils"
create_directory "apps/frontend/src/lib/types"
create_directory "apps/frontend/src/store"
create_directory "apps/frontend/src/styles"
create_directory "apps/frontend/public"
create_directory "apps/frontend/tests/unit"
create_directory "apps/frontend/tests/integration"
create_directory "apps/frontend/tests/e2e"

create_directory "apps/backend/src/config"
create_directory "apps/backend/src/routes"
create_directory "apps/backend/src/controllers"
create_directory "apps/backend/src/services"
create_directory "apps/backend/src/models"
create_directory "apps/backend/src/middleware"
create_directory "apps/backend/src/validators"
create_directory "apps/backend/src/workers"
create_directory "apps/backend/src/utils"
create_directory "apps/backend/src/types"
create_directory "apps/backend/tests/unit"
create_directory "apps/backend/tests/integration"
create_directory "apps/backend/tests/e2e"
create_directory "apps/backend/prisma/migrations"

create_directory "apps/workers/src"

# Infrastructure
create_directory "infrastructure/kubernetes/base"
create_directory "infrastructure/kubernetes/apps/frontend"
create_directory "infrastructure/kubernetes/apps/backend"
create_directory "infrastructure/kubernetes/apps/workers"
create_directory "infrastructure/kubernetes/data/postgres"
create_directory "infrastructure/kubernetes/data/redis"
create_directory "infrastructure/kubernetes/ingress/nginx-ingress"
create_directory "infrastructure/kubernetes/ingress/cloudflare-tunnel"
create_directory "infrastructure/kubernetes/monitoring/prometheus"
create_directory "infrastructure/kubernetes/monitoring/grafana/dashboards"
create_directory "infrastructure/kubernetes/monitoring/alertmanager"
create_directory "infrastructure/kubernetes/overlays/raspberry-pi"
create_directory "infrastructure/kubernetes/overlays/staging"
create_directory "infrastructure/kubernetes/overlays/production"

create_directory "infrastructure/helm/contract-to-cozy/templates/frontend"
create_directory "infrastructure/helm/contract-to-cozy/templates/backend"
create_directory "infrastructure/helm/contract-to-cozy/templates/database"
create_directory "infrastructure/helm/contract-to-cozy/templates/ingress"

create_directory "infrastructure/terraform/modules/eks"
create_directory "infrastructure/terraform/modules/gke"
create_directory "infrastructure/terraform/modules/networking"
create_directory "infrastructure/terraform/modules/database"
create_directory "infrastructure/terraform/modules/monitoring"
create_directory "infrastructure/terraform/environments/staging"
create_directory "infrastructure/terraform/environments/production"

create_directory "infrastructure/ansible/inventory/raspberry-pi/group_vars"
create_directory "infrastructure/ansible/inventory/cloud"
create_directory "infrastructure/ansible/playbooks"
create_directory "infrastructure/ansible/roles/common"
create_directory "infrastructure/ansible/roles/kubernetes"
create_directory "infrastructure/ansible/roles/docker"
create_directory "infrastructure/ansible/roles/monitoring"
create_directory "infrastructure/ansible/roles/security"

create_directory "infrastructure/docker"

create_directory "infrastructure/scripts/setup"
create_directory "infrastructure/scripts/deployment"
create_directory "infrastructure/scripts/backup"
create_directory "infrastructure/scripts/monitoring"
create_directory "infrastructure/scripts/migration"

# Database
create_directory "database/migrations"
create_directory "database/seeds/development"
create_directory "database/seeds/production"
create_directory "database/backups"

# Config
create_directory "config/prometheus"
create_directory "config/grafana/dashboards"
create_directory "config/nginx/sites"
create_directory "config/cloudflare"

# Documentation
create_directory "docs/architecture/diagrams"
create_directory "docs/api"
create_directory "docs/deployment"
create_directory "docs/development"
create_directory "docs/operations"

# Tests
create_directory "tests/e2e"
create_directory "tests/load/k6"
create_directory "tests/security"

echo ""
print_success "Directory structure created!"

################################################################################
# Step 2: Create Root Files
################################################################################

print_header "Step 2: Creating Root Configuration Files"

# .gitignore
create_file ".gitignore" "# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/
.next/
out/

# Logs
logs/
*.log

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Kubernetes secrets
**/secrets.yaml
!**/secrets.yaml.template

# Terraform
*.tfstate
*.tfstate.*
.terraform/
terraform.tfvars
!terraform.tfvars.example

# Temporary files
tmp/
temp/
*.tmp

# Testing
coverage/
.nyc_output/

# Docker
*.tar
docker-compose.override.yml
!docker-compose.override.yml.example"

# .dockerignore
create_file ".dockerignore" "node_modules/
npm-debug.log*
.next/
.git/
.gitignore
README.md
.env*
!.env.example
coverage/
.vscode/
.idea/
*.md
Dockerfile*
docker-compose*"

# .editorconfig
create_file ".editorconfig" "root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.py]
indent_size = 4

[Makefile]
indent_style = tab"

# .nvmrc
create_file ".nvmrc" "20"

# README.md
create_file "README.md" "# 🏡 Contract to Cozy

> Platform connecting new homeowners with trusted service providers

[![CI](https://github.com/yourusername/contract-to-cozy/workflows/CI/badge.svg)](https://github.com/yourusername/contract-to-cozy/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326ce5.svg)](https://kubernetes.io)

## 🚀 Quick Start

### Local Development
\`\`\`bash
# Install dependencies
make install

# Start development environment
make dev
\`\`\`

### Raspberry Pi Deployment
\`\`\`bash
# Setup cluster
make setup-pi-cluster

# Deploy to Pi
make deploy-pi
\`\`\`

## 📚 Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [API Documentation](docs/api/README.md)
- [Deployment Guide](docs/deployment/raspberry-pi-deployment.md)
- [Contributing Guide](CONTRIBUTING.md)

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js 20, Express, TypeScript
- **Database**: PostgreSQL 15, Redis 7
- **Infrastructure**: Kubernetes (k3s), Docker
- **CI/CD**: GitHub Actions

## 📁 Repository Structure

\`\`\`
contract-to-cozy/
├── apps/              # Application code
├── infrastructure/    # K8s manifests, Terraform, Ansible
├── database/          # Migrations and seeds
├── config/            # Configuration files
├── docs/              # Documentation
└── tests/             # E2E and load tests
\`\`\`

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file."

# CONTRIBUTING.md
create_file "CONTRIBUTING.md" "# Contributing to Contract to Cozy

Thank you for your interest in contributing! 🎉

## Getting Started

1. Fork the repository
2. Clone your fork: \`git clone https://github.com/yourusername/contract-to-cozy.git\`
3. Create a feature branch: \`git checkout -b feature/my-feature\`
4. Make your changes
5. Run tests: \`make test\`
6. Commit your changes: \`git commit -m 'feat: add my feature'\`
7. Push to your fork: \`git push origin feature/my-feature\`
8. Create a Pull Request

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

\`\`\`
<type>(<scope>): <subject>
\`\`\`

**Types:**
- \`feat\`: New feature
- \`fix\`: Bug fix
- \`docs\`: Documentation
- \`style\`: Code style changes
- \`refactor\`: Code refactoring
- \`test\`: Adding tests
- \`chore\`: Maintenance tasks

**Example:**
\`\`\`
feat(frontend): add provider search functionality
\`\`\`

## Code Style

- Run \`make lint\` before committing
- Follow existing code patterns
- Write meaningful comments
- Add tests for new features

## Pull Request Process

1. Update README.md if needed
2. Ensure all tests pass
3. Request review from maintainers
4. Address review comments
5. Squash commits if requested

## Questions?

Open an issue or contact the maintainers."

# CODE_OF_CONDUCT.md
create_file "CODE_OF_CONDUCT.md" "# Code of Conduct

## Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone.

## Our Standards

**Positive behavior:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior:**
- Trolling, insulting comments, and personal attacks
- Public or private harassment
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## Enforcement

Project maintainers have the right to remove, edit, or reject comments, commits, code, issues, and other contributions that are not aligned with this Code of Conduct.

## Contact

Report issues to: conduct@contracttocozy.com"

# CHANGELOG.md
create_file "CHANGELOG.md" "# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure
- Frontend application scaffolding
- Backend API scaffolding
- Kubernetes deployment configurations
- CI/CD workflows

## [0.1.0] - $(date +%Y-%m-%d)

### Added
- Repository initialization
- Documentation
- Development environment setup"

# LICENSE (MIT)
create_file "LICENSE" "MIT License

Copyright (c) $(date +%Y) Contract to Cozy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the \"Software\"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE."

# Makefile
create_file "Makefile" "# Contract to Cozy - Makefile

.PHONY: help install dev test build deploy clean

.DEFAULT_GOAL := help

DOCKER_REGISTRY ?= ghcr.io/yourusername
VERSION ?= \$(shell git describe --tags --always --dirty)
NAMESPACE ?= production

## help: Display this help message
help:
	@echo \"Contract to Cozy - Available Commands:\"
	@echo \"\"
	@grep -E '^##' Makefile | sed 's/## /  /'

## install: Install all dependencies
install:
	@echo \"Installing dependencies...\"
	cd apps/frontend && npm install
	cd apps/backend && npm install

## dev: Start development environment
dev:
	@echo \"Starting development environment...\"
	docker-compose up -d

## test: Run all tests
test:
	@echo \"Running tests...\"
	cd apps/frontend && npm test
	cd apps/backend && npm test

## lint: Run linters
lint:
	@echo \"Running linters...\"
	cd apps/frontend && npm run lint
	cd apps/backend && npm run lint

## build: Build Docker images
build:
	@echo \"Building Docker images...\"
	docker build -t \$(DOCKER_REGISTRY)/frontend:\$(VERSION) ./apps/frontend
	docker build -t \$(DOCKER_REGISTRY)/backend:\$(VERSION) ./apps/backend

## build-arm: Build ARM64 Docker images
build-arm:
	@echo \"Building ARM64 Docker images...\"
	docker buildx build --platform linux/arm64 -t \$(DOCKER_REGISTRY)/frontend:\$(VERSION)-arm64 ./apps/frontend
	docker buildx build --platform linux/arm64 -t \$(DOCKER_REGISTRY)/backend:\$(VERSION)-arm64 ./apps/backend

## deploy-pi: Deploy to Raspberry Pi
deploy-pi:
	@echo \"Deploying to Raspberry Pi...\"
	kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi

## logs-frontend: View frontend logs
logs-frontend:
	kubectl logs -f deployment/frontend-deployment -n \$(NAMESPACE)

## logs-backend: View backend logs
logs-backend:
	kubectl logs -f deployment/backend-deployment -n \$(NAMESPACE)

## clean: Clean build artifacts
clean:
	@echo \"Cleaning...\"
	rm -rf apps/frontend/.next
	rm -rf apps/backend/dist"

echo ""
print_success "Root configuration files created!"

################################################################################
# Step 3: Create GitHub Templates
################################################################################

print_header "Step 3: Creating GitHub Templates"

# Pull Request Template
create_file ".github/PULL_REQUEST_TEMPLATE.md" "## Description
<!-- Describe your changes -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] Added new tests
- [ ] Updated documentation

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated

## Related Issues
Closes #"

# Bug Report Template
create_file ".github/ISSUE_TEMPLATE/bug_report.md" "---
name: Bug Report
about: Create a report to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

## Description
<!-- A clear description of the bug -->

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
<!-- What you expected to happen -->

## Actual Behavior
<!-- What actually happened -->

## Environment
- OS: [e.g., macOS, Linux]
- Browser: [e.g., Chrome, Firefox]
- Version: [e.g., v1.0.0]

## Screenshots
<!-- If applicable -->

## Additional Context
<!-- Any other information -->"

# Feature Request Template
create_file ".github/ISSUE_TEMPLATE/feature_request.md" "---
name: Feature Request
about: Suggest an idea for this project
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Problem
<!-- Description of the problem -->

## Proposed Solution
<!-- Your proposed solution -->

## Alternatives Considered
<!-- Alternative solutions you've considered -->

## Additional Context
<!-- Any other context or screenshots -->"

# Dependabot Configuration
create_file ".github/dependabot.yml" "version: 2
updates:
  # Frontend dependencies
  - package-ecosystem: \"npm\"
    directory: \"/apps/frontend\"
    schedule:
      interval: \"weekly\"
    open-pull-requests-limit: 10
    labels:
      - \"dependencies\"
      - \"frontend\"

  # Backend dependencies
  - package-ecosystem: \"npm\"
    directory: \"/apps/backend\"
    schedule:
      interval: \"weekly\"
    open-pull-requests-limit: 10
    labels:
      - \"dependencies\"
      - \"backend\"

  # GitHub Actions
  - package-ecosystem: \"github-actions\"
    directory: \"/\"
    schedule:
      interval: \"weekly\"
    labels:
      - \"dependencies\"
      - \"ci\""

echo ""
print_success "GitHub templates created!"

################################################################################
# Step 4: Create README files for subdirectories
################################################################################

print_header "Step 4: Creating README files"

create_file "apps/README.md" "# Applications

This directory contains all application code.

## Structure

- \`frontend/\` - Next.js frontend application
- \`backend/\` - Node.js backend API
- \`workers/\` - Background job processors"

create_file "infrastructure/README.md" "# Infrastructure

Infrastructure as Code and deployment configurations.

## Structure

- \`kubernetes/\` - Kubernetes manifests
- \`helm/\` - Helm charts
- \`terraform/\` - Terraform configurations
- \`ansible/\` - Ansible playbooks
- \`docker/\` - Docker Compose files
- \`scripts/\` - Deployment scripts"

create_file "database/README.md" "# Database

Database migrations, seeds, and backup configurations.

## Structure

- \`migrations/\` - SQL migration files
- \`seeds/\` - Seed data
- \`backups/\` - Backup configurations"

create_file "docs/README.md" "# Documentation

Comprehensive project documentation.

## Structure

- \`architecture/\` - System architecture
- \`api/\` - API documentation
- \`deployment/\` - Deployment guides
- \`development/\` - Development guides
- \`operations/\` - Operational runbooks"

create_file "tests/README.md" "# Tests

End-to-end and integration tests.

## Structure

- \`e2e/\` - End-to-end tests
- \`load/\` - Load testing
- \`security/\` - Security tests"

echo ""
print_success "README files created!"

################################################################################
# Step 5: Initialize Git
################################################################################

if [ "$SKIP_GIT" = false ]; then
    print_header "Step 5: Initializing Git Repository"
    
    if [ ! -d .git ]; then
        git init
        print_success "Git repository initialized"
        
        # Create initial commit
        git add .
        git commit -m "chore: initial repository structure

- Complete directory structure
- Configuration files
- GitHub templates
- Documentation structure"
        print_success "Initial commit created"
        
        # Create develop branch
        git checkout -b develop
        print_success "Develop branch created"
        
        git checkout main
        print_success "Switched back to main branch"
    else
        print_info "Git repository already initialized"
    fi
else
    print_info "Skipping git initialization (--skip-git flag)"
fi

################################################################################
# Step 6: Final Instructions
################################################################################

print_header "Setup Complete! 🎉"
echo ""
echo "Your repository structure has been created successfully!"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Push to GitHub:"
echo "   ${YELLOW}git remote add origin https://github.com/yourusername/contract-to-cozy.git${NC}"
echo "   ${YELLOW}git branch -M main${NC}"
echo "   ${YELLOW}git push -u origin main${NC}"
echo "   ${YELLOW}git push origin develop${NC}"
echo ""
echo "2. Configure GitHub:"
echo "   - Set up branch protections (Settings → Branches)"
echo "   - Add required secrets (Settings → Secrets and variables → Actions)"
echo "   - Enable GitHub Actions (if not already enabled)"
echo ""
echo "3. Start development:"
echo "   ${YELLOW}make install${NC}     # Install dependencies"
echo "   ${YELLOW}make dev${NC}         # Start development environment"
echo ""
echo "4. Documentation:"
echo "   - Review README.md"
echo "   - Check CONTRIBUTING.md"
echo "   - Read docs/ directory"
echo ""
print_success "Repository setup script completed!"
echo ""
echo "For more information, see: https://github.com/yourusername/contract-to-cozy"
echo ""
