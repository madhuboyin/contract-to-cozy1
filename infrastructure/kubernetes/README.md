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
  --from-literal=JWT_REFRESH_SECRET='random-refresh-string' \
  --from-literal=JWT_EMAIL_SECRET='random-email-token-string' \
  --from-literal=JWT_PASSWORD_RESET_SECRET='random-password-reset-string' \
  --from-literal=JWT_MFA_SECRET='random-mfa-string' \
  --from-literal=GOOGLE_MAPS_API_KEY='google-places-api-key' \
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
# Preferred: deploy an immutable tag so the pod template changes and Kubernetes
# performs a rollout automatically.
kubectl set image deployment/api-deployment \
  api=ghcr.io/madhuboyin/contract-to-cozy/backend:v1.0.1 \
  -n production

# If the pilot workflow pushes backend:latest instead, applying the unchanged
# manifest does not recreate existing pods. Explicitly restart and wait until
# every API replica is on the newly-pulled digest.
kubectl rollout restart deployment/api-deployment -n production
kubectl rollout status deployment/api-deployment -n production
```

## Capability discovery environment mode

The tracked configuration intentionally starts in internal-beta mode while no
external users are admitted:

```yaml
TOOL_DISCOVERY_RELEASE_MODE: "INTERNAL_BETA"
ENFORCE_HUMAN_POLICY_APPROVALS: "false"
TOOL_DISCOVERY_ENABLED: "true"
CAPABILITY_RECOMMENDATIONS_ENABLED: "true"
ENFORCE_TOOL_DISCOVERY_RELEASE_GATES: "true"
```

For production cutover, change only the first two values to
`REAL_USER_LAUNCH` and `true`. Keep discovery, recommendations, and release-gate
enforcement on for normal production operation. Complete the governance,
release-readiness, smoke, and sign-off prerequisites in
`docs/product/capability-discovery/CAPABILITY_PLATFORM_RUNBOOK.md`, section
5.0, before making that change. No Deployment YAML edit is required; the API
and worker deployments already read the applicable value from `app-config`.

Apply the ConfigMap and restart both consumers. Applying the ConfigMap alone
does not restart existing pods:

```bash
kubectl apply -f infrastructure/kubernetes/base/configmap.yaml
kubectl rollout restart deployment/api-deployment -n production
kubectl rollout restart deployment/worker-deployment -n production
kubectl rollout status deployment/api-deployment -n production
kubectl rollout status deployment/worker-deployment -n production
```

Verify the effective API configuration:

```bash
kubectl exec -n production deployment/api-deployment -- \
  printenv TOOL_DISCOVERY_RELEASE_MODE \
    ENFORCE_HUMAN_POLICY_APPROVALS \
    TOOL_DISCOVERY_ENABLED \
    CAPABILITY_RECOMMENDATIONS_ENABLED \
    ENFORCE_TOOL_DISCOVERY_RELEASE_GATES
```

Production output must be `REAL_USER_LAUNCH` followed by four `true` values.
Once external users are present, never roll back by selecting `INTERNAL_BETA`
or disabling human approvals. Use catalog-only containment
(`CAPABILITY_RECOMMENDATIONS_ENABLED=false`), a capability-specific hold, or
the global discovery kill switch instead.

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
