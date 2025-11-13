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