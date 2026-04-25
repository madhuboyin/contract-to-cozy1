# Contributing to Contract to Cozy

Thank you for your interest in contributing! 🎉

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/contract-to-cozy.git`
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Run tests: `make test`
6. Commit your changes: `git commit -m 'feat: add my feature'`
7. Push to your fork: `git push origin feature/my-feature`
8. Create a Pull Request

## Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance tasks

**Example:**
```
feat(frontend): add provider search functionality
```

## Code Style

- Run `make lint` before committing
- Follow existing code patterns
- Write meaningful comments
- Add tests for new features

## UI copy standards

- **Sentence case** for all labels, badges, section headers, button labels, and metadata text.
- **Title Case** only for page h1 headings and navigation items.
- **Never** render raw API/backend enum strings directly in the UI. Always pass through `formatStatusLabel()` or an equivalent formatter.
- **Never** expose internal model names, engine names, confidence percentages, or system architecture descriptions in user-facing UI.
- **Never** use `text-transform: uppercase` or the Tailwind `uppercase` class on label elements.

## Pull Request Process

1. Update README.md if needed
2. Ensure all tests pass
3. Request review from maintainers
4. Address review comments
5. Squash commits if requested

## Questions?

Open an issue or contact the maintainers.
