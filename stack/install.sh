#!/bin/bash

# StellarStack Daemon Installer
# https://github.com/MarquesCoding/StellarStack

set -e

# Colors - Old school terminal green (Alien/Nostromo style)
GREEN='\033[0;32m'
BRIGHT_GREEN='\033[1;32m'
DIM_GREEN='\033[2;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
BOLD='\033[1m'
DIM='\033[2m'

# Alias colors to green palette for retro terminal look
PRIMARY="${BRIGHT_GREEN}"
SECONDARY="${GREEN}"
MUTED="${DIM_GREEN}"
ERROR="${RED}"
WARNING="${YELLOW}"

# Installation paths
DAEMON_INSTALL_DIR="/opt/stellar-daemon"
GITHUB_REPO="MarquesCoding/StellarStack"

# Daemon configuration
daemon_panel_url=""
daemon_token_id=""
daemon_token=""
daemon_port="8080"
daemon_sftp_port="2022"
daemon_enable_ssl="n"
daemon_ssl_domain=""
daemon_enable_redis="n"
daemon_redis_url=""

# Dependency installation choices
install_docker="n"
install_git="n"
install_rust="n"
install_certbot="n"

# Print functions
print_step() {
    echo ""
    echo -e "${PRIMARY}  > $1${NC}"
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
}

print_success() {
    echo -e "  ${PRIMARY}[✓]${NC} $1"
}

print_error() {
    echo -e "  ${ERROR}[✗]${NC} $1"
}

print_warning() {
    echo -e "  ${WARNING}[!]${NC} $1"
}

print_info() {
    echo -e "  ${SECONDARY}[i]${NC} $1"
}

print_task() {
    echo -ne "  ${MUTED}[ ]${NC} ${MUTED}$1...${NC}"
}

print_task_done() {
    echo -e "\r  ${PRIMARY}[■]${NC} ${PRIMARY}$1${NC}    "
}

# Wait for user to press enter
wait_for_enter() {
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -ne "${SECONDARY}  Press ${PRIMARY}[ENTER]${SECONDARY} to continue...${NC}"
    read -r </dev/tty
}

# Ask yes/no question, returns 0 for yes, 1 for no
ask_yes_no() {
    local prompt="$1"
    local default="$2"
    local input

    if [ "$default" = "y" ]; then
        echo -ne "  ${SECONDARY}${prompt} ${MUTED}[Y/n]${NC} "
    else
        echo -ne "  ${SECONDARY}${prompt} ${MUTED}[y/N]${NC} "
    fi

    read -r input </dev/tty

    if [ "$default" = "y" ]; then
        if [ "$input" = "n" ] || [ "$input" = "N" ]; then
            return 1
        fi
        return 0
    else
        if [ "$input" = "y" ] || [ "$input" = "Y" ]; then
            return 0
        fi
        return 1
    fi
}

# Clear screen and show header
clear_screen() {
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
    echo -e "${SECONDARY}  INTERFACE 2037 // STELLARSTACK INC // DAEMON INSTALLER${NC}"
    echo -e "${MUTED}  ════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Show welcome screen
show_welcome() {
    clear_screen
    echo -e "${PRIMARY}  > INITIALIZATION SEQUENCE${NC}"
    echo ""
    echo -e "${SECONDARY}  This installer will set up the StellarStack Daemon on your server.${NC}"
    echo -e "${SECONDARY}  The daemon manages game server containers and communicates with your Panel.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  SYSTEM REQUIREMENTS:${NC}"
    echo -e "${SECONDARY}    > Ubuntu 20.04+ / Debian 11+ / RHEL 8+${NC}"
    echo -e "${SECONDARY}    > 2GB RAM minimum (4GB recommended)${NC}"
    echo -e "${SECONDARY}    > 20GB disk space${NC}"
    echo -e "${SECONDARY}    > Docker${NC}"
    echo -e "${SECONDARY}    > Rust (for building)${NC}"
    echo ""
    wait_for_enter
}

# Check dependencies and ask to install missing ones
check_dependencies() {
    clear_screen
    echo -e "${PRIMARY}  > DEPENDENCY CHECK${NC}"
    echo ""
    echo -e "${SECONDARY}  Checking required dependencies...${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Check Docker
    if command -v docker &> /dev/null; then
        print_success "Docker is installed"
    else
        print_warning "Docker is NOT installed"
        echo ""
        echo -e "${SECONDARY}  Docker is required to run game server containers.${NC}"
        if ask_yes_no "Install Docker?" "y"; then
            install_docker="y"
            print_info "Docker will be installed"
        else
            print_error "Docker is required. Cannot continue."
            exit 1
        fi
    fi
    echo ""

    # Check Git
    if command -v git &> /dev/null; then
        print_success "Git is installed"
    else
        print_warning "Git is NOT installed"
        echo ""
        echo -e "${SECONDARY}  Git is required to clone the repository.${NC}"
        if ask_yes_no "Install Git?" "y"; then
            install_git="y"
            print_info "Git will be installed"
        else
            print_error "Git is required. Cannot continue."
            exit 1
        fi
    fi
    echo ""

    # Check Rust/Cargo
    if command -v cargo &> /dev/null; then
        print_success "Rust/Cargo is installed"
    else
        print_warning "Rust/Cargo is NOT installed"
        echo ""
        echo -e "${SECONDARY}  Rust is required to build the daemon from source.${NC}"
        if ask_yes_no "Install Rust?" "y"; then
            install_rust="y"
            print_info "Rust will be installed"
        else
            print_error "Rust is required. Cannot continue."
            exit 1
        fi
    fi
    echo ""

    # Check Certbot (optional)
    if command -v certbot &> /dev/null; then
        print_success "Certbot is installed (optional)"
    else
        print_info "Certbot is not installed (optional - for SSL)"
    fi

    wait_for_enter
}

# Show daemon configuration
collect_daemon_config() {
    clear_screen
    echo -e "${PRIMARY}  > DAEMON CONFIGURATION${NC}"
    echo ""
    echo -e "${SECONDARY}  Configure the daemon connection to your StellarStack Panel.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Panel API URL
    while [ -z "$daemon_panel_url" ]; do
        echo -e "${SECONDARY}  Panel API URL ${MUTED}(e.g., https://api.example.com)${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r daemon_panel_url </dev/tty
        if [ -z "$daemon_panel_url" ]; then
            print_error "Panel API URL is required"
            echo ""
        fi
    done
    echo ""

    # Token ID
    while [ -z "$daemon_token_id" ]; do
        echo -e "${SECONDARY}  Token ID ${MUTED}(from Panel > Nodes > Configure)${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r daemon_token_id </dev/tty
        if [ -z "$daemon_token_id" ]; then
            print_error "Token ID is required"
            echo ""
        fi
    done
    echo ""

    # Token
    while [ -z "$daemon_token" ]; do
        echo -e "${SECONDARY}  Token ${MUTED}(full token string from Panel)${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r daemon_token </dev/tty
        if [ -z "$daemon_token" ]; then
            print_error "Token is required"
            echo ""
        fi
    done
    echo ""

    # Daemon Port
    echo -e "${SECONDARY}  Daemon API Port ${MUTED}[default: 8080]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_port </dev/tty
    if [ -n "$input_port" ]; then
        daemon_port="$input_port"
    fi
    echo ""

    # SFTP Port
    echo -e "${SECONDARY}  SFTP Port ${MUTED}[default: 2022]${NC}"
    echo -ne "  ${PRIMARY}>${NC} "
    read -r input_sftp </dev/tty
    if [ -n "$input_sftp" ]; then
        daemon_sftp_port="$input_sftp"
    fi

    wait_for_enter
}

# Show SSL configuration
collect_ssl_config() {
    clear_screen
    echo -e "${PRIMARY}  > SSL CONFIGURATION${NC}"
    echo ""
    echo -e "${SECONDARY}  Configure SSL for secure daemon connections.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if ask_yes_no "Enable SSL with Certbot?" "n"; then
        daemon_enable_ssl="y"
        echo ""

        # Check if certbot is installed or will be installed
        if ! command -v certbot &> /dev/null; then
            echo -e "${SECONDARY}  Certbot is required for SSL.${NC}"
            if ask_yes_no "Install Certbot?" "y"; then
                install_certbot="y"
                print_info "Certbot will be installed"
            else
                print_warning "SSL disabled (Certbot not available)"
                daemon_enable_ssl="n"
            fi
        fi

        if [ "$daemon_enable_ssl" = "y" ]; then
            echo ""
            while [ -z "$daemon_ssl_domain" ]; do
                echo -e "${SECONDARY}  Domain for SSL certificate ${MUTED}(e.g., node1.example.com)${NC}"
                echo -ne "  ${PRIMARY}>${NC} "
                read -r daemon_ssl_domain </dev/tty
                if [ -z "$daemon_ssl_domain" ]; then
                    print_error "Domain is required for SSL"
                    echo ""
                fi
            done
        fi
    else
        print_info "SSL will be disabled"
    fi

    wait_for_enter
}

# Show Redis configuration
collect_redis_config() {
    clear_screen
    echo -e "${PRIMARY}  > REDIS CONFIGURATION${NC}"
    echo ""
    echo -e "${SECONDARY}  Redis enables caching and pub/sub for better performance.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if ask_yes_no "Do you have a Redis server?" "n"; then
        daemon_enable_redis="y"
        echo ""
        echo -e "${SECONDARY}  Redis URL ${MUTED}[default: redis://127.0.0.1:6379]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r daemon_redis_url </dev/tty
        if [ -z "$daemon_redis_url" ]; then
            daemon_redis_url="redis://127.0.0.1:6379"
        fi
    else
        print_info "Redis will be disabled"
    fi

    wait_for_enter
}

# Show configuration summary
show_summary() {
    clear_screen
    echo -e "${PRIMARY}  > CONFIGURATION SUMMARY${NC}"
    echo ""
    echo -e "${SECONDARY}  Please review your configuration:${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  PANEL CONNECTION:${NC}"
    echo -e "    ${SECONDARY}API URL:${NC}    ${PRIMARY}${daemon_panel_url}${NC}"
    echo -e "    ${SECONDARY}Token ID:${NC}   ${PRIMARY}${daemon_token_id}${NC}"
    echo -e "    ${SECONDARY}Token:${NC}      ${PRIMARY}${daemon_token:0:20}...${NC}"
    echo ""
    echo -e "${PRIMARY}  NETWORK:${NC}"
    echo -e "    ${SECONDARY}API Port:${NC}   ${PRIMARY}${daemon_port}${NC}"
    echo -e "    ${SECONDARY}SFTP Port:${NC}  ${PRIMARY}${daemon_sftp_port}${NC}"
    if [ "$daemon_enable_ssl" = "y" ]; then
        echo -e "    ${SECONDARY}SSL:${NC}        ${PRIMARY}Enabled (${daemon_ssl_domain})${NC}"
    else
        echo -e "    ${SECONDARY}SSL:${NC}        ${MUTED}Disabled${NC}"
    fi
    echo ""
    echo -e "${PRIMARY}  REDIS:${NC}"
    if [ "$daemon_enable_redis" = "y" ]; then
        echo -e "    ${SECONDARY}Status:${NC}     ${PRIMARY}Enabled${NC}"
        echo -e "    ${SECONDARY}URL:${NC}        ${PRIMARY}${daemon_redis_url}${NC}"
    else
        echo -e "    ${SECONDARY}Status:${NC}     ${MUTED}Disabled${NC}"
    fi
    echo ""
    echo -e "${PRIMARY}  INSTALLATION:${NC}"
    echo -e "    ${SECONDARY}Directory:${NC}  ${PRIMARY}${DAEMON_INSTALL_DIR}${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if ask_yes_no "Proceed with installation?" "y"; then
        return 0
    else
        echo ""
        print_info "Installation cancelled."
        exit 0
    fi
}

# Install dependencies
install_dependencies() {
    print_step "INSTALLING DEPENDENCIES"

    # Install Docker
    if [ "$install_docker" = "y" ]; then
        print_task "Installing Docker"
        curl -fsSL https://get.docker.com | sh > /dev/null 2>&1
        systemctl start docker
        systemctl enable docker
        print_task_done "Installing Docker"
    else
        print_success "Docker already installed"
    fi

    # Install Git
    if [ "$install_git" = "y" ]; then
        print_task "Installing Git"
        if command -v apt-get &> /dev/null; then
            apt-get update -qq && apt-get install -y git > /dev/null 2>&1
        elif command -v dnf &> /dev/null; then
            dnf install -y git > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            yum install -y git > /dev/null 2>&1
        fi
        print_task_done "Installing Git"
    else
        print_success "Git already installed"
    fi

    # Install Rust
    if [ "$install_rust" = "y" ]; then
        print_task "Installing build dependencies"
        if command -v apt-get &> /dev/null; then
            apt-get update -qq && apt-get install -y build-essential pkg-config libssl-dev > /dev/null 2>&1
        elif command -v dnf &> /dev/null; then
            dnf groupinstall -y "Development Tools" > /dev/null 2>&1
            dnf install -y openssl-devel pkg-config > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            yum groupinstall -y "Development Tools" > /dev/null 2>&1
            yum install -y openssl-devel pkg-config > /dev/null 2>&1
        fi
        print_task_done "Installing build dependencies"

        print_task "Installing Rust"
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y > /dev/null 2>&1
        export PATH="$HOME/.cargo/bin:$PATH"
        print_task_done "Installing Rust"
    else
        print_success "Rust already installed"
    fi

    # Install Certbot
    if [ "$install_certbot" = "y" ]; then
        print_task "Installing Certbot"
        if command -v apt-get &> /dev/null; then
            apt-get install -y certbot > /dev/null 2>&1
        elif command -v dnf &> /dev/null; then
            dnf install -y certbot > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            yum install -y certbot > /dev/null 2>&1
        fi
        print_task_done "Installing Certbot"
    fi
}

# Install daemon
install_daemon() {
    print_step "INSTALLING STELLAR DAEMON"

    BUILD_DIR="/tmp/stellar-daemon-build"

    print_task "Cloning repository"
    rm -rf "${BUILD_DIR}"
    git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "${BUILD_DIR}" > /dev/null 2>&1
    print_task_done "Cloning repository"

    print_task "Building daemon (this may take a few minutes)"
    cd "${BUILD_DIR}/stack/apps/daemon"
    export PATH="$HOME/.cargo/bin:$PATH"
    cargo build --release > /dev/null 2>&1
    print_task_done "Building daemon"

    print_task "Installing daemon"
    mkdir -p "${DAEMON_INSTALL_DIR}"/{volumes,backups,archives,tmp,logs}
    cp "target/release/stellar-daemon" "${DAEMON_INSTALL_DIR}/stellar-daemon"
    chmod +x "${DAEMON_INSTALL_DIR}/stellar-daemon"
    print_task_done "Installing daemon"

    # Setup SSL if enabled
    local ssl_enabled="false"
    local ssl_cert=""
    local ssl_key=""

    if [ "$daemon_enable_ssl" = "y" ] && [ -n "$daemon_ssl_domain" ]; then
        print_task "Obtaining SSL certificate"
        if certbot certonly --standalone -d "${daemon_ssl_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
            ssl_enabled="true"
            ssl_cert="/etc/letsencrypt/live/${daemon_ssl_domain}/fullchain.pem"
            ssl_key="/etc/letsencrypt/live/${daemon_ssl_domain}/privkey.pem"
            print_task_done "Obtaining SSL certificate"
        else
            print_warning "Failed to obtain SSL certificate, continuing without SSL"
        fi
    fi

    # Redis settings
    local redis_enabled="false"
    local redis_url="redis://127.0.0.1:6379"
    if [ "$daemon_enable_redis" = "y" ]; then
        redis_enabled="true"
        redis_url="$daemon_redis_url"
    fi

    print_task "Generating configuration"
    cat > "${DAEMON_INSTALL_DIR}/config.toml" << EOF
# StellarStack Daemon Configuration
# Generated by install.sh on $(date)

debug = false

[api]
host = "0.0.0.0"
port = ${daemon_port}
upload_limit = 100
trusted_proxies = []

[api.ssl]
enabled = ${ssl_enabled}
cert = "${ssl_cert}"
key = "${ssl_key}"

[system]
root_directory = "${DAEMON_INSTALL_DIR}"
data_directory = "${DAEMON_INSTALL_DIR}/volumes"
backup_directory = "${DAEMON_INSTALL_DIR}/backups"
archive_directory = "${DAEMON_INSTALL_DIR}/archives"
tmp_directory = "${DAEMON_INSTALL_DIR}/tmp"
log_directory = "${DAEMON_INSTALL_DIR}/logs"
username = "stellar"
timezone = "UTC"
disk_check_interval = 60

[system.user]
uid = 1000
gid = 1000

[docker]
tmpfs_size = 100
container_pid_limit = 512
dns = ["1.1.1.1", "1.0.0.1"]

[docker.network]
name = "stellar"
interface = "172.18.0.1"
driver = "bridge"
is_internal = false

[docker.installer_limits]
memory = 1024
cpu = 100

[docker.overhead]
default = 0

[remote]
url = "${daemon_panel_url}"
token_id = "${daemon_token_id}"
token = "${daemon_token}"
timeout = 30
boot_servers_per_page = 50

[redis]
enabled = ${redis_enabled}
url = "${redis_url}"
prefix = "stellar"

[sftp]
enabled = true
bind_address = "0.0.0.0"
bind_port = ${daemon_sftp_port}
read_only = false
EOF
    chmod 600 "${DAEMON_INSTALL_DIR}/config.toml"
    print_task_done "Generating configuration"

    print_task "Creating systemd service"
    cat > "/etc/systemd/system/stellar-daemon.service" << EOF
[Unit]
Description=StellarStack Daemon - Game Server Management
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${DAEMON_INSTALL_DIR}
ExecStart=${DAEMON_INSTALL_DIR}/stellar-daemon --config ${DAEMON_INSTALL_DIR}/config.toml
Restart=always
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable stellar-daemon > /dev/null 2>&1
    print_task_done "Creating systemd service"

    print_task "Creating Docker network"
    docker network create --driver bridge --subnet 172.18.0.0/16 --gateway 172.18.0.1 stellar > /dev/null 2>&1 || true
    print_task_done "Creating Docker network"

    print_task "Starting daemon"
    systemctl start stellar-daemon
    print_task_done "Starting daemon"

    # Cleanup
    cd /
    rm -rf "${BUILD_DIR}"
}

# Show installation progress
run_installation() {
    clear_screen
    echo -e "${PRIMARY}  > DEPLOYING STELLAR DAEMON${NC}"
    echo ""
    echo -e "${SECONDARY}  Please wait while we set up your daemon...${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        echo -e "  ${MUTED}Run with: sudo $0${NC}"
        exit 1
    fi

    # Install dependencies
    install_dependencies

    # Install daemon
    install_daemon

    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
}

# Show completion screen
show_complete() {
    clear_screen
    echo -e "${PRIMARY}  > DEPLOYMENT COMPLETE${NC}"
    echo ""
    echo -e "${SECONDARY}  StellarStack Daemon has been successfully installed.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  ACCESS POINTS:${NC}"
    echo ""
    local protocol="http"
    if [ "$daemon_enable_ssl" = "y" ]; then
        protocol="https"
        echo -e "    ${PRIMARY}>${NC}  Daemon:    ${PRIMARY}${protocol}://${daemon_ssl_domain}:${daemon_port}${NC}"
    else
        echo -e "    ${PRIMARY}>${NC}  Daemon:    ${PRIMARY}${protocol}://YOUR_SERVER_IP:${daemon_port}${NC}"
    fi
    echo -e "    ${PRIMARY}>${NC}  SFTP:      ${PRIMARY}Port ${daemon_sftp_port}${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  USEFUL COMMANDS:${NC}"
    echo ""
    echo -e "    ${SECONDARY}systemctl status stellar-daemon${NC}    ${MUTED}# Check status${NC}"
    echo -e "    ${SECONDARY}systemctl restart stellar-daemon${NC}   ${MUTED}# Restart${NC}"
    echo -e "    ${SECONDARY}systemctl stop stellar-daemon${NC}      ${MUTED}# Stop${NC}"
    echo -e "    ${SECONDARY}journalctl -u stellar-daemon -f${NC}    ${MUTED}# View logs${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  CONFIGURATION:${NC}"
    echo ""
    echo -e "    ${SECONDARY}Config file:${NC}  ${PRIMARY}${DAEMON_INSTALL_DIR}/config.toml${NC}"
    echo -e "    ${SECONDARY}Volumes:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/volumes${NC}"
    echo -e "    ${SECONDARY}Backups:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/backups${NC}"
    echo -e "    ${SECONDARY}Logs:${NC}         ${PRIMARY}${DAEMON_INSTALL_DIR}/logs${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${SECONDARY}  Thank you for installing StellarStack!${NC}"
    echo -e "${MUTED}  Documentation: https://docs.stellarstack.app${NC}"
    echo ""
}

# Main function - linear flow, no state machine
main() {
    # Step 1: Welcome
    show_welcome

    # Step 2: Check dependencies
    check_dependencies

    # Step 3: Collect daemon configuration
    collect_daemon_config

    # Step 4: SSL configuration
    collect_ssl_config

    # Step 5: Redis configuration
    collect_redis_config

    # Step 6: Show summary and confirm
    show_summary

    # Step 7: Run installation
    run_installation

    # Step 8: Show completion
    show_complete
}

# Run
main
