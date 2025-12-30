#!/bin/bash

# StellarStack Daemon Installer
# https://github.com/MarquesCoding/StellarStack

set -e

# Version info - replaced during release builds, or use git if available
INSTALLER_VERSION="__GIT_COMMIT__"
INSTALLER_DATE="__BUILD_DATE__"

# Try to get actual git info if we're running from a clone and placeholders are still present
if [[ "$INSTALLER_VERSION" == "__GIT_COMMIT__" ]]; then
    if command -v git &> /dev/null && git rev-parse --git-dir &> /dev/null 2>&1; then
        INSTALLER_VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
        INSTALLER_DATE=$(git log -1 --format=%cd --date=short 2>/dev/null || echo "unknown")
    else
        INSTALLER_VERSION="dev"
        INSTALLER_DATE=$(date +%Y-%m-%d)
    fi
fi

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
server_ip=""

# Dependency installation choices
install_docker="n"
install_git="n"
install_rust="n"
install_certbot="n"

# Upgrade mode (keeps existing config)
upgrade_mode="n"

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

# Show spinner while a command runs
run_with_spinner() {
    local pid
    local spin_chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local msg="$1"
    shift

    # Run command in background
    "$@" &
    pid=$!

    # Show spinner
    local i=0
    while kill -0 $pid 2>/dev/null; do
        local char="${spin_chars:$i:1}"
        echo -ne "\r  ${PRIMARY}[${char}]${NC} ${MUTED}${msg}...${NC}"
        sleep 0.1
        i=$(( (i + 1) % ${#spin_chars} ))
    done

    # Wait for command to finish and get exit code
    wait $pid
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        echo -e "\r  ${PRIMARY}[■]${NC} ${PRIMARY}${msg}${NC}    "
    else
        echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}${msg} (failed)${NC}    "
    fi

    return $exit_code
}

# Show progress bar for cargo build
build_with_progress() {
    local build_dir="$1"
    local log_file="/tmp/stellar-build.log"

    cd "$build_dir"
    export PATH="$HOME/.cargo/bin:$PATH"

    echo -e "  ${MUTED}[ ]${NC} ${MUTED}Building daemon...${NC}"
    echo ""

    # Run cargo build and capture output
    cargo build --release 2>&1 | while IFS= read -r line; do
        # Extract progress from cargo output (Compiling X/Y)
        if [[ "$line" =~ Compiling ]]; then
            # Extract crate name
            local crate=$(echo "$line" | sed -n 's/.*Compiling \([^ ]*\).*/\1/p')
            echo -ne "\r  ${PRIMARY}[▸]${NC} ${MUTED}Compiling: ${crate}${NC}                              "
        elif [[ "$line" =~ Finished ]]; then
            echo -ne "\r  ${PRIMARY}[■]${NC} ${PRIMARY}Build complete${NC}                                        "
            echo ""
        fi
    done

    # Check if build succeeded
    if [ -f "target/release/stellar-daemon" ]; then
        return 0
    else
        echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}Build failed${NC}"
        return 1
    fi
}

# Wait for user to press enter
wait_for_enter() {
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -ne "${SECONDARY}  Press ${PRIMARY}[ENTER]${SECONDARY} to continue...${NC}"
    read -r </dev/tty
}

# Get server's public IP address
get_server_ip() {
    # Try multiple services in case one is down
    local ip=""

    # Try curl with various services
    if command -v curl &> /dev/null; then
        ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null) || \
        ip=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null) || \
        ip=$(curl -s --max-time 5 https://icanhazip.com 2>/dev/null) || \
        ip=$(curl -s --max-time 5 https://ipecho.net/plain 2>/dev/null)
    fi

    # Fallback to wget
    if [ -z "$ip" ] && command -v wget &> /dev/null; then
        ip=$(wget -qO- --timeout=5 https://api.ipify.org 2>/dev/null) || \
        ip=$(wget -qO- --timeout=5 https://ifconfig.me 2>/dev/null)
    fi

    # Validate IP format (basic check)
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "$ip"
        return 0
    fi

    return 1
}

# Verify domain resolves to server IP
verify_domain_dns() {
    local domain="$1"
    local expected_ip="$2"

    # Try to resolve domain using dig, nslookup, or host
    local resolved_ip=""

    if command -v dig &> /dev/null; then
        resolved_ip=$(dig +short "$domain" A 2>/dev/null | head -1)
    elif command -v nslookup &> /dev/null; then
        resolved_ip=$(nslookup "$domain" 2>/dev/null | awk '/^Address: / { print $2 }' | tail -1)
    elif command -v host &> /dev/null; then
        resolved_ip=$(host "$domain" 2>/dev/null | awk '/has address/ { print $4 }' | head -1)
    elif command -v getent &> /dev/null; then
        resolved_ip=$(getent hosts "$domain" 2>/dev/null | awk '{ print $1 }' | head -1)
    fi

    if [ -z "$resolved_ip" ]; then
        echo "unable_to_resolve"
        return 1
    fi

    if [ "$resolved_ip" = "$expected_ip" ]; then
        echo "$resolved_ip"
        return 0
    else
        echo "$resolved_ip"
        return 1
    fi
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
    echo -e "${SECONDARY}  INTERFACE 2037 // STELLARSTACK INC // DAEMON INSTALLER // v${INSTALLER_VERSION} (${INSTALLER_DATE})${NC}"
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

# Check for existing installation
check_existing_installation() {
    clear_screen
    echo -e "${PRIMARY}  > EXISTING INSTALLATION CHECK${NC}"
    echo ""

    local existing=false

    # Check if daemon binary exists
    if [ -f "${DAEMON_INSTALL_DIR}/stellar-daemon" ]; then
        existing=true
        print_warning "Existing daemon installation found at ${DAEMON_INSTALL_DIR}"
    fi

    # Check if systemd service exists
    if systemctl list-unit-files | grep -q "stellar-daemon.service"; then
        existing=true
        print_warning "Existing systemd service found"
    fi

    # Check if config exists
    local config_exists=false
    if [ -f "${DAEMON_INSTALL_DIR}/config.toml" ]; then
        config_exists=true
        print_info "Existing configuration found"
    fi

    if [ "$existing" = true ]; then
        echo ""
        echo -e "${SECONDARY}  An existing StellarStack Daemon installation was detected.${NC}"
        echo ""

        if [ "$config_exists" = true ]; then
            echo -e "${SECONDARY}  Would you like to keep your existing configuration?${NC}"
            echo -e "${MUTED}  (This will only update the daemon binary)${NC}"
            echo ""

            if ask_yes_no "Keep existing configuration?" "y"; then
                upgrade_mode="y"
                echo ""
                print_info "Upgrade mode enabled - existing config will be preserved"
                echo ""
                print_task "Stopping existing daemon"
                systemctl stop stellar-daemon 2>/dev/null || true
                print_task_done "Stopping existing daemon"
            else
                echo ""
                print_info "Full installation mode - configuration will be recollected"
                echo ""
                print_task "Stopping existing daemon"
                systemctl stop stellar-daemon 2>/dev/null || true
                print_task_done "Stopping existing daemon"

                print_task "Disabling existing daemon"
                systemctl disable stellar-daemon 2>/dev/null || true
                print_task_done "Disabling existing daemon"
            fi
        else
            echo -e "${SECONDARY}  The installer will stop the current daemon and reinstall it.${NC}"
            echo ""

            if ask_yes_no "Continue with installation?" "y"; then
                echo ""
                print_task "Stopping existing daemon"
                systemctl stop stellar-daemon 2>/dev/null || true
                print_task_done "Stopping existing daemon"

                print_task "Disabling existing daemon"
                systemctl disable stellar-daemon 2>/dev/null || true
                print_task_done "Disabling existing daemon"
            else
                echo ""
                print_info "Installation cancelled."
                exit 0
            fi
        fi
    else
        print_success "No existing installation detected"
        print_info "Proceeding with fresh installation"
    fi

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

    # Get server's public IP first
    print_task "Detecting server IP address"
    server_ip=$(get_server_ip)
    if [ -n "$server_ip" ]; then
        print_task_done "Detecting server IP address"
        echo ""
        print_info "Server IP: ${server_ip}"
        echo ""
    else
        echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Could not detect server IP automatically${NC}    "
        echo ""
        echo -e "${SECONDARY}  Please enter your server's public IP address:${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r server_ip </dev/tty
        if [ -z "$server_ip" ]; then
            print_warning "No IP provided, using 0.0.0.0 (all interfaces)"
            server_ip="0.0.0.0"
        fi
        echo ""
    fi

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
            local domain_verified=false
            while [ "$domain_verified" = false ]; do
                echo -e "${SECONDARY}  Domain for SSL certificate ${MUTED}(e.g., node1.example.com)${NC}"
                echo -ne "  ${PRIMARY}>${NC} "
                read -r daemon_ssl_domain </dev/tty

                if [ -z "$daemon_ssl_domain" ]; then
                    print_error "Domain is required for SSL"
                    echo ""
                    continue
                fi

                # Verify DNS points to this server
                echo ""
                print_task "Verifying DNS for ${daemon_ssl_domain}"
                local dns_result
                dns_result=$(verify_domain_dns "$daemon_ssl_domain" "$server_ip")
                local dns_status=$?

                if [ "$dns_result" = "unable_to_resolve" ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}Could not resolve ${daemon_ssl_domain}${NC}    "
                    echo ""
                    print_error "The domain could not be resolved. Please check:"
                    echo -e "    ${MUTED}- DNS record exists for this domain${NC}"
                    echo -e "    ${MUTED}- DNS has propagated (may take up to 24-48 hours)${NC}"
                    echo ""
                    if ! ask_yes_no "Try a different domain?" "y"; then
                        print_warning "SSL disabled (domain verification failed)"
                        daemon_enable_ssl="n"
                        daemon_ssl_domain=""
                        domain_verified=true
                    fi
                elif [ $dns_status -ne 0 ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}DNS mismatch for ${daemon_ssl_domain}${NC}    "
                    echo ""
                    print_error "Domain resolves to: ${dns_result}"
                    print_error "Expected (this server): ${server_ip}"
                    echo ""
                    echo -e "${SECONDARY}  The domain must point to this server's IP for SSL to work.${NC}"
                    echo ""
                    if ! ask_yes_no "Try a different domain?" "y"; then
                        print_warning "SSL disabled (domain verification failed)"
                        daemon_enable_ssl="n"
                        daemon_ssl_domain=""
                        domain_verified=true
                    fi
                else
                    print_task_done "Verifying DNS for ${daemon_ssl_domain}"
                    print_success "Domain ${daemon_ssl_domain} correctly points to ${server_ip}"
                    domain_verified=true
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

# Upgrade daemon only (keep existing config)
upgrade_daemon() {
    print_step "UPGRADING STELLAR DAEMON"

    BUILD_DIR="/tmp/stellar-daemon-build"
    rm -rf "${BUILD_DIR}"

    run_with_spinner "Cloning repository" git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "${BUILD_DIR}"

    echo ""
    echo -e "  ${SECONDARY}Building daemon (this may take several minutes)...${NC}"
    echo ""

    if ! build_with_progress "${BUILD_DIR}/apps/daemon"; then
        print_error "Failed to build daemon"
        exit 1
    fi

    print_task "Backing up existing daemon"
    if [ -f "${DAEMON_INSTALL_DIR}/stellar-daemon" ]; then
        cp "${DAEMON_INSTALL_DIR}/stellar-daemon" "${DAEMON_INSTALL_DIR}/stellar-daemon.bak"
    fi
    print_task_done "Backing up existing daemon"

    print_task "Installing new daemon"
    cp "${BUILD_DIR}/apps/daemon/target/release/stellar-daemon" "${DAEMON_INSTALL_DIR}/stellar-daemon"
    chmod +x "${DAEMON_INSTALL_DIR}/stellar-daemon"
    print_task_done "Installing new daemon"

    # Cleanup
    cd /
    rm -rf "${BUILD_DIR}"
}

# Install daemon
install_daemon() {
    print_step "INSTALLING STELLAR DAEMON"

    BUILD_DIR="/tmp/stellar-daemon-build"
    rm -rf "${BUILD_DIR}"

    run_with_spinner "Cloning repository" git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "${BUILD_DIR}"

    echo ""
    echo -e "  ${SECONDARY}Building daemon (this may take several minutes)...${NC}"
    echo ""

    if ! build_with_progress "${BUILD_DIR}/apps/daemon"; then
        print_error "Failed to build daemon"
        exit 1
    fi

    print_task "Installing daemon"
    mkdir -p "${DAEMON_INSTALL_DIR}"/{volumes,backups,archives,tmp,logs}
    cp "${BUILD_DIR}/apps/daemon/target/release/stellar-daemon" "${DAEMON_INSTALL_DIR}/stellar-daemon"
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
host = "${server_ip}"
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
bind_address = "${server_ip}"
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

# Show upgrade progress
run_upgrade() {
    clear_screen
    echo -e "${PRIMARY}  > UPGRADING STELLAR DAEMON${NC}"
    echo ""
    echo -e "${SECONDARY}  Please wait while we upgrade your daemon...${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        print_error "This script must be run as root"
        echo -e "  ${MUTED}Run with: sudo $0${NC}"
        exit 1
    fi

    # Check dependencies (but don't ask to install missing ones in upgrade mode)
    if ! command -v git &> /dev/null; then
        print_error "Git is required but not installed"
        exit 1
    fi
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo is required but not installed"
        exit 1
    fi

    # Upgrade daemon
    upgrade_daemon

    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
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

# Show upgrade completion screen
show_upgrade_complete() {
    clear_screen
    echo -e "${PRIMARY}  > UPGRADE COMPLETE${NC}"
    echo ""
    echo -e "${SECONDARY}  StellarStack Daemon has been successfully upgraded.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  NEXT STEPS:${NC}"
    echo ""
    echo -e "${SECONDARY}  Your existing configuration has been preserved.${NC}"
    echo -e "${SECONDARY}  The previous daemon binary has been backed up to:${NC}"
    echo -e "    ${PRIMARY}${DAEMON_INSTALL_DIR}/stellar-daemon.bak${NC}"
    echo ""
    echo -e "${WARNING}  [!]${NC} ${SECONDARY}Please restart the daemon to apply the upgrade:${NC}"
    echo ""
    echo -e "    ${PRIMARY}systemctl restart stellar-daemon${NC}"
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
    echo -e "${SECONDARY}  Thank you for using StellarStack!${NC}"
    echo -e "${MUTED}  Documentation: https://docs.stellarstack.app${NC}"
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

    # Step 2: Check for existing installation
    check_existing_installation

    # Check if we're in upgrade mode (keep existing config)
    if [ "$upgrade_mode" = "y" ]; then
        # Upgrade path - skip config collection
        run_upgrade
        show_upgrade_complete
        return
    fi

    # Full installation path
    # Step 3: Check dependencies
    check_dependencies

    # Step 4: Collect daemon configuration
    collect_daemon_config

    # Step 5: SSL configuration
    collect_ssl_config

    # Step 6: Redis configuration
    collect_redis_config

    # Step 7: Show summary and confirm
    show_summary

    # Step 8: Run installation
    run_installation

    # Step 9: Show completion
    show_complete
}

# Run
main
