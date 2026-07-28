#!/usr/bin/env bash
set -Eeuo pipefail

# Run the reviewed Savings and Benefits pilot source/program seed through a
# one-off Kubernetes Job. The backend image already contains the compiled
# JavaScript entry point, so the machine invoking this script needs kubectl,
# not Node.js or npm.
#
# This script intentionally runs:
#   node dist/scripts/seedSavingsBenefitsPilot.js
#
# It must never run `prisma db seed`: the comprehensive Prisma seed truncates
# users, properties, and related data.
#
# Usage:
#   ./run-savings-benefits-seed-job.sh
#
# Render the Job locally without contacting the cluster:
#   DRY_RUN=true ./run-savings-benefits-seed-job.sh
#
# Optional overrides:
#   NAMESPACE=production
#   BACKEND_IMAGE=ghcr.io/madhuboyin/contract-to-cozy/backend:latest
#   DATABASE_URL_SECRET=app-secrets
#   DATABASE_URL_SECRET_KEY=DATABASE_URL
#   JOB_NAME=savings-benefits-seed-...
#   JOB_WAIT_TIMEOUT=5m
#   POD_CREATION_TIMEOUT=60s
#   TTL_SECONDS_AFTER_FINISHED=86400
#   KUBECTL_CONTEXT=...
#   DRY_RUN=false

NAMESPACE="${NAMESPACE:-production}"
BACKEND_IMAGE="${BACKEND_IMAGE:-ghcr.io/madhuboyin/contract-to-cozy/backend:latest}"
DATABASE_URL_SECRET="${DATABASE_URL_SECRET:-app-secrets}"
DATABASE_URL_SECRET_KEY="${DATABASE_URL_SECRET_KEY:-DATABASE_URL}"
JOB_NAME="${JOB_NAME:-savings-benefits-seed-$(date +%s)-${RANDOM}}"
JOB_WAIT_TIMEOUT="${JOB_WAIT_TIMEOUT:-5m}"
POD_CREATION_TIMEOUT="${POD_CREATION_TIMEOUT:-60s}"
TTL_SECONDS_AFTER_FINISHED="${TTL_SECONDS_AFTER_FINISHED:-86400}"
KUBECTL_CONTEXT="${KUBECTL_CONTEXT:-}"
DRY_RUN="${DRY_RUN:-false}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command kubectl

validate_dns_label() {
  local label="$1"
  local field="$2"
  if [[ ${#label} -gt 63 ]] || ! [[ "${label}" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
    echo "${field} must be a valid Kubernetes DNS label: ${label}" >&2
    exit 1
  fi
}

validate_timeout() {
  local value="$1"
  local field="$2"
  if ! [[ "${value}" =~ ^[1-9][0-9]*(s|m|h)$ ]]; then
    echo "${field} must be a positive Kubernetes duration such as 60s or 5m." >&2
    exit 1
  fi
}

validate_dns_label "${NAMESPACE}" "NAMESPACE"
validate_dns_label "${DATABASE_URL_SECRET}" "DATABASE_URL_SECRET"
validate_dns_label "${JOB_NAME}" "JOB_NAME"
validate_timeout "${JOB_WAIT_TIMEOUT}" "JOB_WAIT_TIMEOUT"
validate_timeout "${POD_CREATION_TIMEOUT}" "POD_CREATION_TIMEOUT"

if ! [[ "${DATABASE_URL_SECRET_KEY}" =~ ^[A-Za-z_][A-Za-z0-9_.-]*$ ]]; then
  echo "DATABASE_URL_SECRET_KEY contains unsupported characters." >&2
  exit 1
fi

if ! [[ "${BACKEND_IMAGE}" =~ ^[A-Za-z0-9./:@_-]+$ ]]; then
  echo "BACKEND_IMAGE contains unsupported characters." >&2
  exit 1
fi

if ! [[ "${TTL_SECONDS_AFTER_FINISHED}" =~ ^[1-9][0-9]*$ ]]; then
  echo "TTL_SECONDS_AFTER_FINISHED must be a positive integer." >&2
  exit 1
fi

if [[ "${DRY_RUN}" != "true" && "${DRY_RUN}" != "false" ]]; then
  echo "DRY_RUN must be true or false." >&2
  exit 1
fi

KUBECTL=(kubectl)
if [[ -n "${KUBECTL_CONTEXT}" ]]; then
  KUBECTL+=(--context "${KUBECTL_CONTEXT}")
fi

render_job() {
  cat <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/name: savings-benefits-seed
    app.kubernetes.io/component: database-seed
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: ${TTL_SECONDS_AFTER_FINISHED}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: savings-benefits-seed
        app.kubernetes.io/component: database-seed
    spec:
      restartPolicy: Never
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        runAsGroup: 1001
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: seed
          image: ${BACKEND_IMAGE}
          imagePullPolicy: Always
          command:
            - node
            - dist/scripts/seedSavingsBenefitsPilot.js
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
          env:
            - name: NODE_ENV
              value: production
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${DATABASE_URL_SECRET}
                  key: ${DATABASE_URL_SECRET_KEY}
EOF
}

if [[ "${DRY_RUN}" == "true" ]]; then
  echo "Rendering the Savings and Benefits seed Job; no cluster resources will be created." >&2
  render_job
  exit 0
fi

echo "Checking Kubernetes access and database secret..."
"${KUBECTL[@]}" get namespace "${NAMESPACE}" >/dev/null
"${KUBECTL[@]}" get secret "${DATABASE_URL_SECRET}" \
  -n "${NAMESPACE}" >/dev/null

SECRET_KEY_PRESENT="$(
  "${KUBECTL[@]}" get secret "${DATABASE_URL_SECRET}" \
    -n "${NAMESPACE}" \
    -o "jsonpath={.data.${DATABASE_URL_SECRET_KEY}}" 2>/dev/null || true
)"
if [[ -z "${SECRET_KEY_PRESENT}" ]]; then
  echo \
    "Secret ${NAMESPACE}/${DATABASE_URL_SECRET} does not contain key ${DATABASE_URL_SECRET_KEY}." \
    >&2
  exit 1
fi
unset SECRET_KEY_PRESENT

diagnose_job() {
  echo "Job diagnostics for ${NAMESPACE}/${JOB_NAME}:" >&2
  "${KUBECTL[@]}" get job "${JOB_NAME}" \
    -n "${NAMESPACE}" -o wide >&2 || true
  "${KUBECTL[@]}" get pods \
    -n "${NAMESPACE}" \
    -l "job-name=${JOB_NAME}" \
    -o wide >&2 || true
  "${KUBECTL[@]}" describe job "${JOB_NAME}" \
    -n "${NAMESPACE}" >&2 || true
  "${KUBECTL[@]}" logs \
    -n "${NAMESPACE}" \
    "job/${JOB_NAME}" \
    --all-containers=true >&2 || true
}

echo "Creating Savings and Benefits seed Job ${NAMESPACE}/${JOB_NAME}..."
render_job | "${KUBECTL[@]}" create -f -

echo "Waiting for the Job pod to be created..."
if ! "${KUBECTL[@]}" wait \
  -n "${NAMESPACE}" \
  --for=create \
  pod \
  -l "job-name=${JOB_NAME}" \
  --timeout="${POD_CREATION_TIMEOUT}" >/dev/null; then
  echo "Seed pod was not created within ${POD_CREATION_TIMEOUT}." >&2
  diagnose_job
  exit 1
fi

POD_NAME="$(
  "${KUBECTL[@]}" get pods \
    -n "${NAMESPACE}" \
    -l "job-name=${JOB_NAME}" \
    -o jsonpath='{.items[0].metadata.name}'
)"

echo "Streaming logs for ${POD_NAME}..."
"${KUBECTL[@]}" logs \
  -f \
  -n "${NAMESPACE}" \
  "${POD_NAME}" \
  --pod-running-timeout="${POD_CREATION_TIMEOUT}" || true

echo "Waiting for the seed Job to complete..."
if "${KUBECTL[@]}" wait \
  -n "${NAMESPACE}" \
  --for=condition=complete \
  "job/${JOB_NAME}" \
  --timeout="${JOB_WAIT_TIMEOUT}"; then
  "${KUBECTL[@]}" logs \
    -n "${NAMESPACE}" \
    "job/${JOB_NAME}" \
    --all-containers=true || true
  echo "Savings and Benefits seed completed successfully: ${NAMESPACE}/${JOB_NAME}"
  exit 0
fi

echo "Savings and Benefits seed failed or timed out: ${NAMESPACE}/${JOB_NAME}" >&2
diagnose_job
exit 1
