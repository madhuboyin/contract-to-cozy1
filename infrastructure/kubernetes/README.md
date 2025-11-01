# Kubernetes Configurations

Complete Kubernetes manifests for Raspberry Pi 5 cluster deployment.

## Quick Start

```bash
# Deploy everything
kubectl apply -k overlays/raspberry-pi/
```

## Directory Structure

```
kubernetes/
├── base/                    # Base configurations
├── data/                    # PostgreSQL, Redis
├── apps/                    # Frontend, backend, workers
├── ingress/                 # Cloudflare Tunnel
└── overlays/raspberry-pi/   # Pi optimizations
```

## Prerequisites

1. Label your nodes:
```bash
kubectl label node pi-node-6 role=database
```

2. Create secrets:
```bash
kubectl create secret generic app-secrets \
  --from-literal=DB_PASSWORD='strong-password' \
  --from-literal=JWT_SECRET='random-string' \
  -n production

kubectl create secret generic postgres-credentials \
  --from-literal=POSTGRES_PASSWORD='strong-password' \
  -n production
```

3. Setup Cloudflare Tunnel:
```bash
cloudflared tunnel create contracttocozy
kubectl create secret generic cloudflared-credentials \
  --from-file=credentials.json=/path/to/credentials.json \
  -n production
```

## Deployment

```bash
kubectl apply -k overlays/raspberry-pi/
kubectl get pods -n production -w
```

## Verify

```bash
kubectl get all -n production
kubectl top nodes
kubectl top pods -n production
```

## Update

```bash
kubectl set image deployment/api-deployment \
  api=ghcr.io/madhuboyin/contract-to-cozy/backend:v1.0.1 \
  -n production
```

## Logs

```bash
kubectl logs -f deployment/api-deployment -n production
```

## Troubleshooting

Check pod status:
```bash
kubectl describe pod <pod-name> -n production
```

Check events:
```bash
kubectl get events -n production --sort-by='.lastTimestamp'
```
