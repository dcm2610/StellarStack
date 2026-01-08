#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║     StellarStack Docker Setup                     ║
║     Production Deployment Configuration           ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

command -v docker >/dev/null 2>&1 || {
    echo -e "${RED}✗ Docker is required but not installed. Please install Docker first.${NC}" >&2
    exit 1
}
echo -e "${GREEN}✓ Docker found${NC}"

command -v docker-compose >/dev/null 2>&1 || command -v docker compose >/dev/null 2>&1 || {
    echo -e "${RED}✗ Docker Compose is required but not installed. Please install Docker Compose first.${NC}" >&2
    exit 1
}
echo -e "${GREEN}✓ Docker Compose found${NC}"

# Determine docker-compose command
if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

ENV_FILE=".env"

# Function to generate secure random string
generate_secret() {
    local length=$1
    openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
}

# Function to generate hex key (for encryption)
generate_hex_key() {
    openssl rand -hex 32
}

# Function to validate domain DNS
validate_domain() {
    local domain=$1
    echo -e "${YELLOW}Checking DNS for $domain...${NC}"

    if command -v host >/dev/null 2>&1; then
        if host "$domain" > /dev/null 2>&1; then
            local ip=$(host "$domain" | grep "has address" | head -n1 | awk '{print $4}')
            echo -e "${GREEN}✓ DNS record found for $domain ($ip)${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ No DNS record found for $domain${NC}"
        fi
    elif command -v nslookup >/dev/null 2>&1; then
        if nslookup "$domain" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ DNS record found for $domain${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ No DNS record found for $domain${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Cannot validate DNS (host/nslookup not found)${NC}"
    fi

    echo -e "${YELLOW}WARNING: Make sure DNS is configured before obtaining SSL certificates${NC}"
    read -p "Continue anyway? (y/N): " continue
    if [[ ! $continue =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 1
    fi
}

# Check if .env exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Found existing .env file.${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [[ ! $overwrite =~ ^[Yy]$ ]]; then
        echo "Setup cancelled. Using existing .env file."
        echo "To start services, run: $DOCKER_COMPOSE up -d"
        exit 0
    fi
    # Backup existing file
    backup_file="${ENV_FILE}.backup.$(date +%s)"
    mv "$ENV_FILE" "$backup_file"
    echo -e "${GREEN}✓ Backed up existing .env to $backup_file${NC}"
fi

# Domain configuration
echo ""
echo -e "${BLUE}=== Domain Configuration ===${NC}"
echo "Enter the domain names that point to this server."
echo ""

read -p "Panel domain (e.g., panel.yourcompany.com): " PANEL_DOMAIN
if [ -z "$PANEL_DOMAIN" ]; then
    echo -e "${RED}✗ Panel domain is required${NC}"
    exit 1
fi
validate_domain "$PANEL_DOMAIN"

read -p "API domain (e.g., api.yourcompany.com): " API_DOMAIN
if [ -z "$API_DOMAIN" ]; then
    echo -e "${RED}✗ API domain is required${NC}"
    exit 1
fi
validate_domain "$API_DOMAIN"

read -p "Admin email for SSL certificates: " ADMIN_EMAIL
if [ -z "$ADMIN_EMAIL" ]; then
    echo -e "${RED}✗ Admin email is required${NC}"
    exit 1
fi

# Database configuration
echo ""
echo -e "${BLUE}=== Database Configuration ===${NC}"
read -p "PostgreSQL database name [stellar]: " POSTGRES_DB
POSTGRES_DB=${POSTGRES_DB:-stellar}

read -p "PostgreSQL username [stellar]: " POSTGRES_USER
POSTGRES_USER=${POSTGRES_USER:-stellar}

echo "Generating secure PostgreSQL password..."
POSTGRES_PASSWORD=$(generate_secret 32)
echo -e "${GREEN}✓ PostgreSQL password generated${NC}"

# Security secrets
echo ""
echo -e "${BLUE}=== Generating Security Secrets ===${NC}"
echo "Creating cryptographically secure secrets..."

BETTER_AUTH_SECRET=$(generate_secret 64)
echo -e "${GREEN}✓ BETTER_AUTH_SECRET generated (64 chars)${NC}"

DOWNLOAD_TOKEN_SECRET=$(generate_secret 32)
echo -e "${GREEN}✓ DOWNLOAD_TOKEN_SECRET generated (32 chars)${NC}"

ENCRYPTION_KEY=$(generate_hex_key)
echo -e "${GREEN}✓ ENCRYPTION_KEY generated (32 bytes hex)${NC}"

# Optional OAuth
echo ""
echo -e "${BLUE}=== OAuth Configuration (Optional) ===${NC}"
echo "Configure OAuth providers to allow users to sign in with external services."
echo ""

GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
read -p "Configure GitHub OAuth? (y/N): " setup_github
if [[ $setup_github =~ ^[Yy]$ ]]; then
    echo "Create a GitHub OAuth App at: https://github.com/settings/developers"
    echo "Callback URL: https://${API_DOMAIN}/api/auth/github/callback"
    read -p "GitHub Client ID: " GITHUB_CLIENT_ID
    read -p "GitHub Client Secret: " GITHUB_CLIENT_SECRET
fi

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
read -p "Configure Google OAuth? (y/N): " setup_google
if [[ $setup_google =~ ^[Yy]$ ]]; then
    echo "Create a Google OAuth App at: https://console.cloud.google.com/apis/credentials"
    echo "Callback URL: https://${API_DOMAIN}/api/auth/google/callback"
    read -p "Google Client ID: " GOOGLE_CLIENT_ID
    read -p "Google Client Secret: " GOOGLE_CLIENT_SECRET
fi

# Email configuration
echo ""
echo -e "${BLUE}=== Email Configuration (Optional) ===${NC}"
echo "Configure SMTP for sending password reset emails and invitations."
echo ""

EMAIL_FROM=""
EMAIL_HOST=""
EMAIL_PORT="587"
EMAIL_USER=""
EMAIL_PASSWORD=""
EMAIL_SECURE="false"

read -p "Configure SMTP email? (y/N): " setup_email
if [[ $setup_email =~ ^[Yy]$ ]]; then
    read -p "From email address: " EMAIL_FROM
    read -p "SMTP host: " EMAIL_HOST
    read -p "SMTP port [587]: " input_port
    EMAIL_PORT=${input_port:-587}
    read -p "SMTP username: " EMAIL_USER
    read -p "SMTP password: " -s EMAIL_PASSWORD
    echo ""
    read -p "Use SSL/TLS? (y/N): " email_secure
    [[ $email_secure =~ ^[Yy]$ ]] && EMAIL_SECURE="true" || EMAIL_SECURE="false"
fi

# Get git commit hash if in git repo
GIT_COMMIT_HASH="unknown"
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
fi

# Write .env file
echo ""
echo -e "${BLUE}=== Writing Configuration ===${NC}"

cat > "$ENV_FILE" << EOF
# Generated by StellarStack setup script on $(date)
# DO NOT COMMIT THIS FILE TO VERSION CONTROL

# ============================================
# DOMAINS & SSL
# ============================================
PANEL_DOMAIN=$PANEL_DOMAIN
API_DOMAIN=$API_DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL

# ============================================
# DATABASE
# ============================================
POSTGRES_DB=$POSTGRES_DB
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# ============================================
# SECURITY & AUTHENTICATION
# ============================================
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
DOWNLOAD_TOKEN_SECRET=$DOWNLOAD_TOKEN_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY

# ============================================
# OAUTH PROVIDERS
# ============================================
GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET
GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET

# ============================================
# EMAIL CONFIGURATION
# ============================================
EMAIL_FROM=$EMAIL_FROM
EMAIL_HOST=$EMAIL_HOST
EMAIL_PORT=$EMAIL_PORT
EMAIL_USER=$EMAIL_USER
EMAIL_PASSWORD=$EMAIL_PASSWORD
EMAIL_SECURE=$EMAIL_SECURE

# ============================================
# BUILD CONFIGURATION
# ============================================
GIT_COMMIT_HASH=$GIT_COMMIT_HASH
EOF

chmod 600 "$ENV_FILE"
echo -e "${GREEN}✓ Configuration written to $ENV_FILE (permissions: 600)${NC}"

# SSL certificate setup
echo ""
echo -e "${BLUE}=== SSL Certificate Setup ===${NC}"
echo "StellarStack requires SSL certificates to run in production."
echo ""

read -p "Obtain SSL certificates now? (recommended) (y/N): " setup_ssl

if [[ $setup_ssl =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Starting nginx for SSL challenge...${NC}"

    # Start only nginx first (without SSL)
    $DOCKER_COMPOSE up -d nginx

    echo "Waiting for nginx to be ready..."
    sleep 10

    echo ""
    echo -e "${YELLOW}Requesting SSL certificates from Let's Encrypt...${NC}"
    echo "This may take a minute..."

    # Request certificates for both domains
    $DOCKER_COMPOSE run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$ADMIN_EMAIL" \
        --agree-tos \
        --no-eff-email \
        --non-interactive \
        -d "$PANEL_DOMAIN" \
        -d "$API_DOMAIN"

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ SSL certificates obtained successfully${NC}"
        echo "Reloading nginx with SSL configuration..."
        $DOCKER_COMPOSE restart nginx
    else
        echo -e "${RED}✗ Failed to obtain SSL certificates${NC}"
        echo ""
        echo "Common issues:"
        echo "1. Domains don't point to this server's IP"
        echo "2. Ports 80/443 are not accessible from the internet"
        echo "3. Firewall blocking incoming connections"
        echo ""
        echo "You can try again later with:"
        echo "  $DOCKER_COMPOSE run --rm certbot certonly --webroot -w /var/www/certbot -d $PANEL_DOMAIN -d $API_DOMAIN"
    fi
else
    echo -e "${YELLOW}Skipping SSL certificate setup.${NC}"
    echo "You can obtain certificates later with:"
    echo "  $DOCKER_COMPOSE run --rm certbot certonly --webroot -w /var/www/certbot -d $PANEL_DOMAIN -d $API_DOMAIN"
fi

# Database setup
echo ""
echo -e "${BLUE}=== Database Setup ===${NC}"
read -p "Start services and initialize database? (y/N): " setup_db

if [[ $setup_db =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting PostgreSQL..."
    $DOCKER_COMPOSE up -d postgres

    echo "Waiting for PostgreSQL to be ready..."
    sleep 15

    echo ""
    echo "Initializing database schema..."
    $DOCKER_COMPOSE run --rm api npx prisma db push --skip-generate

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Database initialized successfully${NC}"
    else
        echo -e "${RED}✗ Database initialization failed${NC}"
        echo "You can try again later with:"
        echo "  $DOCKER_COMPOSE run --rm api npx prisma db push"
    fi

    echo ""
    echo "Starting all services..."
    $DOCKER_COMPOSE up -d

    echo ""
    echo "Waiting for services to be healthy..."
    sleep 10
fi

# Final summary
echo ""
echo -e "${GREEN}"
cat << "EOF"
╔═══════════════════════════════════════════════════╗
║                                                   ║
║     Setup Complete!                               ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${BLUE}Your StellarStack deployment:${NC}"
echo "  Panel:  https://$PANEL_DOMAIN"
echo "  API:    https://$API_DOMAIN"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Start services:     $DOCKER_COMPOSE up -d"
echo "  2. View logs:          $DOCKER_COMPOSE logs -f"
echo "  3. Check status:       $DOCKER_COMPOSE ps"
echo "  4. Stop services:      $DOCKER_COMPOSE down"
echo ""
echo -e "${YELLOW}IMPORTANT: Save these credentials securely!${NC}"
echo "  PostgreSQL Password: $POSTGRES_PASSWORD"
echo ""
echo -e "${BLUE}For help and documentation:${NC}"
echo "  See docker/README.md"
echo "  GitHub: https://github.com/your-repo/stellarstack"
echo ""
echo -e "${GREEN}Happy deploying! 🚀${NC}"
