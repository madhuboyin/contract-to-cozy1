# 🏡 Contract to Cozy

> Platform connecting new homeowners with trusted service providers

[![CI](https://github.com/yourusername/contract-to-cozy/workflows/CI/badge.svg)](https://github.com/yourusername/contract-to-cozy/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Kubernetes](https://img.shields.io/badge/kubernetes-ready-326ce5.svg)](https://kubernetes.io)

## 🚀 Quick Start

### Local Development
```bash
# Install dependencies
make install

# Start development environment
make dev
```

### Raspberry Pi Deployment
```bash
# Setup cluster
make setup-pi-cluster

# Deploy to Pi
make deploy-pi
```

## 📚 Documentation

- [Architecture Overview](docs/architecture/overview.md)
- [API Documentation](docs/api/README.md)
- [Deployment Guide](docs/deployment/raspberry-pi-deployment.md)
- [Contributing Guide](CONTRIBUTING.md)

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Backend**: Node.js 20, Express, TypeScript
- **Database**: PostgreSQL 15, Redis 7
- **Infrastructure**: Kubernetes (k3s), Docker
- **CI/CD**: GitHub Actions

## 📁 Repository Structure

```
contract-to-cozy/
├── apps/              # Application code
├── infrastructure/    # K8s manifests, Terraform, Ansible
├── database/          # Migrations and seeds
├── config/            # Configuration files
├── docs/              # Documentation
└── tests/             # E2E and load tests
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.
