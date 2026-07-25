#!/usr/bin/env bash
set -Eeuo pipefail

# Push the local Prisma schema to the production database through a one-off
# Kubernetes Job. The backend image already contains Prisma, so the Job invokes
# that binary directly instead of asking npx to download a version at runtime.
#
# Usage:
#   ./run-schema-push-job.sh
#
# Optional overrides:
#   NAMESPACE=production
#   BACKEND_IMAGE=ghcr.io/madhuboyin/contract-to-cozy/backend:latest
#   DATABASE_URL_SECRET=app-secrets
#   DATABASE_URL_SECRET_KEY=DATABASE_URL
#   PRISMA_CONFIGMAP=prisma-schema
#   JOB_WAIT_TIMEOUT=10m

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="${SCRIPT_DIR}/prisma/schema.prisma"

NAMESPACE="${NAMESPACE:-production}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/madhuboyin/contract-to-cozy/backend:latest}"
DATABASE_URL_SECRET="${DATABASE_URL_SECRET:-app-secrets}"
DATABASE_URL_SECRET_KEY="${DATABASE_URL_SECRET_KEY:-DATABASE_URL}"
PRISMA_CONFIGMAP="${PRISMA_CONFIGMAP:-prisma-schema}"
JOB_WAIT_TIMEOUT="${JOB_WAIT_TIMEOUT:-10m}"
JOB_NAME="${JOB_NAME:-prisma-schema-push-$(date +%s)-${RANDOM}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command kubectl

if [[ ! -r "${SCHEMA_PATH}" ]]; then
  echo "Prisma schema not found or unreadable: ${SCHEMA_PATH}" >&2
  exit 1
fi

echo "Checking Kubernetes access and database secret..."
kubectl get namespace "${NAMESPACE}" >/dev/null
kubectl get secret "${DATABASE_URL_SECRET}" -n "${NAMESPACE}" >/dev/null

echo "Updating ConfigMap ${NAMESPACE}/${PRISMA_CONFIGMAP}..."
kubectl create configmap "${PRISMA_CONFIGMAP}" \
  -n "${NAMESPACE}" \
  --from-file="schema.prisma=${SCHEMA_PATH}" \
  --dry-run=client \
  -o yaml |
  kubectl apply --server-side -f -

echo "Creating migration Job ${NAMESPACE}/${JOB_NAME}..."
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: prisma-schema-push
    app.kubernetes.io/component: database-migration
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 600
  template:
    metadata:
      labels:
        app.kubernetes.io/name: prisma-schema-push
        app.kubernetes.io/component: database-migration
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${BACKEND_IMAGE}
          imagePullPolicy: Always
          command:
            - /bin/sh
            - -ec
          args:
            - |
              echo "Applying Prisma schema from ConfigMap..."
              echo "Architecture: \$(uname -m)"
              cd /app
              test -x ./node_modules/.bin/prisma
              ./node_modules/.bin/prisma --version
              ./node_modules/.bin/prisma db push \
                --accept-data-loss \
                --skip-generate \
                --schema=/config/schema.prisma
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${DATABASE_URL_SECRET}
                  key: ${DATABASE_URL_SECRET_KEY}
          volumeMounts:
            - name: schema-volume
              mountPath: /config
              readOnly: true
      volumes:
        - name: schema-volume
          configMap:
            name: ${PRISMA_CONFIGMAP}
EOF

echo "Streaming logs for ${JOB_NAME}..."
kubectl logs \
  -f \
  -n "${NAMESPACE}" \
  "job/${JOB_NAME}" \
  --pod-running-timeout=2m || true

JOB_SUCCEEDED="$(
  kubectl get job "${JOB_NAME}" \
    -n "${NAMESPACE}" \
    -o jsonpath='{.status.succeeded}' 2>/dev/null || true
)"
JOB_FAILED="$(
  kubectl get job "${JOB_NAME}" \
    -n "${NAMESPACE}" \
    -o jsonpath='{.status.failed}' 2>/dev/null || true
)"

if [[ "${JOB_SUCCEEDED}" == "1" ]]; then
  echo "Schema push completed successfully: ${NAMESPACE}/${JOB_NAME}"
  exit 0
fi

if [[ -n "${JOB_FAILED}" && "${JOB_FAILED}" != "0" ]]; then
  echo "Schema push failed: ${NAMESPACE}/${JOB_NAME}" >&2
  kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" -o wide >&2 || true
  kubectl get pods -n "${NAMESPACE}" -l "job-name=${JOB_NAME}" -o wide >&2 || true
  kubectl logs -n "${NAMESPACE}" "job/${JOB_NAME}" --all-containers=true >&2 || true
  exit 1
fi

if kubectl wait \
  -n "${NAMESPACE}" \
  --for=condition=complete \
  "job/${JOB_NAME}" \
  --timeout="${JOB_WAIT_TIMEOUT}"; then
  echo "Schema push completed successfully: ${NAMESPACE}/${JOB_NAME}"
  exit 0
fi

echo "Schema push failed or timed out: ${NAMESPACE}/${JOB_NAME}" >&2
kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" -o wide >&2 || true
kubectl get pods -n "${NAMESPACE}" -l "job-name=${JOB_NAME}" -o wide >&2 || true
kubectl logs -n "${NAMESPACE}" "job/${JOB_NAME}" --all-containers=true >&2 || true
exit 1
