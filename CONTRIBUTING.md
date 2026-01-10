# Contributing to StellarStack

Thank you for your interest in contributing to StellarStack! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Be kind, patient, and considerate to other contributors.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 15+
- Git
- Docker (for testing daemon integration)

### Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork:**

```bash
git clone https://github.com/YOUR_USERNAME/stellarstack.git
cd stellarstack/stack
```

3. **Install dependencies:**

```bash
pnpm install
```

4. **Set up environment variables:**

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

5. **Set up the database:**

```bash
cd apps/api
pnpm db:push
pnpm db:generate
cd ../..
```

6. **Start development servers:**

```bash
pnpm dev
```

## Project Structure

```
stack/
├── apps/
│   ├── api/           # Backend API (Hono + Prisma)
│   │   ├── src/
│   │   │   ├── lib/       # Shared utilities
│   │   │   ├── middleware/ # Hono middleware
│   │   │   └── routes/    # API routes
│   │   └── prisma/        # Database schema
│   ├── web/           # Frontend (Next.js)
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   └── lib/           # Utilities & API client
│   └── docs/          # Documentation site
└── packages/
    └── ui/            # Shared UI components
```

## Making Changes

### Branch Naming

Branch names should use descriptive names. Including Linear ticket IDs is recommended but optional:

**With Linear tickets (recommended):**

```
<type>/STE-<number>-<description>
```

Examples:

- `feat/STE-123-add-backup-encryption` - New features
- `fix/STE-456-console-reconnect-issue` - Bug fixes
- `docs/STE-789-update-api-reference` - Documentation
- `refactor/STE-321-cleanup-auth-middleware` - Code improvements

**Without Linear tickets (also valid):**

- `feat/add-backup-encryption` - New features
- `fix/console-reconnect-issue` - Bug fixes
- `docs/update-api-reference` - Documentation
- `refactor/cleanup-auth-middleware` - Code improvements

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with **optional Linear ticket IDs**. Linear tickets are strongly recommended for tracking but not required.

**Format:**

```
<type>: [STE-<number>] <description>

[optional body]

[optional footer]
```

**Commit Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code formatting (no logic change)
- `refactor` - Code restructuring
- `test` - Test additions or updates
- `chore` - Maintenance tasks
- `perf` - Performance improvements
- `ci` - CI/CD changes
- `build` - Build system changes

**Examples with Linear tickets (recommended):**

```bash
feat: STE-123 add webhook retry with exponential backoff
fix: STE-456 resolve console disconnect on browser tab switch
docs: STE-789 update installation instructions
chore: STE-321 upgrade dependencies to latest versions
```

**Examples without Linear tickets (also valid):**

```bash
feat: add dark mode support
fix: resolve memory leak in WebSocket handler
docs: update API documentation
chore: upgrade dependencies
```

**Getting Linear Tickets:**

- View tickets at: https://linear.app/stellarstack
- Create a new issue for your work before committing (recommended)
- Reference the ticket ID in your commit message for better tracking

**Commit Validation:**
Git hooks will automatically validate your commit messages. Invalid commits will be rejected with a helpful error message. The hook checks:

- Commit type is valid (feat, fix, docs, etc.)
- Description is not empty

If you see a validation error, fix your commit message:

```bash
# Fix the last commit message
git commit --amend -m "feat: correct message format"
```

### Code Style

- **TypeScript**: Use strict TypeScript with proper types
- **Formatting**: Code is formatted with Prettier (run automatically on commit)
- **Linting**: Follow ESLint rules
- **Naming**: Use camelCase for variables/functions, PascalCase for components/types

### Testing

Before submitting a PR:

1. **Run type checking:**

```bash
pnpm typecheck
# or
npx tsc --noEmit
```

2. **Run linting:**

```bash
pnpm lint
```

3. **Test your changes manually** in both development and production builds

## Pull Requests

### Before Submitting

1. **Update from main:**

```bash
git fetch upstream
git rebase upstream/main
```

2. **Test your changes** thoroughly

3. **Update documentation** if needed

### PR Guidelines

- **Title**: Use a clear, descriptive title
- **Description**: Explain what changes you made and why
- **Screenshots**: Include screenshots for UI changes
- **Breaking Changes**: Clearly note any breaking changes

### PR Template

```markdown
## Description

Brief description of the changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

How did you test these changes?

## Screenshots (if applicable)

Add screenshots here

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review
- [ ] I have added comments for hard-to-understand code
- [ ] I have updated relevant documentation
- [ ] My changes don't generate new warnings
- [ ] I have tested my changes locally
```

## Releases

StellarStack uses automated releases powered by [release-please](https://github.com/googleapis/release-please). You don't need to worry about versioning or changelogs—they're generated automatically.

### How It Works

1. **Commit with Conventional Format**: Your commits following the conventional format drive the release process
   - `feat:` commits trigger a **minor** version bump (0.1.0 → 0.2.0)
   - `fix:` commits trigger a **patch** version bump (0.1.0 → 0.1.1)
   - `BREAKING CHANGE:` in commit body triggers a **major** version bump (0.1.0 → 1.0.0)

2. **Release PR Created**: When commits are merged to `master`, release-please automatically:
   - Analyzes commits since last release
   - Determines the next version number
   - Generates a CHANGELOG.md with categorized changes
   - Creates a pull request with these updates

3. **Merge to Release**: When the release PR is merged:
   - A GitHub release is created with the new version tag
   - Linear ticket IDs in the changelog are automatically linked
   - Docker images are built and pushed to Docker Hub
   - The manifest file is updated with the new version

### Linear Ticket Links

Release notes automatically link Linear tickets. For example:

- Commit: `feat: STE-123 add backup encryption`
- Changelog: `feat: [STE-123](https://linear.app/stellarstack/issue/STE-123) add backup encryption`

This makes it easy to trace changes back to their original issues.

## Areas for Contribution

### Good First Issues

Look for issues labeled `good first issue` - these are beginner-friendly tasks.

### High Priority Areas

- **Documentation**: Improving guides and API docs
- **Testing**: Adding unit and integration tests
- **UI/UX**: Accessibility improvements
- **Performance**: Optimizing slow operations
- **Security**: Identifying and fixing vulnerabilities

### Feature Requests

Before starting work on a new feature:

1. Check if an issue already exists
2. Create an issue to discuss the feature
3. Wait for maintainer feedback before starting

## Reporting Bugs

### Before Reporting

1. Search existing issues to avoid duplicates
2. Try reproducing with the latest version
3. Check if it's a known issue in the README

### Bug Report Template

```markdown
## Description

Clear description of the bug

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior

What should happen

## Actual Behavior

What actually happens

## Environment

- OS: [e.g., macOS 14.0]
- Browser: [e.g., Chrome 120]
- Node.js: [e.g., 20.10.0]
- StellarStack version: [e.g., 0.1.0-alpha]

## Screenshots/Logs

Add relevant screenshots or error logs
```

## Security Vulnerabilities

**Do not** report security vulnerabilities through public GitHub issues.

Instead, please email security@stellarstack.dev (or the maintainer directly) with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and work with you to address the issue.

## Questions?

- **Discord**: Join our Discord server for real-time help
- **Discussions**: Use GitHub Discussions for questions
- **Issues**: For bugs and feature requests

## License

By contributing to StellarStack, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to StellarStack! Your help makes this project better for everyone.
