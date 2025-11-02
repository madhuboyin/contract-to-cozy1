**Deploy Data Layer**
This validates your cluster works before dealing with Docker images.
bash# Navigate to your repo
cd ~/contract-to-cozy

# 1. Apply ConfigMap
kubectl apply -f infrastructure/kubernetes/base/configmap.yaml

# 2. Label your database node (adjust node name if needed)
kubectl label node pi-node-6 role=database --overwrite
# Or if you don't have pi-node-6, use any node:
# kubectl get nodes  # find your node name
# kubectl label node <your-node-name> role=database

# 3. Deploy PostgreSQL
kubectl apply -f infrastructure/kubernetes/data/postgres/statefulset.yaml

# 4. Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n production --timeout=300s

# 5. Deploy Redis
kubectl apply -f infrastructure/kubernetes/data/redis/statefulset.yaml

# 6. Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis -n production --timeout=300s

# 7. Verify everything is running
kubectl get pods -n production
kubectl get pvc -n production
kubectl get svc -n production
```

### **Expected Output:**
```
NAME         READY   STATUS    RESTARTS   AGE
postgres-0   1/1     Running   0          2m
redis-0      1/1     Running   0          1m
Test the Data Layer:
bash# Test PostgreSQL
kubectl exec -it postgres-0 -n production -- psql -U postgres -d contracttocozy -c "SELECT version();"

# Test Redis
kubectl exec -it redis-0 -n production -- redis-cli ping
# Should output: PONG
