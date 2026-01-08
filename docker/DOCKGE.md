# Deploying StellarStack with Dockge

[Dockge](https://github.com/louislam/dockge) is a fancy, easy-to-use, and reactive self-hosted Docker Compose.yaml stack-oriented manager. This guide will walk you through deploying StellarStack using Dockge's web interface.

## What is Dockge?

Dockge is a Docker Compose management tool that provides:

- 🖥️ Web-based UI for managing Docker Compose stacks
- 📝 Interactive editor for docker-compose.yml files
- 📊 Real-time container monitoring
- 🔄 Easy stack updates and restarts
- 📱 Mobile-friendly interface

## Prerequisites

Before starting, ensure you have:

- A Linux server (Ubuntu 20.04+ or Debian 11+ recommended)
- Docker and Docker Compose installed
- At least 2GB RAM and 20GB storage
- Two domain names pointing to your server:
  - Panel domain (e.g., `panel.yourcompany.com`)
  - API domain (e.g., `api.yourcompany.com`)
- Ports 80, 443, and 5001 (for Dockge) open in your firewall

## Step 1: Install Dockge

### 1.1 Create Dockge Directory

```bash
# Create directories for Dockge
sudo mkdir -p /opt/dockge/stacks /opt/dockge/data

# Set permissions (replace 'youruser' with your username)
sudo chown -R $USER:$USER /opt/dockge
```

### 1.2 Create Dockge docker-compose.yml

```bash
cd /opt/dockge
cat > docker-compose.yml << 'EOF'
version: "3.8"
services:
  dockge:
    image: louislam/dockge:1
    restart: unless-stopped
    ports:
      - 5001:5001
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      - ./stacks:/opt/stacks
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
EOF
```

### 1.3 Start Dockge

```bash
docker-compose up -d
```

### 1.4 Access Dockge

1. Open your browser and navigate to `http://your-server-ip:5001`
2. Create an admin account on first login
3. You should see the Dockge dashboard

> **Security Note**: For production, consider putting Dockge behind a reverse proxy with SSL, or restrict access via firewall rules.

## Step 2: Prepare StellarStack Configuration

Before deploying via Dockge, you need to prepare your environment configuration.

### 2.1 Clone StellarStack Repository (on your local machine)

```bash
git clone https://github.com/your-org/stellarstack.git
cd stellarstack/docker
```

### 2.2 Generate Secrets

On your server or local machine, generate the required secrets:

```bash
# Generate secrets
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 64 | tr -d '=+/\n' | cut -c1-64)"
echo "DOWNLOAD_TOKEN_SECRET=$(openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '=+/\n' | cut -c1-32)"
```

**Save these values!** You'll need them in the next step.

## Step 3: Create StellarStack Stack in Dockge

### 3.1 Create New Stack

1. In Dockge, click **"+ Compose"** button
2. Enter stack name: `stellarstack`
3. You'll see an editor with a default compose file

### 3.2 Configure docker-compose.yml

Replace the default content with:

```yaml
version: "3.8"

services:
  # PostgreSQL Database
  postgres:
    image: postgres:16-alpine
    container_name: stellarstack-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: stellar
      POSTGRES_USER: stellar
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_INITDB_ARGS: "-E UTF8 --locale=C"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - stellarstack
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stellar"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # API Service
  api:
    image: stellarstackoss/stellarstack-api:latest
    container_name: stellarstack-api
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # Database
      DATABASE_URL: postgresql://stellar:${POSTGRES_PASSWORD}@postgres:5432/stellar?schema=public

      # Authentication
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      DOWNLOAD_TOKEN_SECRET: ${DOWNLOAD_TOKEN_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}

      # URLs
      FRONTEND_URL: https://${PANEL_DOMAIN}
      API_URL: https://${API_DOMAIN}

      # Passkey
      PASSKEY_RP_ID: ${API_DOMAIN}

      # Runtime
      NODE_ENV: production
      PORT: 3001
      HOSTNAME: "::"
    networks:
      - stellarstack
    healthcheck:
      test:
        ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # Web Service
  web:
    image: stellarstackoss/stellarstack-web:latest
    container_name: stellarstack-web
    restart: unless-stopped
    depends_on:
      - api
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: "::"
    networks:
      - stellarstack
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # nginx Reverse Proxy
  nginx:
    image: nginx:alpine
    container_name: stellarstack-nginx
    restart: unless-stopped
    depends_on:
      - api
      - web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./api.conf:/etc/nginx/templates/api.conf.template:ro
      - ./web.conf:/etc/nginx/templates/web.conf.template:ro
      - certbot_www:/var/www/certbot:ro
      - certbot_conf:/etc/letsencrypt:ro
    networks:
      - stellarstack
    environment:
      - API_DOMAIN=${API_DOMAIN}
      - PANEL_DOMAIN=${PANEL_DOMAIN}
    command: >
      /bin/sh -c "
      apk add --no-cache gettext &&
      envsubst '$${API_DOMAIN} $${PANEL_DOMAIN}' < /etc/nginx/templates/api.conf.template > /etc/nginx/conf.d/api.conf &&
      envsubst '$${API_DOMAIN} $${PANEL_DOMAIN}' < /etc/nginx/templates/web.conf.template > /etc/nginx/conf.d/web.conf &&
      nginx -g 'daemon off;'
      "

  # Certbot for SSL
  certbot:
    image: certbot/certbot:latest
    container_name: stellarstack-certbot
    restart: unless-stopped
    depends_on:
      - nginx
    volumes:
      - certbot_www:/var/www/certbot
      - certbot_conf:/etc/letsencrypt
    entrypoint: >
      /bin/sh -c "
      trap exit TERM;
      while :; do
        certbot renew --webroot -w /var/www/certbot --quiet;
        sleep 12h & wait $${!};
      done
      "

networks:
  stellarstack:
    driver: bridge

volumes:
  postgres_data:
    driver: local
  certbot_www:
    driver: local
  certbot_conf:
    driver: local
```

### 3.3 Configure Environment Variables

In Dockge, click the **"Env"** tab and add the following variables:

```env
# Domains
PANEL_DOMAIN=panel.yourcompany.com
API_DOMAIN=api.yourcompany.com

# Database
POSTGRES_PASSWORD=<paste-generated-password>

# Security
BETTER_AUTH_SECRET=<paste-generated-secret>
DOWNLOAD_TOKEN_SECRET=<paste-generated-secret>
ENCRYPTION_KEY=<paste-generated-key>

# Optional: OAuth (leave empty if not using)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: Email (leave empty if not using)
EMAIL_FROM=
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_SECURE=false
```

Replace the placeholder values with the secrets you generated earlier.

### 3.4 Add nginx Configuration Files

Dockge needs the nginx config files. You have two options:

#### Option A: Upload via Dockge UI

1. In the stack editor, click **"Files"** tab
2. Upload the following files from your cloned repo:
   - `nginx/nginx.conf`
   - `nginx/templates/api.conf.template` (rename to `api.conf`)
   - `nginx/templates/web.conf.template` (rename to `web.conf`)

#### Option B: Manually Copy Files

```bash
# On your server
cd /opt/dockge/stacks/stellarstack

# Download nginx configs from GitHub (update the URL to your repo)
wget https://raw.githubusercontent.com/your-org/stellarstack/master/docker/nginx/nginx.conf
wget https://raw.githubusercontent.com/your-org/stellarstack/master/docker/nginx/templates/api.conf.template -O api.conf
wget https://raw.githubusercontent.com/your-org/stellarstack/master/docker/nginx/templates/web.conf.template -O web.conf
```

## Step 4: Deploy the Stack

### 4.1 Save and Deploy

1. Review your configuration
2. Click **"Save"** button
3. Click **"Start"** button to deploy the stack

Dockge will now:

- Pull all Docker images
- Create networks and volumes
- Start all containers in the correct order

### 4.2 Monitor Deployment

Watch the logs in Dockge's terminal view. You should see:

- PostgreSQL starting and becoming healthy
- API connecting to database
- Web service starting
- nginx starting

## Step 5: Initialize Database

### 5.1 Run Database Migration

Once all containers are running, initialize the database schema:

1. In Dockge, find the `stellarstack-api` container
2. Click on it to open the terminal
3. Run:

```bash
npx prisma db push
```

Or via server terminal:

```bash
docker exec -it stellarstack-api npx prisma db push
```

### 5.2 Verify Database

Check that the database was initialized:

```bash
docker exec -it stellarstack-postgres psql -U stellar -d stellar -c "\dt"
```

You should see a list of tables.

## Step 6: Obtain SSL Certificates

### 6.1 Initial Certificate Request

Run the following command on your server:

```bash
docker exec -it stellarstack-certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email your@email.com \
  --agree-tos \
  --no-eff-email \
  -d panel.yourcompany.com \
  -d api.yourcompany.com
```

Replace:

- `your@email.com` with your actual email
- Domain names with your actual domains

### 6.2 Restart nginx

After certificates are obtained, restart nginx to load them:

```bash
docker restart stellarstack-nginx
```

Or in Dockge:

1. Find the `nginx` service
2. Click the restart button

## Step 7: Verify Deployment

### 7.1 Health Checks

In Dockge, verify all containers show as "healthy" or "running".

### 7.2 Access Your Application

1. **Panel**: Open `https://panel.yourcompany.com` in your browser
2. **API**: Check `https://api.yourcompany.com/health` - should return `{"status":"ok"}`

### 7.3 Create First User

Navigate to your panel domain and create your first admin account.

## Managing StellarStack in Dockge

### Viewing Logs

1. Click on any service name in the stack
2. View real-time logs in the terminal
3. Search and filter logs as needed

### Restarting Services

- Click the **"Restart"** button next to any service
- Or restart the entire stack with the main "Restart" button

### Updating StellarStack

When a new version is released:

1. In Dockge, go to your `stellarstack` stack
2. Click **"Update"** button (pulls latest images)
3. Click **"Restart"** to apply updates
4. Run migrations if needed:
   ```bash
   docker exec -it stellarstack-api npx prisma migrate deploy
   ```

### Viewing Resource Usage

Dockge shows:

- CPU usage per container
- Memory usage per container
- Network I/O
- Container status

### Editing Configuration

1. Click **"Edit"** button
2. Modify docker-compose.yml or environment variables
3. Save changes
4. Restart the stack to apply

## Troubleshooting

### Containers Not Starting

1. Check logs in Dockge for the failing container
2. Verify environment variables are set correctly
3. Ensure domains are pointing to your server

### SSL Certificate Issues

```bash
# Test certificate renewal
docker exec -it stellarstack-certbot certbot renew --dry-run

# Check nginx logs
docker logs stellarstack-nginx

# Verify DNS
nslookup panel.yourcompany.com
nslookup api.yourcompany.com
```

### Database Connection Errors

```bash
# Check PostgreSQL is running
docker exec -it stellarstack-postgres pg_isready -U stellar

# View database logs
docker logs stellarstack-postgres

# Verify DATABASE_URL in environment
```

### Can't Access Dockge

```bash
# Check if Dockge is running
docker ps | grep dockge

# View Dockge logs
cd /opt/dockge
docker-compose logs

# Restart Dockge
docker-compose restart
```

## Backup and Restore

### Backup Database

```bash
# Create backup
docker exec stellarstack-postgres pg_dump -U stellar stellar > stellarstack-backup-$(date +%Y%m%d).sql

# Or use Dockge terminal
```

### Backup Volumes

```bash
# Backup all volumes
docker run --rm \
  -v stellarstack_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/stellarstack-volumes-$(date +%Y%m%d).tar.gz /data
```

### Restore Database

```bash
# Stop services
# In Dockge, click "Stop" on stellarstack stack

# Restore backup
cat stellarstack-backup.sql | docker exec -i stellarstack-postgres psql -U stellar -d stellar

# Start services
# In Dockge, click "Start"
```

## Security Best Practices

1. **Restrict Dockge Access**:

   ```bash
   # Use firewall to limit access to port 5001
   sudo ufw allow from YOUR_IP to any port 5001
   ```

2. **Use Strong Secrets**: Never reuse the example secrets

3. **Regular Updates**: Update images regularly through Dockge

4. **Monitor Logs**: Check logs regularly for suspicious activity

5. **Backup Regularly**: Automate database backups

## Advanced Configuration

### Adding Additional Services

You can extend the stack by editing the docker-compose.yml in Dockge:

```yaml
# Example: Add monitoring
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./prometheus.yml:/etc/prometheus/prometheus.yml
  networks:
    - stellarstack
```

### Custom nginx Configuration

Edit the nginx config files in the stack directory and restart nginx.

### Resource Limits

Add resource limits to services:

```yaml
api:
  # ... existing config ...
  deploy:
    resources:
      limits:
        cpus: "2"
        memory: 2G
```

## Support

- **Dockge Issues**: https://github.com/louislam/dockge/issues
- **StellarStack Issues**: https://github.com/your-org/stellarstack/issues
- **Documentation**: See [docker/README.md](./README.md) for general Docker deployment

---

**Tip**: Bookmark the Dockge dashboard at `http://your-server-ip:5001` for easy access to your StellarStack management interface!
