# Contract to Cozy - Makefile

.PHONY: help install dev test build deploy clean

.DEFAULT_GOAL := help

DOCKER_REGISTRY ?= ghcr.io/yourusername
VERSION ?= $(shell git describe --tags --always --dirty)
NAMESPACE ?= production

## help: Display this help message
help:
	@echo "Contract to Cozy - Available Commands:"
	@echo ""
	@grep -E '^##' Makefile | sed 's/## /  /'

## install: Install all dependencies
install:
	@echo "Installing dependencies..."
	cd apps/frontend && npm install
	cd apps/backend && npm install

## dev: Start development environment
dev:
	@echo "Starting development environment..."
	docker-compose up -d

## test: Run all tests
test:
	@echo "Running tests..."
	cd apps/frontend && npm test
	cd apps/backend && npm test

## lint: Run linters
lint:
	@echo "Running linters..."
	cd apps/frontend && npm run lint
	cd apps/backend && npm run lint

## build: Build Docker images
build:
	@echo "Building Docker images..."
	docker build -t $(DOCKER_REGISTRY)/frontend:$(VERSION) ./apps/frontend
	docker build -t $(DOCKER_REGISTRY)/backend:$(VERSION) ./apps/backend

## build-arm: Build ARM64 Docker images
build-arm:
	@echo "Building ARM64 Docker images..."
	docker buildx build --platform linux/arm64 -t $(DOCKER_REGISTRY)/frontend:$(VERSION)-arm64 ./apps/frontend
	docker buildx build --platform linux/arm64 -t $(DOCKER_REGISTRY)/backend:$(VERSION)-arm64 ./apps/backend

## deploy-pi: Deploy to Raspberry Pi
deploy-pi:
	@echo "Deploying to Raspberry Pi..."
	kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi

## logs-frontend: View frontend logs
logs-frontend:
	kubectl logs -f deployment/frontend-deployment -n $(NAMESPACE)

## logs-backend: View backend logs
logs-backend:
	kubectl logs -f deployment/backend-deployment -n $(NAMESPACE)

## clean: Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -rf apps/frontend/.next
	rm -rf apps/backend/dist
