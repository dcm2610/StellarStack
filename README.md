<p align="center">
  <img width="150" height="150" src="https://f005.backblazeb2.com/file/stellarstack/stellar-stack.png" alt="StellarStack Logo">
  <h1 align="center">StellarStack</h1>
  <p align="center">
    A modern, open-source game server management panel
    <br />
    <a href="https://stellarstack.app"><strong>stellarstack.app</strong></a>
    ·
    <a href="https://github.com/StellarStackOSS/StellarStack/releases"><strong>Releases</strong></a>
    ·
    <a href="https://linear.app/stellarstack"><strong>Linear</strong></a>
  </p>
  <p align="center">
    <a href="https://github.com/StellarStackOSS/StellarStack/blob/master/LICENSE">
      <img src="https://img.shields.io/static/v1?label=License&message=MIT&color=blue" />
    </a>
    <a href="https://github.com/StellarStackOSS/StellarStack">
      <img src="https://img.shields.io/static/v1?label=Backend&message=Hono&color=E36002" />
    </a>
    <a href="https://github.com/StellarStackOSS/StellarStack">
      <img src="https://img.shields.io/static/v1?label=Frontend&message=Next.js%2015&color=000" />
    </a>
    <a href="https://github.com/StellarStackOSS/StellarStack">
      <img src="https://img.shields.io/static/v1?label=Daemon&message=Rust&color=DEA584" />
    </a>
  </p>
</p>

StellarStack is an open-source game server hosting panel built for the modern era. Manage Minecraft, Terraria, Valheim, and more from a unified interface with real-time monitoring, automated backups, and granular permissions.

Self-host on your infrastructure or deploy to the cloud. Your servers, your control.

> [!IMPORTANT]
> **Alpha Software: Not Production Ready**
>
> StellarStack is in active development and should **NOT** be used in production environments.
>
> **What to expect:**
>
> - Breaking changes between versions
> - Incomplete features and rough edges
> - Potential security vulnerabilities
> - Possible data loss
>
> **Use at your own risk.** Contributions welcome—see [Contributing](#contributing) for guidelines.

---

## The Problem

Game server hosting hasn't evolved with the rest of web infrastructure. Most panels are:

- **Single-server focused** - Managing 10+ servers means juggling 10+ tabs
- **Feature-frozen** - Built on PHP codebases from 2010, resistant to change
- **Permission-limited** - Either full admin access or nothing
- **Backup-neglected** - Manual backups or expensive third-party solutions
- **Mobile-unfriendly** - Designed for desktop in a mobile-first world

Meanwhile, Vercel revolutionized web deployment. Kubernetes transformed container orchestration. Why are game servers stuck in the past?

---

## The Vision

StellarStack applies modern infrastructure patterns to game server management:

- **Multi-server by design** - Unified dashboard for all your servers across multiple nodes
- **Permission-granular** - 45+ permission nodes for precise access control
- **Automation-first** - Scheduled backups, tasks, webhooks, and event triggers
- **Real-time everything** - WebSocket-powered console, stats, and notifications
- **API-driven** - REST API with full panel feature parity
- **Self-hostable** - Your hardware, your data, your rules

Built with TypeScript, Rust, and modern frameworks. Open-source from day one.

---

## How It Works

StellarStack uses a **daemon-per-node architecture**:

1. **API Server** (Hono + PostgreSQL) - Central control plane for authentication, permissions, and orchestration
2. **Web Panel** (Next.js 15) - Real-time dashboard with WebSocket updates
3. **Daemon Nodes** (Rust) - One per physical server, manages Docker containers running game servers
4. **Database** (PostgreSQL + Prisma) - Single source of truth with row-level security

### Key Concepts

- **Servers** - Individual game server instances running in Docker containers
- **Nodes** - Physical or virtual machines running the Rust daemon
- **Locations** - Logical grouping of nodes (e.g., "US-East", "EU-West")
- **Blueprints** - Pre-configured templates for common game servers
- **Subusers** - Invite players with custom permissions (console access, file manager, etc.)

Game servers stay isolated in Docker. The daemon handles port allocation, resource limits, and container lifecycle. The panel provides the interface.

---

## Core Features

| Category                 | Features                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Server Management**    | Multi-server dashboard · Real-time console · Power controls · Resource monitoring · File manager · SFTP |
| **Automation & Backups** | Scheduled backups · Retention policies · One-click restore · Task scheduling · Webhooks                 |
| **User Management**      | Granular permissions (45+ nodes) · Subuser invites · OAuth (Google, GitHub, Discord) · 2FA + Passkeys   |
| **Administration**       | Node management · Location grouping · Blueprint system · IP/port allocation · White-label branding      |
| **Developer Experience** | REST API · WebSocket events · Docker-based isolation · Database migrations · Monorepo architecture      |
| **Security**             | bcrypt hashing · AES-256-CBC encryption · Rate limiting · CSRF protection · Security headers            |

---

## Tech Stack

### **Backend (API)**

- **[Hono](https://hono.dev/)** - Lightweight web framework (~40k req/s)
- **[Better Auth](https://better-auth.com/)** - Session management with OAuth, 2FA, passkeys
- **[Prisma](https://prisma.io/)** - Type-safe ORM with PostgreSQL
- **[WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)** - Real-time console and stats

### **Frontend (Web Panel)**

- **[Next.js 15](https://nextjs.org/)** - React framework with App Router
- **[React 19](https://react.dev/)** - UI library with Server Components
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first styling
- **[shadcn/ui](https://ui.shadcn.com/)** - Accessible component library
- **[TanStack Query](https://tanstack.com/query)** - Data fetching and caching

### **Daemon (Nodes)**

- **[Rust](https://rust-lang.org/)** - Systems programming for performance
- **[Docker](https://docker.com/)** - Container runtime for server isolation
- **[Tokio](https://tokio.rs/)** - Async runtime for concurrent operations

### **Infrastructure**

- **[pnpm](https://pnpm.io/)** - Fast, disk-efficient package manager
- **[Turborepo](https://turbo.build/)** - Monorepo build system with caching
- **[PostgreSQL](https://postgresql.org/)** - Primary database
- **[Docker Compose](https://docs.docker.com/compose/)** - Local development environment

### **DevOps**

- **GitHub Actions** - CI/CD for Docker builds and releases
- **[release-please](https://github.com/googleapis/release-please)** - Automated changelog and versioning
- **commitlint** - Conventional commits with Linear ticket integration

---

## Project Structure

```
stellarstack/
├── apps/
│   ├── api/               # Backend API (Hono + Prisma)
│   │   ├── src/
│   │   │   ├── routes/    # API endpoints
│   │   │   ├── middleware/# Auth, rate limiting, CORS
│   │   │   ├── lib/       # Utilities (auth, crypto, validation)
│   │   │   └── index.ts   # Entry point
│   │   └── prisma/        # Database schema and migrations
│   ├── web/               # Frontend panel (Next.js)
│   │   ├── app/           # App Router pages
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks (WebSocket, queries)
│   │   └── lib/           # Client utilities (API client, auth)
│   └── home/              # Landing page (Next.js)
├── packages/
│   ├── ui/                # Shared UI components
│   ├── eslint-config/     # Shared ESLint configs
│   └── typescript-config/ # Shared TypeScript configs
├── .github/
│   └── workflows/         # CI/CD pipelines
├── docker/
│   ├── dockerfiles/       # API and web Dockerfiles
│   └── daemon-release.yml # Daemon build workflow
└── install-script.sh      # One-command Ubuntu installer
```

---

## Getting Started

### Prerequisites

- **Node.js** 20+ ([nodejs.org](https://nodejs.org/))
- **pnpm** 10+ (`npm install -g pnpm`)
- **PostgreSQL** 15+ ([postgresql.org](https://postgresql.org/))
- **Docker** (for daemon) ([docker.com](https://docker.com/))

### Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/StellarStackOSS/StellarStack.git
cd StellarStack

# Install dependencies
pnpm install

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Configure .env files with your database and secrets
# Required: DATABASE_URL, BETTER_AUTH_SECRET

# Initialize database
cd apps/api
pnpm db:push
pnpm db:generate
cd ../..

# Start development servers
pnpm dev
```

**Access the panel:**

- Web: http://localhost:3000
- API: http://localhost:3001

### Quick Start (Production - Ubuntu)

One-command installer for Ubuntu 22.04+:

```bash
curl -sSL https://raw.githubusercontent.com/StellarStackOSS/StellarStack/master/install-script.sh | sudo bash
```

This installs:

- Docker and Docker Compose
- PostgreSQL database
- API and web containers
- nginx reverse proxy
- SSL via Certbot (if domain provided)

See the [Installation Guide](https://github.com/StellarStackOSS/StellarStack#installation) for detailed steps and manual setup.

### Docker Compose (Self-Hosting)

```bash
# Clone repository
git clone https://github.com/StellarStackOSS/StellarStack.git
cd StellarStack

# Copy and configure environment
cp .env.example .env
# Edit .env with your secrets

# Start services
docker-compose up -d

# Create admin user
docker exec stellarstack-api pnpm db:seed
```

---

## Environment Variables

### Required

| Variable             | Description                             | Example                                    |
| -------------------- | --------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`       | PostgreSQL connection string            | `postgresql://user:pass@localhost:5432/db` |
| `BETTER_AUTH_SECRET` | Session signing secret (32+ characters) | Generated automatically by installer       |

### Production Required

| Variable                | Description                     | Example                     |
| ----------------------- | ------------------------------- | --------------------------- |
| `FRONTEND_URL`          | Panel URL (not localhost)       | `https://panel.example.com` |
| `API_URL`               | API URL (not localhost)         | `https://api.example.com`   |
| `DOWNLOAD_TOKEN_SECRET` | Secret for file download tokens | 32+ character random string |
| `ENCRYPTION_KEY`        | 32-byte hex for AES-256-CBC     | 64 hex characters           |
| `JWT_SECRET`            | JWT signing secret              | 32+ character random string |

### Optional (OAuth)

| Variable                | Description             |
| ----------------------- | ----------------------- |
| `GOOGLE_CLIENT_ID`      | Google OAuth client ID  |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth secret     |
| `GITHUB_CLIENT_ID`      | GitHub OAuth client ID  |
| `GITHUB_CLIENT_SECRET`  | GitHub OAuth secret     |
| `DISCORD_CLIENT_ID`     | Discord OAuth client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth secret    |

---

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feat/STE-123-amazing-feature`)
3. **Commit using conventional commits** (see format below)
4. **Push to your fork** (`git push origin feat/STE-123-amazing-feature`)
5. **Open a Pull Request**

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on code style, testing, and PR requirements.

### Commit Message Format

We use [Conventional Commits](https://conventionalcommits.org/) with optional Linear ticket IDs:

```
type: [STE-XXX] description

Examples with Linear tickets (recommended):
feat: STE-123 add user authentication
fix: STE-456 resolve database connection timeout
docs: STE-789 update installation guide

Examples without Linear tickets (also valid):
feat: add user authentication
fix: resolve database connection timeout
docs: update installation guide
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

**Git hooks enforce conventional commit format.** Linear tickets are recommended but optional. Get Linear tickets at: https://linear.app/stellarstack

---

## Releases

StellarStack uses automated releases via [release-please](https://github.com/googleapis/release-please):

1. **Conventional commits** determine version bump (feat = minor, fix = patch)
2. **Release-please** creates a PR with changelog and version bump
3. **Merge the PR** to trigger GitHub release
4. **Docker images** automatically built and pushed to Docker Hub

All releases link Linear tickets in the changelog. See [Releases](https://github.com/StellarStackOSS/StellarStack/releases) for history.

---

## Security

StellarStack is **self-hostable** and designed for data sovereignty:

- **End-to-End Control** - Your infrastructure, your data
- **bcrypt Password Hashing** - Industry-standard (cost factor 10)
- **AES-256-CBC Encryption** - For sensitive data at rest
- **Rate Limiting** - Protection against brute-force attacks
- **CSRF Tokens** - All state-changing requests protected
- **Security Headers** - CSP, X-Frame-Options, HSTS
- **Docker Isolation** - Each game server in its own container

**Reporting Vulnerabilities:**
Email security@stellarstack.app with details. We'll respond within 48 hours. See [SECURITY.md](SECURITY.md) for our policy.

---

## Roadmap

Track development on our [Linear board](https://linear.app/stellarstack).

**Current Focus (Alpha):**

- [ ] Server transfer between nodes
- [ ] Server split/partition feature
- [ ] Advanced firewall rules
- [ ] Mobile app (React Native)
- [ ] Plugin system for custom game support

**Planned Features:**

- [ ] Kubernetes deployment support
- [ ] Multi-region node clustering
- [ ] Advanced analytics dashboard
- [ ] Terraform provider
- [ ] CLI tool for server management

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

You're free to use, modify, and distribute StellarStack for personal or commercial purposes. Attribution appreciated but not required.

---

## Community

- **GitHub**: [StellarStackOSS](https://github.com/StellarStackOSS)
- **Linear**: [linear.app/stellarstack](https://linear.app/stellarstack)
- **Website**: [stellarstack.app](https://stellarstack.app)

---

<div align="center">
  <p>Built with ❤️ for the game hosting community</p>
  <p>
    <a href="https://stellarstack.app">Website</a> ·
    <a href="https://github.com/StellarStackOSS/StellarStack/releases">Releases</a> ·
    <a href="CONTRIBUTING.md">Contributing</a> ·
    <a href="https://linear.app/stellarstack">Linear</a>
  </p>
</div>
