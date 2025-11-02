#!/bin/bash

################################################################################
# Contract to Cozy - Generate Kubernetes Configurations
# 
# This script generates all Kubernetes manifests directly in your repository.
# No downloads needed!
#
# Usage: ./generate-k8s-configs.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}=================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}=================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_header "Contract to Cozy - Kubernetes Configuration Generator"
echo ""

# Check if in repository root
if [ ! -d "infrastructure/kubernetes" ]; then
    echo -e "${YELLOW}Creating infrastructure/kubernetes directory...${NC}"
    mkdir -p infrastructure/kubernetes
fi

K8S_DIR="infrastructure/kubernetes"

print_header "Step 1: Creating Directory Structure"

mkdir -p "$K8S_DIR/base"
mkdir -p "$K8S_DIR/data/postgres"
mkdir -p "$K8S_DIR/data/redis"
mkdir -p "$K8S_DIR/apps/frontend"
mkdir -p "$K8S_DIR/apps/backend"
mkdir -p "$K8S_DIR/apps/workers"
mkdir -p "$K8S_DIR/ingress/nginx-ingress"
mkdir -p "$K8S_DIR/ingress/cloudflare-tunnel"
mkdir -p "$K8S_DIR/overlays/raspberry-pi"

print_success "Directory structure created"

print_header "Step 2: Generating Base Configurations"

# namespace.yaml
cat > "$K8S_DIR/base/namespace.yaml" << 'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    name: production
    environment: production
---
apiVersion: v1
kind: Namespace
metadata:
  name: staging
  labels:
    name: staging
    environment: staging
---
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    name: monitoring
    environment: shared
EOF
print_success "Created base/namespace.yaml"

# configmap.yaml
cat > "$K8S_DIR/base/configmap.yaml" << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  # Application
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  
  # API Configuration
  API_PORT: "8080"
  API_HOST: "0.0.0.0"
  
  # Frontend Configuration
  NEXT_PUBLIC_API_URL: "https://api.contracttocozy.com"
  
  # Database Configuration (non-sensitive)
  DB_HOST: "postgres.production.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "contracttocozy"
  DB_POOL_MIN: "2"
  DB_POOL_MAX: "10"
  
  # Redis Configuration
  REDIS_HOST: "redis.production.svc.cluster.local"
  REDIS_PORT: "6379"
  REDIS_DB: "0"
  
  # Application Features
  ENABLE_SIGNUP: "true"
  ENABLE_REVIEWS: "true"
  ENABLE_CHAT: "true"
  
  # Rate Limiting
  RATE_LIMIT_WINDOW_MS: "60000"
  RATE_LIMIT_MAX_REQUESTS: "100"
  
  # Session Configuration
  SESSION_TIMEOUT_MINUTES: "60"
  
  # Email Configuration (non-sensitive)
  EMAIL_FROM: "noreply@contracttocozy.com"
  EMAIL_REPLY_TO: "support@contracttocozy.com"
EOF
print_success "Created base/configmap.yaml"

# secrets.yaml.template
cat > "$K8S_DIR/base/secrets.yaml.template" << 'EOF'
# secrets.yaml.template
# 
# IMPORTANT: This is a template. DO NOT commit actual secrets to Git!
# 
# To use:
# 1. Copy this file: cp secrets.yaml.template secrets.yaml
# 2. Fill in actual values (secrets.yaml is in .gitignore)
# 3. Apply: kubectl apply -f secrets.yaml
#
# Or use: kubectl create secret generic app-secrets --from-literal=...

apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: production
type: Opaque
stringData:
  # Database Credentials
  DB_USERNAME: "postgres"
  DB_PASSWORD: "CHANGE_ME_STRONG_PASSWORD_HERE"
  DATABASE_URL: "postgresql://postgres:CHANGE_ME@postgres:5432/contracttocozy"
  
  # JWT Secret
  JWT_SECRET: "CHANGE_ME_RANDOM_64_CHAR_STRING"
  JWT_REFRESH_SECRET: "CHANGE_ME_ANOTHER_RANDOM_64_CHAR_STRING"
  
  # Session Secret
  SESSION_SECRET: "CHANGE_ME_RANDOM_32_CHAR_STRING"
  
  # API Keys
  SENDGRID_API_KEY: "SG.CHANGE_ME"
  STRIPE_SECRET_KEY: "sk_test_CHANGE_ME"
  STRIPE_WEBHOOK_SECRET: "whsec_CHANGE_ME"
  
  # Cloudflare
  CLOUDFLARE_API_TOKEN: "CHANGE_ME"
  
  # Redis Password (if using auth)
  REDIS_PASSWORD: ""

---
apiVersion: v1
kind: Secret
metadata:
  name: postgres-credentials
  namespace: production
type: Opaque
stringData:
  POSTGRES_USER: "postgres"
  POSTGRES_PASSWORD: "CHANGE_ME_STRONG_PASSWORD"
  POSTGRES_DB: "contracttocozy"
EOF
print_success "Created base/secrets.yaml.template"

print_header "Step 3: Generating Data Layer"

# PostgreSQL
cat > "$K8S_DIR/data/postgres/statefulset.yaml" << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: production
data:
  postgresql.conf: |
    # PostgreSQL configuration optimized for Raspberry Pi 5 (8GB RAM)
    max_connections = 100
    shared_buffers = 2GB
    effective_cache_size = 6GB
    maintenance_work_mem = 512MB
    checkpoint_completion_target = 0.9
    wal_buffers = 16MB
    default_statistics_target = 100
    random_page_cost = 1.1
    effective_io_concurrency = 200
    work_mem = 32MB
    min_wal_size = 1GB
    max_wal_size = 4GB
    max_worker_processes = 4
    max_parallel_workers_per_gather = 2
    max_parallel_workers = 4
    max_parallel_maintenance_workers = 2

---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: production
spec:
  type: ClusterIP
  ports:
    - port: 5432
      targetPort: 5432
  selector:
    app: postgres

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      nodeSelector:
        role: database
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: POSTGRES_DB
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: POSTGRES_USER
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-credentials
                  key: POSTGRES_PASSWORD
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          resources:
            requests:
              cpu: "1000m"
              memory: "2Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
          volumeMounts:
            - name: postgres-data
              mountPath: /var/lib/postgresql/data
            - name: postgres-config
              mountPath: /etc/postgresql/postgresql.conf
              subPath: postgresql.conf
          livenessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command:
                - /bin/sh
                - -c
                - pg_isready -U $POSTGRES_USER -d $POSTGRES_DB
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: postgres-config
          configMap:
            name: postgres-config
  volumeClaimTemplates:
    - metadata:
        name: postgres-data
      spec:
        accessModes: 
          - ReadWriteOnce
        storageClassName: local-path
        resources:
          requests:
            storage: 100Gi
EOF
print_success "Created data/postgres/statefulset.yaml"

# Redis
cat > "$K8S_DIR/data/redis/statefulset.yaml" << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: production
spec:
  type: ClusterIP
  ports:
    - port: 6379
      targetPort: 6379
  selector:
    app: redis

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: production
spec:
  serviceName: redis
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          command:
            - redis-server
            - --appendonly
            - "yes"
          ports:
            - containerPort: 6379
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "500m"
              memory: "1.5Gi"
          volumeMounts:
            - name: redis-data
              mountPath: /data
          livenessProbe:
            exec:
              command:
                - redis-cli
                - ping
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            exec:
              command:
                - redis-cli
                - ping
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
    - metadata:
        name: redis-data
      spec:
        accessModes:
          - ReadWriteOnce
        storageClassName: local-path
        resources:
          requests:
            storage: 10Gi
EOF
print_success "Created data/redis/statefulset.yaml"

print_header "Step 4: Generating Application Deployments"

# Frontend
cat > "$K8S_DIR/apps/frontend/deployment.yaml" << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: production
spec:
  type: ClusterIP
  ports:
    - port: 3000
      targetPort: 3000
  selector:
    app: frontend

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/madhuboyin/contract-to-cozy/frontend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: NODE_ENV
            - name: NEXT_PUBLIC_API_URL
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: NEXT_PUBLIC_API_URL
          resources:
            requests:
              cpu: "300m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: frontend-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: frontend-deployment
  minReplicas: 3
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
EOF
print_success "Created apps/frontend/deployment.yaml"

# Backend
cat > "$K8S_DIR/apps/backend/deployment.yaml" << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: production
spec:
  type: ClusterIP
  ports:
    - port: 8080
      targetPort: 8080
  selector:
    app: api

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-deployment
  namespace: production
spec:
  replicas: 5
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ghcr.io/madhuboyin/contract-to-cozy/backend:latest
          ports:
            - containerPort: 8080
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: NODE_ENV
            - name: PORT
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: API_PORT
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: DATABASE_URL
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: JWT_SECRET
            - name: REDIS_HOST
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: REDIS_HOST
          resources:
            requests:
              cpu: "500m"
              memory: "800Mi"
            limits:
              cpu: "1000m"
              memory: "1.2Gi"
          livenessProbe:
            httpGet:
              path: /api/health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-deployment
  minReplicas: 5
  maxReplicas: 12
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
EOF
print_success "Created apps/backend/deployment.yaml"

# Workers
cat > "$K8S_DIR/apps/workers/deployment.yaml" << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker-deployment
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/madhuboyin/contract-to-cozy/workers:latest
          env:
            - name: NODE_ENV
              valueFrom:
                configMapKeyRef:
                  name: app-config
                  key: NODE_ENV
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: DATABASE_URL
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "500m"
              memory: "1Gi"
EOF
print_success "Created apps/workers/deployment.yaml"

print_header "Step 5: Generating Ingress Configurations"

# Cloudflare Tunnel
cat > "$K8S_DIR/ingress/cloudflare-tunnel/deployment.yaml" << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: cloudflared-config
  namespace: production
data:
  config.yml: |
    tunnel: YOUR_TUNNEL_ID
    credentials-file: /etc/cloudflared/creds/credentials.json
    
    ingress:
      - hostname: contracttocozy.com
        service: http://frontend-service.production.svc.cluster.local:3000
      - hostname: www.contracttocozy.com
        service: http://frontend-service.production.svc.cluster.local:3000
      - hostname: api.contracttocozy.com
        service: http://api-service.production.svc.cluster.local:8080
      - service: http_status:404

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cloudflared
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: cloudflared
  template:
    metadata:
      labels:
        app: cloudflared
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args:
            - tunnel
            - --config
            - /etc/cloudflared/config.yml
            - run
          volumeMounts:
            - name: config
              mountPath: /etc/cloudflared
              readOnly: true
            - name: creds
              mountPath: /etc/cloudflared/creds
              readOnly: true
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "200m"
              memory: "256Mi"
      volumes:
        - name: config
          configMap:
            name: cloudflared-config
        - name: creds
          secret:
            secretName: cloudflared-credentials
EOF
print_success "Created ingress/cloudflare-tunnel/deployment.yaml"

print_header "Step 6: Generating Raspberry Pi Overlays"

# Kustomization
cat > "$K8S_DIR/overlays/raspberry-pi/kustomization.yaml" << 'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production

resources:
  - ../../base/namespace.yaml
  - ../../base/configmap.yaml
  - ../../data/postgres/statefulset.yaml
  - ../../data/redis/statefulset.yaml
  - ../../apps/frontend/deployment.yaml
  - ../../apps/backend/deployment.yaml
  - ../../apps/workers/deployment.yaml
  - ../../ingress/cloudflare-tunnel/deployment.yaml

patchesStrategicMerge:
  - resource-limits.yaml
  - node-selector.yaml

images:
  - name: ghcr.io/madhuboyin/contract-to-cozy/frontend
    newTag: latest-arm64
  - name: ghcr.io/madhuboyin/contract-to-cozy/backend
    newTag: latest-arm64
  - name: ghcr.io/madhuboyin/contract-to-cozy/workers
    newTag: latest-arm64

commonLabels:
  environment: production
  deployment: raspberry-pi
EOF
print_success "Created overlays/raspberry-pi/kustomization.yaml"

# Resource limits
cat > "$K8S_DIR/overlays/raspberry-pi/resource-limits.yaml" << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
  namespace: production
spec:
  replicas: 4
  template:
    spec:
      containers:
        - name: frontend
          resources:
            requests:
              cpu: "300m"
              memory: "512Mi"
            limits:
              cpu: "800m"
              memory: "1Gi"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-deployment
  namespace: production
spec:
  replicas: 5
  template:
    spec:
      containers:
        - name: api
          resources:
            requests:
              cpu: "400m"
              memory: "800Mi"
            limits:
              cpu: "1000m"
              memory: "1.2Gi"

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: frontend-hpa
  namespace: production
spec:
  minReplicas: 3
  maxReplicas: 8

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: production
spec:
  minReplicas: 5
  maxReplicas: 12
EOF
print_success "Created overlays/raspberry-pi/resource-limits.yaml"

# Node selector
cat > "$K8S_DIR/overlays/raspberry-pi/node-selector.yaml" << 'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  template:
    spec:
      nodeSelector:
        kubernetes.io/hostname: pi-node-6
        role: database

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-deployment
  namespace: production
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              preference:
                matchExpressions:
                  - key: kubernetes.io/hostname
                    operator: In
                    values:
                      - pi-node-2
                      - pi-node-3
EOF
print_success "Created overlays/raspberry-pi/node-selector.yaml"

print_header "Step 7: Generating Documentation"

# Create comprehensive README
cat > "$K8S_DIR/README.md" << 'EOFREADME'
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
EOFREADME
print_success "Created README.md"

print_header "Summary"
echo ""
echo -e "${GREEN}✓ All Kubernetes configurations generated!${NC}"
echo ""
echo "Files created:"
find "$K8S_DIR" -type f | sort
echo ""
echo -e "${BLUE}Total files: $(find "$K8S_DIR" -type f | wc -l)${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review files in infrastructure/kubernetes/"
echo "2. Commit to Git: git add infrastructure/kubernetes/"
echo "3. Label your Pi nodes"
echo "4. Create secrets"
echo "5. Deploy: kubectl apply -k infrastructure/kubernetes/overlays/raspberry-pi/"
echo ""
echo -e "${GREEN}Ready to deploy!${NC}"
