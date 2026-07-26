#!/usr/bin/env bash
set -Eeuo pipefail

# Push the local Prisma schema to the production database through a one-off
# Kubernetes Job. The Job intentionally uses a clean, pinned Node image instead
# of the application image so database maintenance cannot be blocked by a
# damaged or stale application dependency layer.
#
# Usage:
#   ./run-schema-push-job.sh
#
# Optional overrides:
#   NAMESPACE=production
#   MIGRATION_IMAGE=node:22-bookworm@sha256:...
#   PRISMA_CLI_VERSION=5.22.0
#   DATABASE_URL_SECRET=app-secrets
#   DATABASE_URL_SECRET_KEY=DATABASE_URL
#   PRISMA_CONFIGMAP=prisma-schema
#   POD_CREATION_TIMEOUT=60s
#   POD_READY_TIMEOUT=2m
#   POD_STATUS_POLL_INTERVAL_SECONDS=2
#   JOB_WAIT_TIMEOUT_SECONDS=600
#   JOB_POLL_INTERVAL_SECONDS=3

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_PATH="${SCRIPT_DIR}/prisma/schema.prisma"

NAMESPACE="${NAMESPACE:-production}"
MIGRATION_IMAGE="${MIGRATION_IMAGE:-node:22-bookworm@sha256:5647be709086c696ff32edaaf1c70cd26d1da6ab2b39c32f3c7b4c4a31957e37}"
PRISMA_CLI_VERSION="${PRISMA_CLI_VERSION:-5.22.0}"
DATABASE_URL_SECRET="${DATABASE_URL_SECRET:-app-secrets}"
DATABASE_URL_SECRET_KEY="${DATABASE_URL_SECRET_KEY:-DATABASE_URL}"
PRISMA_CONFIGMAP="${PRISMA_CONFIGMAP:-prisma-schema}"
POD_CREATION_TIMEOUT="${POD_CREATION_TIMEOUT:-60s}"
POD_READY_TIMEOUT="${POD_READY_TIMEOUT:-2m}"
POD_STATUS_POLL_INTERVAL_SECONDS="${POD_STATUS_POLL_INTERVAL_SECONDS:-2}"
JOB_WAIT_TIMEOUT_SECONDS="${JOB_WAIT_TIMEOUT_SECONDS:-600}"
JOB_POLL_INTERVAL_SECONDS="${JOB_POLL_INTERVAL_SECONDS:-3}"
JOB_NAME="${JOB_NAME:-prisma-schema-push-$(date +%s)-${RANDOM}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command kubectl

if ! [[ "${JOB_WAIT_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "JOB_WAIT_TIMEOUT_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "${JOB_POLL_INTERVAL_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "JOB_POLL_INTERVAL_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "${POD_STATUS_POLL_INTERVAL_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "POD_STATUS_POLL_INTERVAL_SECONDS must be a positive integer." >&2
  exit 1
fi

if ! [[ "${PRISMA_CLI_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "PRISMA_CLI_VERSION must be an exact semantic version such as 5.22.0." >&2
  exit 1
fi

duration_seconds() {
  local value="$1"
  if [[ "${value}" =~ ^([1-9][0-9]*)s?$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "${value}" =~ ^([1-9][0-9]*)m$ ]]; then
    echo "$(( BASH_REMATCH[1] * 60 ))"
    return 0
  fi
  echo "Unsupported timeout '${value}'. Use positive seconds (for example 60s) or minutes (for example 2m)." >&2
  return 1
}

POD_READY_TIMEOUT_SECONDS="$(duration_seconds "${POD_READY_TIMEOUT}")" || exit 1

if [[ ! -r "${SCHEMA_PATH}" ]]; then
  echo "Prisma schema not found or unreadable: ${SCHEMA_PATH}" >&2
  exit 1
fi

echo "Checking Kubernetes access and database secret..."
kubectl get namespace "${NAMESPACE}" >/dev/null
kubectl get secret "${DATABASE_URL_SECRET}" -n "${NAMESPACE}" >/dev/null
DATABASE_URL_SECRET_VALUE="$(
  kubectl get secret "${DATABASE_URL_SECRET}" \
    -n "${NAMESPACE}" \
    -o "jsonpath={.data.${DATABASE_URL_SECRET_KEY}}" 2>/dev/null || true
)"
if [[ -z "${DATABASE_URL_SECRET_VALUE}" ]]; then
  echo \
    "Secret ${NAMESPACE}/${DATABASE_URL_SECRET} does not contain key ${DATABASE_URL_SECRET_KEY}." \
    >&2
  exit 1
fi
unset DATABASE_URL_SECRET_VALUE

diagnose_job() {
  echo "Job diagnostics for ${NAMESPACE}/${JOB_NAME}:" >&2
  kubectl get job "${JOB_NAME}" -n "${NAMESPACE}" -o wide >&2 || true
  kubectl get pods \
    -n "${NAMESPACE}" \
    -l "job-name=${JOB_NAME}" \
    -o wide >&2 || true

  local pod_name
  pod_name="$(
    kubectl get pods \
      -n "${NAMESPACE}" \
      -l "job-name=${JOB_NAME}" \
      -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true
  )"
  if [[ -n "${pod_name}" ]]; then
    kubectl describe pod "${pod_name}" -n "${NAMESPACE}" >&2 || true
    kubectl logs \
      -n "${NAMESPACE}" \
      "${pod_name}" \
      --all-containers=true >&2 || true
  fi

  if [[ -n "${pod_name}" ]]; then
    echo "Events for pod ${pod_name}:" >&2
    kubectl get events \
      -n "${NAMESPACE}" \
      --field-selector "involvedObject.name=${pod_name}" \
      --sort-by='.lastTimestamp' >&2 || true
  fi
}

job_status_value() {
  local jsonpath="$1"
  kubectl get job "${JOB_NAME}" \
    -n "${NAMESPACE}" \
    -o "jsonpath=${jsonpath}" 2>/dev/null || true
}

wait_for_pod_ready_or_terminal() {
  local deadline
  deadline="$(( $(date +%s) + POD_READY_TIMEOUT_SECONDS ))"

  while (( $(date +%s) < deadline )); do
    local pod_state phase ready
    pod_state="$(
      kubectl get pod "${POD_NAME}" \
        -n "${NAMESPACE}" \
        -o 'jsonpath={.status.phase}|{.status.conditions[?(@.type=="Ready")].status}' \
        2>/dev/null || true
    )"
    phase="${pod_state%%|*}"
    ready="${pod_state#*|}"

    if [[ "${ready}" == "True" ]]; then
      return 0
    fi
    if [[ "${phase}" == "Succeeded" ]]; then
      return 10
    fi
    if [[ "${phase}" == "Failed" ]]; then
      return 11
    fi
    sleep "${POD_STATUS_POLL_INTERVAL_SECONDS}"
  done

  return 12
}

wait_for_job_terminal() {
  local deadline
  deadline="$(( $(date +%s) + JOB_WAIT_TIMEOUT_SECONDS ))"

  while (( $(date +%s) < deadline )); do
    local succeeded failed
    succeeded="$(job_status_value '{.status.succeeded}')"
    failed="$(job_status_value '{.status.failed}')"

    if [[ -n "${succeeded}" && "${succeeded}" != "0" ]]; then
      return 0
    fi
    if [[ -n "${failed}" && "${failed}" != "0" ]]; then
      return 1
    fi
    sleep "${JOB_POLL_INTERVAL_SECONDS}"
  done

  return 2
}

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
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: migrate
          image: ${MIGRATION_IMAGE}
          imagePullPolicy: IfNotPresent
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
          command:
            - /bin/sh
            - -ec
          args:
            - |
              echo "Applying Prisma schema from ConfigMap..."
              echo "Architecture: \$(uname -m)"
              echo "Installing pinned Prisma CLI ${PRISMA_CLI_VERSION} in ephemeral storage..."
              mkdir -p "\${HOME}" "\${NPM_CONFIG_CACHE}"
              cd /tmp
              npx --yes --package=prisma@${PRISMA_CLI_VERSION} prisma --version
              npx --yes --package=prisma@${PRISMA_CLI_VERSION} prisma db push \
                --accept-data-loss \
                --skip-generate \
                --schema=/config/schema.prisma
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${DATABASE_URL_SECRET}
                  key: ${DATABASE_URL_SECRET_KEY}
            - name: HOME
              value: /tmp/prisma-home
            - name: NPM_CONFIG_CACHE
              value: /tmp/npm-cache
          volumeMounts:
            - name: schema-volume
              mountPath: /config
              readOnly: true
      volumes:
        - name: schema-volume
          configMap:
            name: ${PRISMA_CONFIGMAP}
EOF

echo "Waiting for the Job pod to be created..."
if ! kubectl wait \
  -n "${NAMESPACE}" \
  --for=create \
  pod \
  -l "job-name=${JOB_NAME}" \
  --timeout="${POD_CREATION_TIMEOUT}" >/dev/null; then
  echo "Migration pod was not created within ${POD_CREATION_TIMEOUT}." >&2
  diagnose_job
  exit 1
fi

POD_NAME="$(
  kubectl get pods \
    -n "${NAMESPACE}" \
    -l "job-name=${JOB_NAME}" \
    -o jsonpath='{.items[0].metadata.name}'
)"

echo "Waiting up to ${POD_READY_TIMEOUT} for pod ${POD_NAME} to become ready..."
if wait_for_pod_ready_or_terminal; then
  :
else
  POD_WAIT_RESULT="$?"
  if [[ "${POD_WAIT_RESULT}" == "10" ]]; then
    kubectl logs -n "${NAMESPACE}" "${POD_NAME}" --all-containers=true || true
    echo "Schema push completed successfully: ${NAMESPACE}/${JOB_NAME}"
    exit 0
  fi
  if [[ "${POD_WAIT_RESULT}" == "11" ]]; then
    echo "Migration pod ${POD_NAME} terminated with failure before becoming ready." >&2
    diagnose_job
    exit 1
  fi
  echo \
    "Migration pod did not become ready within ${POD_READY_TIMEOUT}. " \
    "This commonly indicates an image pull, volume mount, secret, or scheduling failure." \
    >&2
  diagnose_job
  exit 1
fi

echo "Streaming logs for ${POD_NAME}..."
kubectl logs \
  -f \
  -n "${NAMESPACE}" \
  "${POD_NAME}" \
  --request-timeout="${JOB_WAIT_TIMEOUT_SECONDS}s" || true

echo "Waiting for terminal Job status..."
if wait_for_job_terminal; then
  echo "Schema push completed successfully: ${NAMESPACE}/${JOB_NAME}"
  exit 0
else
  WAIT_RESULT="$?"
  if [[ "${WAIT_RESULT}" == "1" ]]; then
    echo "Schema push failed: ${NAMESPACE}/${JOB_NAME}" >&2
  else
    echo \
      "Schema push timed out after ${JOB_WAIT_TIMEOUT_SECONDS}s: ${NAMESPACE}/${JOB_NAME}" \
      >&2
  fi
  diagnose_job
  exit 1
fi
