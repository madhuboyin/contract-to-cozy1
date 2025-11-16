For launching UI whenwe get PrismaClient error when accessing any table

cd ~/git/contract-to-cozy1/apps/backend

# Kill existing
pkill -f "port-forward.*postgres"

# Start port-forward
POD=$(kubectl get pod -n production -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n production pod/$POD 5432:5432 &

sleep 3

# Get password
PASSWORD=$(kubectl get secret postgres-credentials -n production -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# Run Prisma Studio with inline DATABASE_URL
DATABASE_URL="postgresql://postgres:${PASSWORD}@localhost:5432/contracttocozy?schema=public" \
npx prisma studio

# Backend

docker build -t ghcr.io/madhuboyin/contract-to-cozy/backend:latest -f ../../infrastructure/docker/backend/Dockerfile .
docker push ghcr.io/madhuboyin/contract-to-cozy/backend:latest

kubectl delete pods -n production -l app=api
kubectl get pods -n production -l app=api

# Frontend

docker build -t ghcr.io/madhuboyin/contract-to-cozy/frontend:latest -f ../../infrastructure/docker/frontend/Dockerfile .
docker push ghcr.io/madhuboyin/contract-to-cozy/frontend:latest

kubectl delete pods -n production -l app=frontend
kubectl get pods -n production -l app=frontend

#cloudfared configmap

nano /tmp/kubectl-edit-243034315.yaml
kubectl apply -f /tmp/kubectl-edit-243034315.yaml
kubectl -n production rollout restart deploy/cloudflared