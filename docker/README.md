# StellarStack Docker Deployment

Production-ready Docker deployment for StellarStack with automatic SSL certificate management via Let's Encrypt.

## Deployment Options

Choose your preferred deployment method:

- **🖥️ [Dockge (Web UI)](./DOCKGE.md)** - Recommended for beginners! Manage your deployment through an easy-to-use web interface
- **⌨️ Command Line** - Traditional Docker Compose deployment (continue reading below)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [SSL Certificates](#ssl-certificates)
- [Deployment](#deployment)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Backup & Recovery](#backup--recovery)
- [Advanced Configuration](#advanced-configuration)

## Prerequisites

Before deploying StellarStack, ensure you have:

- **Server**: Linux server with 2GB+ RAM, 20GB+ storage, and a public IP address
- **Docker**: Docker Engine 24.0+ ([Install Docker](https://docs.docker.com/engine/install/))
- **Docker Compose**: Docker Compose v2.20+ (usually included with Docker)
- **Domains**: Two domain names pointing to your server's IP:
  - Panel domain (e.g., `panel.yourcompany.com`)
  - API domain (e.g., `api.yourcompany.com`)
- **Ports**: Ports 80 and 443 must be open and accessible from the internet
- **DNS**: Both domains must resolve to your server's IP address before setup

### Verify Prerequisites

```bash
# Check Docker
docker --version
# Should show: Docker version 24.0.0 or higher

# Check Docker Compose
docker compose version
# Should show: Docker Compose version v2.20.0 or higher

# Check DNS (replace with your domains)
host panel.yourcompany.com
host api.yourcompany.com
# Both should return your server's IP address
```

## Quick Start

### Option 1: Interactive Setup (Recommended)

The easiest way to deploy StellarStack:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/stellarstack.git
cd stellarstack/docker

# 2. Run the setup script
./setup.sh
```

The script will:

- ✅ Check prerequisites
- ✅ Prompt for domain names
- ✅ Validate DNS configuration
- ✅ Generate secure secrets automatically
- ✅ Create `.env` file
- ✅ Obtain SSL certificates from Let's Encrypt
- ✅ Initialize database
- ✅ Start all services

### Option 2: Manual Setup

For advanced users who want more control:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Generate secrets
./scripts/generate-secrets.sh >> .env

# 3. Edit .env and fill in required values
nano .env
# Required: PANEL_DOMAIN, API_DOMAIN, ADMIN_EMAIL

# 4. Start services
docker-compose up -d

# 5. Initialize database
docker-compose exec api npx prisma db push

# 6. Obtain SSL certificates
docker-compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  --email your@email.com \
  --agree-tos \
  -d panel.yourcompany.com \
  -d api.yourcompany.com

# 7. Restart nginx with SSL
docker-compose restart nginx
```

## Architecture

StellarStack uses a microservices architecture with the following components:

```
                    ┌─────────────────┐
                    │   Internet      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  nginx (80/443) │  ◄── SSL Termination
                    │  Reverse Proxy  │
                    └────┬───────┬────┘
                         │       │
              ┌──────────▼─┐   ┌▼──────────┐
              │  Web:3000  │   │  API:3001 │
              │  (Next.js) │   │  (Hono)   │
              └────────────┘   └─────┬─────┘
                                     │
                              ┌──────▼──────┐
                              │ PostgreSQL  │
                              │  Database   │
                              └─────────────┘

                    ┌─────────────────┐
                    │    Certbot      │  ◄── Auto SSL Renewal
                    │  (Let's Encrypt)│
                    └─────────────────┘
```

### Services

| Service      | Description                        | Internal Port | External Access |
| ------------ | ---------------------------------- | ------------- | --------------- |
| **nginx**    | Reverse proxy with SSL termination | 80, 443       | Via domains     |
| **web**      | Next.js frontend (standalone)      | 3000          | Via nginx       |
| **api**      | Hono backend API                   | 3001          | Via nginx       |
| **postgres** | PostgreSQL 16 database             | 5432          | Internal only   |
| **certbot**  | SSL certificate manager            | -             | -               |

### Network Flow

1. **Client Request** → nginx (443/HTTPS)
2. **nginx** → SSL termination + routing
3. **nginx** → API (3001) or Web (3000)
4. **API** → PostgreSQL (5432)
5. **certbot** → Let's Encrypt (ACME challenge via nginx)

## Configuration

### Environment Variables

All configuration is managed through the `.env` file. See [`.env.example`](.env.example) for a complete reference.

#### Required Variables

```bash
# Domains
PANEL_DOMAIN=panel.yourcompany.com
API_DOMAIN=api.yourcompany.com
ADMIN_EMAIL=admin@yourcompany.com

# Database
POSTGRES_PASSWORD=<generated-by-setup-script>

# Security
BETTER_AUTH_SECRET=<generated-by-setup-script>
DOWNLOAD_TOKEN_SECRET=<generated-by-setup-script>
ENCRYPTION_KEY=<generated-by-setup-script>
```

#### Optional Variables

- **OAuth**: GitHub, Google, Discord
- **Email**: SMTP configuration
- **Advanced**: Database pool size, timeouts, debug mode

### Generating Secrets

Use the included script to generate cryptographically secure secrets:

```bash
./scripts/generate-secrets.sh
```

Output can be appended to your `.env` file or used to rotate secrets.

## SSL Certificates

StellarStack uses [Let's Encrypt](https://letsencrypt.org/) for free, automatic SSL certificates.

### Obtaining Certificates

#### Via Setup Script (Easiest)

The `setup.sh` script handles this automatically.

#### Manually

```bash
# Start nginx first
docker-compose up -d nginx

# Request certificates
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email admin@yourcompany.com \
  --agree-tos \
  --non-interactive \
  -d panel.yourcompany.com \
  -d api.yourcompany.com

# Restart nginx to load certificates
docker-compose restart nginx
```

### Certificate Renewal

Certificates are automatically renewed by the `certbot` service every 12 hours.

To manually renew:

```bash
docker-compose run --rm certbot renew
docker-compose restart nginx
```

### Troubleshooting SSL

If certificate generation fails:

1. **Check DNS**: Ensure domains point to your server

   ```bash
   host panel.yourcompany.com
   ```

2. **Check Firewall**: Ports 80 and 443 must be accessible

   ```bash
   sudo ufw status  # Ubuntu/Debian
   sudo firewall-cmd --list-all  # CentOS/RHEL
   ```

3. **View Certbot Logs**:

   ```bash
   docker-compose logs certbot
   ```

4. **Test Renewal** (dry run):
   ```bash
   docker-compose run --rm certbot renew --dry-run
   ```

## Deployment

### Initial Deployment

```bash
# 1. Run setup script
./setup.sh

# 2. Verify services are healthy
./scripts/health-check.sh

# 3. Access your deployment
# Panel: https://panel.yourcompany.com
# API: https://api.yourcompany.com/health
```

### Updating

To update to the latest version:

```bash
# 1. Pull latest code
git pull origin master

# 2. Rebuild images
docker-compose build

# 3. Run database migrations (if any)
docker-compose run --rm api npx prisma migrate deploy

# 4. Restart services (zero-downtime for most services)
docker-compose up -d

# 5. Verify health
./scripts/health-check.sh
```

### Scaling

To run multiple instances of a service:

```bash
# Scale web to 3 instances
docker-compose up -d --scale web=3

# Scale API to 2 instances
docker-compose up -d --scale api=2
```

> **Note**: nginx load balancing is not configured by default. You'll need to update nginx configuration to load balance across multiple instances.

## Maintenance

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f postgres

# Last 100 lines
docker-compose logs --tail=100 api
```

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart a service
docker-compose restart api

# View service status
docker-compose ps

# View resource usage
docker-compose top
```

### Database Management

#### Connect to Database

```bash
# Using psql
docker-compose exec postgres psql -U stellar -d stellar

# Using Prisma Studio (development only)
docker-compose exec api npx prisma studio
```

#### Run Migrations

```bash
# Deploy migrations
docker-compose run --rm api npx prisma migrate deploy

# Create a new migration (development)
docker-compose run --rm api npx prisma migrate dev
```

#### Database Backup

```bash
# Manual backup
docker-compose exec postgres pg_dump -U stellar stellar > backup-$(date +%Y%m%d).sql

# Restore from backup
docker-compose exec -T postgres psql -U stellar -d stellar < backup.sql
```

### Health Checks

Run the health check script to verify all services:

```bash
./scripts/health-check.sh
```

This checks:

- Container status
- PostgreSQL connectivity
- API health endpoint
- Web service
- nginx proxy
- SSL certificates
- Disk usage

## Troubleshooting

### Services Won't Start

```bash
# Check service logs
docker-compose logs api
docker-compose logs web

# Check service status
docker-compose ps

# Restart services
docker-compose restart
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Test database connection
docker-compose exec postgres pg_isready -U stellar

# View database logs
docker-compose logs postgres

# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### SSL Certificate Issues

```bash
# Check nginx logs
docker-compose logs nginx

# Verify DNS
host panel.yourcompany.com
host api.yourcompany.com

# Test certificate renewal
docker-compose run --rm certbot renew --dry-run

# View certbot logs
docker-compose logs certbot
```

### API/Web Not Responding

```bash
# Check container health
docker-compose ps

# Test API directly
curl http://localhost:3001/health

# Test Web directly
curl http://localhost:3000

# Check nginx configuration
docker-compose exec nginx nginx -t

# Reload nginx
docker-compose exec nginx nginx -s reload
```

### High Resource Usage

```bash
# Check resource usage
docker stats

# View top processes in containers
docker-compose top

# Check disk usage
df -h
docker system df
```

## Security

### Best Practices

1. **Keep secrets secure**
   - Never commit `.env` files to version control
   - Use strong, unique passwords (auto-generated by setup script)
   - Rotate secrets regularly

2. **Regular updates**
   - Update Docker images monthly
   - Apply security patches promptly
   - Monitor security advisories

3. **Firewall configuration**
   - Only expose ports 80 and 443
   - Block direct access to ports 3000, 3001, 5432
   - Use a firewall (ufw, firewalld, etc.)

4. **Database security**
   - PostgreSQL is not exposed externally
   - Use strong passwords
   - Regular backups

5. **SSL/TLS**
   - Always use HTTPS in production
   - Keep certificates up to date
   - Use strong cipher suites (configured in nginx)

### Security Checklist

- [ ] SSL certificates valid and auto-renewing
- [ ] Strong passwords for all secrets
- [ ] Database not exposed externally
- [ ] Firewall configured (only 80/443 open)
- [ ] Regular security updates applied
- [ ] Backups encrypted and stored off-server
- [ ] Logs monitored for suspicious activity
- [ ] `.env` file has 600 permissions
- [ ] OAuth secrets rotated regularly

### Hardening

```bash
# Set proper permissions
chmod 600 .env

# Enable automatic updates (Ubuntu/Debian)
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH (be careful!)
sudo ufw enable
```

## Backup & Recovery

### Automated Backups

Add to your server's crontab:

```bash
# Edit crontab
crontab -e

# Add backup job (daily at 2 AM)
0 2 * * * cd /path/to/stellarstack/docker && ./scripts/backup-db.sh
```

### Manual Backup

```bash
# Backup database
docker-compose exec postgres pg_dump -U stellar stellar > backup-$(date +%Y%m%d).sql

# Backup .env file (encrypted)
gpg -c .env
# Creates .env.gpg

# Backup volumes
docker run --rm \
  -v stellarstack_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/postgres-data-$(date +%Y%m%d).tar.gz /data
```

### Disaster Recovery

1. **Provision new server** with same prerequisites
2. **Install Docker and Docker Compose**
3. **Clone repository**
   ```bash
   git clone https://github.com/your-org/stellarstack.git
   cd stellarstack/docker
   ```
4. **Restore `.env` file**
   ```bash
   gpg -d .env.gpg > .env
   chmod 600 .env
   ```
5. **Restore database backup**
   ```bash
   docker-compose up -d postgres
   sleep 10
   docker-compose exec -T postgres psql -U stellar -d stellar < backup.sql
   ```
6. **Start all services**
   ```bash
   docker-compose up -d
   ```
7. **Obtain new SSL certificates** (or restore old ones)
   ```bash
   ./setup.sh  # Select SSL certificate option
   ```

## Advanced Configuration

### Custom nginx Configuration

Edit `nginx/templates/api.conf.template` or `nginx/templates/web.conf.template` to customize reverse proxy behavior.

After changes:

```bash
docker-compose restart nginx
```

### Environment-Specific Configurations

Create override files for different environments:

```bash
# Development
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production (default)
docker-compose up
```

### Using Pre-built Images

Instead of building locally, use pre-built images from Docker Hub:

```yaml
# In docker-compose.yml, replace build: with:
api:
  image: stellarstackoss/stellarstack-api:latest

web:
  image: stellarstackoss/stellarstack-web:latest
```

### Custom Domain Setup

To use a custom domain provider:

1. Point your domains to the server IP
2. Update `.env` with your domains
3. Run `./setup.sh` or manually obtain certificates

## Support

- **Documentation**: See root `README.md`
- **Issues**: [GitHub Issues](https://github.com/your-org/stellarstack/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/stellarstack/discussions)

## License

See the root `LICENSE` file for license information.

---

**Made with ❤️ by the StellarStack team**
