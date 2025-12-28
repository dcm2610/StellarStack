#!/bin/bash

# StellarStack Daemon Installer
# This script installs and configures the StellarStack daemon on a production server
# with SSL support via Certbot and systemd service management.

set -e

# Colors
GREEN='\033[0;32m'
BRIGHT_GREEN='\033[1;32m'
DIM_GREEN='\033[2;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

PRIMARY="${BRIGHT_GREEN}"
SECONDARY="${GREEN}"
MUTED="${DIM_GREEN}"
ERROR="${RED}"
WARNING="${YELLOW}"

# Installation paths
INSTALL_DIR="/opt/stellar-daemon"
CONFIG_FILE="${INSTALL_DIR}/config.toml"
BINARY_NAME="stellar-daemon"
SERVICE_NAME="stellar-daemon"

# Configuration variables
PANEL_URL=""
TOKEN_ID=""
TOKEN=""
NODE_DOMAIN=""
DAEMON_PORT="8080"
SFTP_PORT="2022"
ENABLE_SSL="y"
SETUP_SERVICE="y"
ENABLE_REDIS="n"
REDIS_URL=""
REDIS_PREFIX="stellar"
CERTBOT_INSTALLED="n"
INSTALL_CERTBOT="n"

# Print banner
print_banner() {
    clear
    echo -e "${PRIMARY}"
    cat << 'EOF'

 ______     ______   ______     __         __         ______     ______     ______     ______   ______     ______     __  __
/\  ___\   /\__  _\ /\  ___\   /\ \       /\ \       /\  __ \   /\  == \   /\  ___\   /\__  _\ /\  __ \   /\  ___\   /\ \/ /
\ \___  \  \/_/\ \/ \ \  __\   \ \ \____  \ \ \____  \ \  __ \  \ \  __<   \ \___  \  \/_/\ \/ \ \  __ \  \ \ \____  \ \  _"-.
 \/\_____\    \ \_\  \ \_____\  \ \_____\  \ \_____\  \ \_\ \_\  \ \_\ \_\  \/\_____\    \ \_\  \ \_\ \_\  \ \_____\  \ \_\ \_\
  \/_____/     \/_/   \/_____/   \/_____/   \/_____/   \/_/\/_/   \/_/ /_/   \/_____/     \/_/   \/_/\/_/   \/_____/   \/_/\/_/

EOF
    echo -e "${NC}"
    echo -e "${MUTED}  ════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${SECONDARY}  DAEMON INSTALLER // STELLARSTACK INC // GAME SERVER NODE${NC}"
    echo -e "${MUTED}  ════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Print step header
print_step() {
    echo ""
    echo -e "${PRIMARY}  > $1${NC}"
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
}

# Print success message
print_success() {
    echo -e "  ${PRIMARY}[✓]${NC} $1"
}

# Print error message
print_error() {
    echo -e "  ${ERROR}[✗]${NC} $1"
}

# Print warning message
print_warning() {
    echo -e "  ${WARNING}[!]${NC} $1"
}

# Print info message
print_info() {
    echo -e "  ${SECONDARY}[i]${NC} $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        echo -e "  ${MUTED}Run with: sudo $0${NC}"
        exit 1
    fi
}

# Install Docker
install_docker() {
    print_info "Installing Docker..."

    if curl -fsSL https://get.docker.com | sh; then
        print_success "Docker installed successfully"

        # Start Docker service
        systemctl start docker
        systemctl enable docker
        print_success "Docker service started and enabled"
    else
        print_error "Failed to install Docker"
        exit 1
    fi
}

# Install Certbot
install_certbot() {
    print_info "Installing Certbot..."

    # Detect package manager
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y certbot
    elif command -v dnf &> /dev/null; then
        dnf install -y certbot
    elif command -v yum &> /dev/null; then
        yum install -y certbot
    else
        print_error "Could not detect package manager"
        print_info "Please install certbot manually"
        return 1
    fi

    if command -v certbot &> /dev/null; then
        print_success "Certbot installed successfully"
    else
        print_error "Failed to install Certbot"
        return 1
    fi
}

# Check system requirements
check_requirements() {
    print_step "CHECKING SYSTEM REQUIREMENTS"

    # Check OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        print_info "Detected OS: $PRETTY_NAME"
    else
        print_warning "Could not detect OS version"
    fi

    # Check Docker
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | tr -d ',')
        print_success "Docker installed: v${DOCKER_VERSION}"
    else
        print_warning "Docker is not installed"
        echo ""
        echo -e "  ${SECONDARY}Docker is required to run game servers.${NC}"
        echo -e "  ${SECONDARY}Would you like to install Docker now?${NC} ${MUTED}[Y/n]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r install_docker_choice

        if [ "$install_docker_choice" = "n" ] || [ "$install_docker_choice" = "N" ]; then
            print_error "Docker is required. Exiting."
            exit 1
        fi

        install_docker
    fi

    # Check if Docker is running
    if docker info &> /dev/null; then
        print_success "Docker daemon is running"
    else
        print_warning "Docker daemon is not running"
        echo -e "  ${SECONDARY}Would you like to start Docker now?${NC} ${MUTED}[Y/n]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r start_docker_choice

        if [ "$start_docker_choice" = "n" ] || [ "$start_docker_choice" = "N" ]; then
            print_error "Docker must be running. Exiting."
            exit 1
        fi

        systemctl start docker
        sleep 2

        if docker info &> /dev/null; then
            print_success "Docker daemon started"
        else
            print_error "Failed to start Docker daemon"
            exit 1
        fi
    fi

    # Check certbot (will be installed later if needed for SSL)
    if command -v certbot &> /dev/null; then
        print_success "Certbot installed"
        CERTBOT_INSTALLED="y"
    else
        print_info "Certbot not installed (will prompt if SSL is enabled)"
        CERTBOT_INSTALLED="n"
    fi

    # Check available ports
    if ! ss -tuln | grep -q ":${DAEMON_PORT} "; then
        print_success "Port ${DAEMON_PORT} is available"
    else
        print_warning "Port ${DAEMON_PORT} is already in use"
    fi

    if ! ss -tuln | grep -q ":${SFTP_PORT} "; then
        print_success "Port ${SFTP_PORT} is available"
    else
        print_warning "Port ${SFTP_PORT} is already in use"
    fi
}

# Prompt for configuration
prompt_configuration() {
    print_step "CONFIGURATION"

    echo -e "  ${SECONDARY}Enter your Panel API URL${NC}"
    echo -e "  ${MUTED}(e.g., https://panel.example.com)${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r PANEL_URL

    if [ -z "$PANEL_URL" ]; then
        print_error "Panel URL is required"
        exit 1
    fi
    echo ""

    echo -e "  ${SECONDARY}Enter your Token ID${NC}"
    echo -e "  ${MUTED}(Found in the Panel under Nodes > Your Node)${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r TOKEN_ID

    if [ -z "$TOKEN_ID" ]; then
        print_error "Token ID is required"
        exit 1
    fi
    echo ""

    echo -e "  ${SECONDARY}Enter your Token${NC}"
    echo -e "  ${MUTED}(The full token string from the Panel)${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r TOKEN

    if [ -z "$TOKEN" ]; then
        print_error "Token is required"
        exit 1
    fi
    echo ""

    echo -e "  ${SECONDARY}Enter this node's domain name${NC}"
    echo -e "  ${MUTED}(e.g., node1.example.com - must point to this server)${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r NODE_DOMAIN

    if [ -z "$NODE_DOMAIN" ]; then
        print_error "Node domain is required"
        exit 1
    fi
    echo ""

    echo -e "  ${SECONDARY}Daemon API port${NC} ${MUTED}[default: 8080]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_port
    if [ -n "$input_port" ]; then
        DAEMON_PORT="$input_port"
    fi
    echo ""

    echo -e "  ${SECONDARY}SFTP port${NC} ${MUTED}[default: 2022]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_sftp
    if [ -n "$input_sftp" ]; then
        SFTP_PORT="$input_sftp"
    fi
    echo ""

    echo -e "  ${SECONDARY}Enable SSL with Certbot?${NC} ${MUTED}[Y/n]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_ssl
    if [ "$input_ssl" = "n" ] || [ "$input_ssl" = "N" ]; then
        ENABLE_SSL="n"
    else
        ENABLE_SSL="y"
        # Check if certbot needs to be installed
        if [ "$CERTBOT_INSTALLED" = "n" ]; then
            echo ""
            echo -e "  ${SECONDARY}Certbot is not installed. Install it now?${NC} ${MUTED}[Y/n]${NC}"
            echo -ne "  ${PRIMARY}>${NC} "
            read -r install_certbot_choice
            if [ "$install_certbot_choice" = "n" ] || [ "$install_certbot_choice" = "N" ]; then
                print_warning "SSL requires Certbot. Disabling SSL."
                ENABLE_SSL="n"
            else
                INSTALL_CERTBOT="y"
            fi
        fi
    fi
    echo ""

    echo -e "  ${SECONDARY}Do you have a Redis server for caching/state persistence?${NC} ${MUTED}[y/N]${NC}"
    echo -e "  ${MUTED}(Optional - improves console history persistence across daemon restarts)${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_redis
    if [ "$input_redis" = "y" ] || [ "$input_redis" = "Y" ]; then
        ENABLE_REDIS="y"
        echo ""
        echo -e "  ${SECONDARY}Redis URL${NC} ${MUTED}[default: redis://127.0.0.1:6379]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r input_redis_url
        if [ -n "$input_redis_url" ]; then
            REDIS_URL="$input_redis_url"
        else
            REDIS_URL="redis://127.0.0.1:6379"
        fi
        echo ""
        echo -e "  ${SECONDARY}Redis key prefix${NC} ${MUTED}[default: stellar]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r input_redis_prefix
        if [ -n "$input_redis_prefix" ]; then
            REDIS_PREFIX="$input_redis_prefix"
        fi
    else
        ENABLE_REDIS="n"
    fi
    echo ""

    echo -e "  ${SECONDARY}Setup systemd service for auto-start?${NC} ${MUTED}[Y/n]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_service
    if [ "$input_service" = "n" ] || [ "$input_service" = "N" ]; then
        SETUP_SERVICE="n"
    fi
}

# Show configuration summary
show_summary() {
    print_step "CONFIGURATION SUMMARY"

    echo -e "  ${SECONDARY}Panel URL:${NC}      ${PRIMARY}${PANEL_URL}${NC}"
    echo -e "  ${SECONDARY}Token ID:${NC}       ${PRIMARY}${TOKEN_ID}${NC}"
    echo -e "  ${SECONDARY}Token:${NC}          ${PRIMARY}${TOKEN:0:20}...${NC}"
    echo -e "  ${SECONDARY}Node Domain:${NC}    ${PRIMARY}${NODE_DOMAIN}${NC}"
    echo -e "  ${SECONDARY}Daemon Port:${NC}    ${PRIMARY}${DAEMON_PORT}${NC}"
    echo -e "  ${SECONDARY}SFTP Port:${NC}      ${PRIMARY}${SFTP_PORT}${NC}"
    echo -e "  ${SECONDARY}SSL Enabled:${NC}    ${PRIMARY}${ENABLE_SSL}${NC}"
    if [ "$ENABLE_REDIS" = "y" ]; then
        echo -e "  ${SECONDARY}Redis:${NC}          ${PRIMARY}${REDIS_URL}${NC}"
        echo -e "  ${SECONDARY}Redis Prefix:${NC}   ${PRIMARY}${REDIS_PREFIX}${NC}"
    else
        echo -e "  ${SECONDARY}Redis:${NC}          ${MUTED}Disabled${NC}"
    fi
    echo -e "  ${SECONDARY}Systemd:${NC}        ${PRIMARY}${SETUP_SERVICE}${NC}"
    echo ""
    echo -e "  ${MUTED}────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${SECONDARY}Press ${PRIMARY}[ENTER]${SECONDARY} to continue or ${PRIMARY}[CTRL+C]${SECONDARY} to abort${NC}"
    read -r
}

# Create installation directories
create_directories() {
    print_step "CREATING DIRECTORIES"

    mkdir -p "${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}/volumes"
    mkdir -p "${INSTALL_DIR}/backups"
    mkdir -p "${INSTALL_DIR}/archives"
    mkdir -p "${INSTALL_DIR}/tmp"
    mkdir -p "${INSTALL_DIR}/logs"

    print_success "Created ${INSTALL_DIR}"
    print_success "Created ${INSTALL_DIR}/volumes"
    print_success "Created ${INSTALL_DIR}/backups"
    print_success "Created ${INSTALL_DIR}/archives"
    print_success "Created ${INSTALL_DIR}/tmp"
    print_success "Created ${INSTALL_DIR}/logs"

    # Set permissions
    chmod 755 "${INSTALL_DIR}"
}

# Setup SSL with Certbot
setup_ssl() {
    if [ "$ENABLE_SSL" != "y" ]; then
        print_info "Skipping SSL setup"
        SSL_CERT=""
        SSL_KEY=""
        return
    fi

    print_step "SETTING UP SSL WITH CERTBOT"

    # Install certbot if needed
    if ! command -v certbot &> /dev/null; then
        if [ "$INSTALL_CERTBOT" = "y" ]; then
            install_certbot
            if ! command -v certbot &> /dev/null; then
                print_error "Failed to install Certbot"
                print_warning "Continuing without SSL..."
                ENABLE_SSL="n"
                SSL_CERT=""
                SSL_KEY=""
                return
            fi
        else
            print_warning "Certbot not available, skipping SSL"
            ENABLE_SSL="n"
            SSL_CERT=""
            SSL_KEY=""
            return
        fi
    fi

    print_info "Requesting certificate for ${NODE_DOMAIN}..."
    print_info "Make sure port 80 is open and ${NODE_DOMAIN} points to this server"
    echo ""

    # Stop any service using port 80
    if ss -tuln | grep -q ":80 "; then
        print_warning "Port 80 is in use, certbot may fail"
        print_info "Consider stopping the service using port 80 temporarily"
    fi

    # Request certificate using standalone mode
    if certbot certonly --standalone -d "${NODE_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email; then
        SSL_CERT="/etc/letsencrypt/live/${NODE_DOMAIN}/fullchain.pem"
        SSL_KEY="/etc/letsencrypt/live/${NODE_DOMAIN}/privkey.pem"
        print_success "SSL certificate obtained"
        print_info "Certificate: ${SSL_CERT}"
        print_info "Key: ${SSL_KEY}"
    else
        print_error "Failed to obtain SSL certificate"
        print_warning "Continuing without SSL..."
        ENABLE_SSL="n"
        SSL_CERT=""
        SSL_KEY=""
    fi
}

# Generate config.toml
generate_config() {
    print_step "GENERATING CONFIGURATION"

    # Determine SSL settings
    local ssl_enabled="false"
    local ssl_cert=""
    local ssl_key=""

    if [ "$ENABLE_SSL" = "y" ] && [ -n "$SSL_CERT" ]; then
        ssl_enabled="true"
        ssl_cert="$SSL_CERT"
        ssl_key="$SSL_KEY"
    fi

    # Determine Redis settings
    local REDIS_ENABLED_BOOL="false"
    local REDIS_URL_VALUE="redis://127.0.0.1:6379"

    if [ "$ENABLE_REDIS" = "y" ]; then
        REDIS_ENABLED_BOOL="true"
        REDIS_URL_VALUE="$REDIS_URL"
    fi

    cat > "${CONFIG_FILE}" << EOF
# StellarStack Daemon Configuration
# Generated by install.sh on $(date)

debug = false

[api]
host = "0.0.0.0"
port = ${DAEMON_PORT}
upload_limit = 100  # MB
trusted_proxies = []

[api.ssl]
enabled = ${ssl_enabled}
cert = "${ssl_cert}"
key = "${ssl_key}"

[system]
root_directory = "${INSTALL_DIR}"
data_directory = "${INSTALL_DIR}/volumes"
backup_directory = "${INSTALL_DIR}/backups"
archive_directory = "${INSTALL_DIR}/archives"
tmp_directory = "${INSTALL_DIR}/tmp"
log_directory = "${INSTALL_DIR}/logs"
username = "stellar"
timezone = "UTC"
disk_check_interval = 60

[system.user]
uid = 1000
gid = 1000

[docker]
# Socket is auto-detected based on OS
# Uncomment to override:
# socket = "unix:///var/run/docker.sock"
tmpfs_size = 100  # MB
container_pid_limit = 512
dns = ["1.1.1.1", "1.0.0.1"]

[docker.network]
name = "stellar"
interface = "172.18.0.1"
driver = "bridge"
is_internal = false

[docker.installer_limits]
memory = 1024  # MB
cpu = 100      # 100% = 1 core

[docker.overhead]
default = 0

[remote]
url = "${PANEL_URL}"
token_id = "${TOKEN_ID}"
token = "${TOKEN}"
timeout = 30
boot_servers_per_page = 50

[redis]
enabled = ${REDIS_ENABLED_BOOL}
url = "${REDIS_URL_VALUE}"
prefix = "${REDIS_PREFIX}"

[sftp]
enabled = true
bind_address = "0.0.0.0"
bind_port = ${SFTP_PORT}
read_only = false
EOF

    chmod 600 "${CONFIG_FILE}"
    print_success "Configuration written to ${CONFIG_FILE}"
}

# Download and install the daemon binary
install_daemon() {
    print_step "INSTALLING DAEMON"

    # Check if binary exists in current directory (for local builds)
    if [ -f "./target/release/${BINARY_NAME}" ]; then
        print_info "Using local build..."
        cp "./target/release/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
    elif [ -f "./${BINARY_NAME}" ]; then
        print_info "Using binary from current directory..."
        cp "./${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
    else
        print_info "Downloading daemon binary..."

        # Detect architecture
        ARCH=$(uname -m)
        case $ARCH in
            x86_64)
                ARCH="x86_64"
                ;;
            aarch64|arm64)
                ARCH="aarch64"
                ;;
            *)
                print_error "Unsupported architecture: ${ARCH}"
                exit 1
                ;;
        esac

        # Try to download from GitHub releases
        GITHUB_REPO="MarquesCoding/StellarStack"
        DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/daemon-latest/stellar-daemon-linux-${ARCH}"

        print_info "Downloading from: ${DOWNLOAD_URL}"

        if curl -fsSL -o "${INSTALL_DIR}/${BINARY_NAME}" "${DOWNLOAD_URL}"; then
            print_success "Downloaded daemon binary"
        else
            print_warning "Failed to download from latest release, trying versioned releases..."

            # Try to get the latest versioned release
            LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases" | grep -o '"tag_name": "daemon-v[^"]*"' | head -1 | cut -d'"' -f4)

            if [ -n "$LATEST_TAG" ]; then
                DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/stellar-daemon-linux-${ARCH}"
                print_info "Trying: ${DOWNLOAD_URL}"

                if curl -fsSL -o "${INSTALL_DIR}/${BINARY_NAME}" "${DOWNLOAD_URL}"; then
                    print_success "Downloaded daemon binary (${LATEST_TAG})"
                else
                    print_error "Failed to download daemon binary"
                    print_info "Please build from source:"
                    echo -e "  ${MUTED}cd apps/daemon && cargo build --release${NC}"
                    echo -e "  ${MUTED}cp target/release/stellar-daemon ${INSTALL_DIR}/${NC}"
                    exit 1
                fi
            else
                print_error "No releases found"
                print_info "Please build from source:"
                echo -e "  ${MUTED}cd apps/daemon && cargo build --release${NC}"
                echo -e "  ${MUTED}cp target/release/stellar-daemon ${INSTALL_DIR}/${NC}"
                exit 1
            fi
        fi
    fi

    chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
    print_success "Daemon installed to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Setup systemd service
setup_systemd() {
    if [ "$SETUP_SERVICE" != "y" ]; then
        print_info "Skipping systemd setup"
        return
    fi

    print_step "SETTING UP SYSTEMD SERVICE"

    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=StellarStack Daemon - Game Server Management
Documentation=https://github.com/MarquesCoding/StellarStack
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${BINARY_NAME} --config ${CONFIG_FILE}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security hardening
NoNewPrivileges=false
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}
ReadWritePaths=/var/run/docker.sock

# Environment
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    print_success "Systemd service created"

    # Enable service
    systemctl enable "${SERVICE_NAME}"
    print_success "Service enabled for auto-start"
}

# Setup certbot auto-renewal
setup_certbot_renewal() {
    if [ "$ENABLE_SSL" != "y" ] || [ -z "$SSL_CERT" ]; then
        return
    fi

    print_step "SETTING UP SSL AUTO-RENEWAL"

    # Create renewal hook to restart daemon after cert renewal
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    cat > "/etc/letsencrypt/renewal-hooks/deploy/stellar-daemon.sh" << EOF
#!/bin/bash
systemctl restart ${SERVICE_NAME}
EOF
    chmod +x "/etc/letsencrypt/renewal-hooks/deploy/stellar-daemon.sh"

    print_success "SSL auto-renewal configured"
    print_info "Certificates will auto-renew and daemon will restart"
}

# Configure firewall
configure_firewall() {
    print_step "FIREWALL CONFIGURATION"

    if command -v ufw &> /dev/null; then
        print_info "Configuring UFW firewall..."

        ufw allow "${DAEMON_PORT}/tcp" comment "StellarStack Daemon API"
        ufw allow "${SFTP_PORT}/tcp" comment "StellarStack SFTP"

        if [ "$ENABLE_SSL" = "y" ]; then
            ufw allow 80/tcp comment "HTTP (Certbot renewal)"
        fi

        print_success "Firewall rules added"
    elif command -v firewall-cmd &> /dev/null; then
        print_info "Configuring firewalld..."

        firewall-cmd --permanent --add-port="${DAEMON_PORT}/tcp"
        firewall-cmd --permanent --add-port="${SFTP_PORT}/tcp"

        if [ "$ENABLE_SSL" = "y" ]; then
            firewall-cmd --permanent --add-port=80/tcp
        fi

        firewall-cmd --reload
        print_success "Firewall rules added"
    else
        print_warning "No supported firewall detected"
        print_info "Please manually open ports: ${DAEMON_PORT}, ${SFTP_PORT}"
    fi
}

# Create Docker network
create_docker_network() {
    print_step "CREATING DOCKER NETWORK"

    if docker network inspect stellar &> /dev/null; then
        print_info "Docker network 'stellar' already exists"
    else
        docker network create \
            --driver bridge \
            --subnet 172.18.0.0/16 \
            --gateway 172.18.0.1 \
            stellar
        print_success "Created Docker network 'stellar'"
    fi
}

# Start the daemon
start_daemon() {
    print_step "STARTING DAEMON"

    if [ "$SETUP_SERVICE" = "y" ]; then
        systemctl start "${SERVICE_NAME}"
        sleep 2

        if systemctl is-active --quiet "${SERVICE_NAME}"; then
            print_success "Daemon started successfully"
        else
            print_error "Failed to start daemon"
            print_info "Check logs with: journalctl -u ${SERVICE_NAME} -f"
        fi
    else
        print_info "To start the daemon manually:"
        echo -e "  ${MUTED}${INSTALL_DIR}/${BINARY_NAME} --config ${CONFIG_FILE}${NC}"
    fi
}

# Show completion message
show_complete() {
    print_step "INSTALLATION COMPLETE"

    local protocol="http"
    if [ "$ENABLE_SSL" = "y" ] && [ -n "$SSL_CERT" ]; then
        protocol="https"
    fi

    echo -e "  ${PRIMARY}Node URL:${NC}       ${SECONDARY}${protocol}://${NODE_DOMAIN}:${DAEMON_PORT}${NC}"
    echo -e "  ${PRIMARY}SFTP Port:${NC}      ${SECONDARY}${SFTP_PORT}${NC}"
    if [ "$ENABLE_REDIS" = "y" ]; then
        echo -e "  ${PRIMARY}Redis:${NC}          ${SECONDARY}${REDIS_URL}${NC}"
    fi
    echo -e "  ${PRIMARY}Install Dir:${NC}    ${SECONDARY}${INSTALL_DIR}${NC}"
    echo -e "  ${PRIMARY}Config File:${NC}    ${SECONDARY}${CONFIG_FILE}${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${PRIMARY}USEFUL COMMANDS:${NC}"
    echo ""
    if [ "$SETUP_SERVICE" = "y" ]; then
        echo -e "    ${SECONDARY}systemctl status ${SERVICE_NAME}${NC}    ${MUTED}# Check status${NC}"
        echo -e "    ${SECONDARY}systemctl restart ${SERVICE_NAME}${NC}   ${MUTED}# Restart daemon${NC}"
        echo -e "    ${SECONDARY}systemctl stop ${SERVICE_NAME}${NC}      ${MUTED}# Stop daemon${NC}"
        echo -e "    ${SECONDARY}journalctl -u ${SERVICE_NAME} -f${NC}    ${MUTED}# View logs${NC}"
    else
        echo -e "    ${SECONDARY}${INSTALL_DIR}/${BINARY_NAME} --config ${CONFIG_FILE}${NC}"
    fi
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${PRIMARY}NEXT STEPS:${NC}"
    echo ""
    echo -e "    ${SECONDARY}1.${NC} Go to your Panel and add this node"
    echo -e "    ${SECONDARY}2.${NC} Use the following URL: ${PRIMARY}${protocol}://${NODE_DOMAIN}:${DAEMON_PORT}${NC}"
    echo -e "    ${SECONDARY}3.${NC} The daemon will sync with the Panel automatically"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if [ "$ENABLE_SSL" = "y" ] && [ -n "$SSL_CERT" ]; then
        echo -e "  ${PRIMARY}SSL CERTIFICATE:${NC}"
        echo ""
        echo -e "    ${SECONDARY}Certificate:${NC} ${MUTED}${SSL_CERT}${NC}"
        echo -e "    ${SECONDARY}Private Key:${NC} ${MUTED}${SSL_KEY}${NC}"
        echo -e "    ${SECONDARY}Auto-renewal:${NC} ${MUTED}Enabled via certbot${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi

    echo -e "  ${SECONDARY}Thank you for using StellarStack!${NC}"
    echo ""
}

# Uninstall function
uninstall() {
    print_banner
    print_step "UNINSTALLING STELLAR DAEMON"

    echo -e "  ${WARNING}This will remove:${NC}"
    echo -e "    - Daemon binary and configuration"
    echo -e "    - Systemd service"
    echo -e "    - Firewall rules"
    echo ""
    echo -e "  ${WARNING}This will NOT remove:${NC}"
    echo -e "    - Server data (volumes, backups)"
    echo -e "    - SSL certificates"
    echo -e "    - Docker network"
    echo ""
    echo -e "  ${SECONDARY}Are you sure? ${MUTED}[y/N]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r confirm

    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Uninstall cancelled"
        exit 0
    fi

    # Stop and disable service
    if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
        systemctl stop "${SERVICE_NAME}"
        print_success "Stopped daemon service"
    fi

    if [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
        systemctl disable "${SERVICE_NAME}" 2>/dev/null
        rm "/etc/systemd/system/${SERVICE_NAME}.service"
        systemctl daemon-reload
        print_success "Removed systemd service"
    fi

    # Remove binary and config (but keep data)
    if [ -f "${INSTALL_DIR}/${BINARY_NAME}" ]; then
        rm "${INSTALL_DIR}/${BINARY_NAME}"
        print_success "Removed daemon binary"
    fi

    if [ -f "${CONFIG_FILE}" ]; then
        rm "${CONFIG_FILE}"
        print_success "Removed configuration"
    fi

    print_success "Uninstall complete"
    print_info "Server data preserved in ${INSTALL_DIR}/volumes"
}

# Main
main() {
    # Check for uninstall flag
    if [ "$1" = "--uninstall" ] || [ "$1" = "-u" ]; then
        check_root
        uninstall
        exit 0
    fi

    print_banner
    check_root
    check_requirements
    prompt_configuration
    show_summary

    create_directories
    create_docker_network
    setup_ssl
    generate_config
    install_daemon
    setup_systemd
    setup_certbot_renewal
    configure_firewall
    start_daemon

    show_complete
}

main "$@"
