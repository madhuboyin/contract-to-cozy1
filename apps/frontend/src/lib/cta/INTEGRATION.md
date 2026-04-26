# CTA Contract System - Integration Guide

This guide shows how to integrate the CTA Contract System into your development workflow and CI/CD pipeline.

## Development Workflow

### 1. Install Dependencies

The CTA Contract System is built into the codebase and requires no additional dependencies.

### 2. Enable Runtime Validation

Runtime validation is automatically enabled in development mode. To use it:

```typescript
import { CTAValidator } from '@/lib/cta/runtime-validator';

function MyComponent() {
  const contract = cta('my-cta', 'MyComponent')
    .promises('Do something')
    .navigatesTo('/some-route')
    .build();

  return (
    <>
      <CTAValidator contract={contract} />
      {/* Your component JSX */}
    </>
  );
}
```

### 3. Check Console for Validation Errors

When running in development mode, validation errors and warnings will appear in the browser console:

- 🔴 **Errors**: Critical issues that must be fixed (missing page contracts, unsupported features)
- 🟡 **Warnings**: Potential issues to review (unknown parameters, unsupported metrics)
- ✅ **Success**: Contract validated successfully

## Build-Time Validation

### 1. Add Validation Script

Add the validation script to your `package.json`:

```json
{
  "scripts": {
    "validate-ctas": "tsx src/lib/cta/build-validator.ts",
    "build": "npm run validate-ctas && next build",
    "build:skip-validation": "next build"
  }
}
```

### 2. Install tsx (if not already installed)

```bash
npm install --save-dev tsx
```

### 3. Run Validation

```bash
# Validate CTAs without building
npm run validate-ctas

# Build with validation
npm run build

# Build without validation (for emergencies)
npm run build:skip-validation
```

### 4. Validation Output

The validation script will output:

```
🔍 Scanning for CTA contracts...

Found 47 CTA contracts in 23 files

✅ Validating contracts...

📊 Validation Summary
═══════════════════════════════════════
Total Contracts: 47
Errors: 0
Warnings: 3
Status: ✅ PASSED

🟡 WARNINGS

  🟡 [UNKNOWN_PARAMETER] Page /dashboard/resolution-center may not support parameter: customFilter
     Source: DynamicSidebarActions
     CTA: review-urgent-alerts

✅ All CTA contracts are valid!
```

## CI/CD Integration

### GitHub Actions

Add validation to your GitHub Actions workflow:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate-ctas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Validate CTA Contracts
        run: npm run validate-ctas
      
      - name: Build
        run: npm run build
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - build

validate-ctas:
  stage: validate
  script:
    - npm ci
    - npm run validate-ctas
  only:
    - merge_requests
    - main

build:
  stage: build
  script:
    - npm ci
    - npm run build
  only:
    - merge_requests
    - main
```

### Vercel

Add to your `vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm ci"
}
```

The validation will run automatically as part of the build command.

### Netlify

Add to your `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = ".next"

[build.environment]
  NODE_VERSION = "18"
```

## Pre-commit Hooks

### Using Husky

1. Install Husky:

```bash
npm install --save-dev husky
npx husky install
```

2. Add pre-commit hook:

```bash
npx husky add .husky/pre-commit "npm run validate-ctas"
```

3. The validation will run before every commit.

### Using lint-staged

For faster validation, only check changed files:

```bash
npm install --save-dev lint-staged
```

Add to `package.json`:

```json
{
  "lint-staged": {
    "**/*.{ts,tsx}": [
      "npm run validate-ctas"
    ]
  }
}
```

Update `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

## IDE Integration

### VS Code

Create a task to run validation:

```json
// .vscode/tasks.json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Validate CTA Contracts",
      "type": "npm",
      "script": "validate-ctas",
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "new"
      }
    }
  ]
}
```

Run with: `Cmd+Shift+P` → "Tasks: Run Task" → "Validate CTA Contracts"

### VS Code Keyboard Shortcut

Add to `keybindings.json`:

```json
{
  "key": "cmd+shift+v",
  "command": "workbench.action.tasks.runTask",
  "args": "Validate CTA Contracts"
}
```

## Monitoring and Alerts

### Slack Notifications

Add to your CI/CD pipeline:

```yaml
- name: Notify Slack on Validation Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    text: 'CTA validation failed! Check the logs for details.'
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

### Email Notifications

Configure your CI/CD platform to send email notifications on validation failures.

## Troubleshooting

### Validation Fails in CI but Passes Locally

1. Ensure you're using the same Node.js version
2. Clear npm cache: `npm cache clean --force`
3. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### False Positives

If validation reports errors for valid CTAs:

1. Check that page contracts are up to date in `contracts.ts`
2. Verify the route pattern matches (e.g., `/properties/:id` vs `/properties/123`)
3. Add the missing feature to the page contract if it's actually supported

### Performance Issues

If validation is slow:

1. Use lint-staged to only validate changed files
2. Cache node_modules in CI/CD
3. Run validation in parallel with other checks

## Best Practices

### 1. Run Validation Frequently

- Before every commit (pre-commit hook)
- On every pull request (CI/CD)
- Before every deployment

### 2. Treat Errors as Blockers

- Don't merge PRs with validation errors
- Don't deploy builds with validation errors
- Fix errors immediately

### 3. Review Warnings

- Warnings indicate potential issues
- Review and fix warnings regularly
- Don't ignore warnings indefinitely

### 4. Keep Page Contracts Updated

- Update page contracts when adding features
- Document new parameters
- Add new metric types

### 5. Monitor Validation Metrics

- Track validation pass rate
- Monitor error trends
- Set up alerts for failures

## Migration Checklist

- [ ] Add validation script to package.json
- [ ] Install tsx dependency
- [ ] Test validation locally
- [ ] Add to CI/CD pipeline
- [ ] Set up pre-commit hooks
- [ ] Configure IDE integration
- [ ] Set up monitoring/alerts
- [ ] Document for team
- [ ] Train team on usage
- [ ] Migrate existing CTAs

## Support

For issues or questions:

1. Check the [README](./README.md) for usage examples
2. Review the [audit findings](../../../../CTA_NAVIGATION_AUDIT_FINDINGS.md)
3. Check existing page contracts in `contracts.ts`
4. Ask in #engineering-help Slack channel

## Resources

- [CTA Contract System README](./README.md)
- [Builder API Documentation](./README.md#builder-api)
- [Page Contracts](./contracts.ts)
- [Example Implementations](./examples/)
- [Test Suite](./__tests__/)
