#!/bin/bash

# StellarStack Panel & API Installer (Docker-based)
# https://github.com/MarquesCoding/StellarStack

set -e

# Enable debugging if DEBUG=1
if [ "${DEBUG:-0}" = "1" ]; then
    set -x
fi

# Error handler
error_handler() {
    local line_no=$1
    echo ""
    echo -e "${ERROR}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${ERROR}  ERROR: Script failed at line ${line_no}${NC}"
    echo -e "${ERROR}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${SECONDARY}  Please report this issue with the error details above.${NC}"
    echo -e "${SECONDARY}  GitHub: https://github.com/MarquesCoding/StellarStack/issues${NC}"
    echo ""
    exit 1
}

trap 'error_handler ${LINENO}' ERR

# Version info (auto-updated by release-please workflow)
INSTALLER_VERSION="1.1.2"
INSTALLER_DATE="2026-01-12 23:13:41 UTC"

# Colors
GREEN='\033[0;32m'
BRIGHT_GREEN='\033[1;32m'
DIM_GREEN='\033[2;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

PRIMARY="${BRIGHT_GREEN}"
SECONDARY="${GREEN}"
MUTED="${DIM_GREEN}"
ERROR="${RED}"
WARNING="${YELLOW}"

# Installation paths
INSTALL_DIR="/opt/stellarstack"
DOCKER_COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE="${INSTALL_DIR}/.env"
NGINX_CONF_DIR="/etc/nginx/sites-available"
NGINX_ENABLED_DIR="/etc/nginx/sites-enabled"

# Docker images
DOCKER_ORG="stellarstackoss"
API_IMAGE="${DOCKER_ORG}/stellarstack-api"
PANEL_IMAGE="${DOCKER_ORG}/stellarstack-web"

# Installation type
installation_type=""  # Options: panel_and_api, panel, api, daemon, all_in_one

# Configuration
panel_domain=""
api_domain=""
monitoring_domain=""
server_ip=""
install_monitoring="n"

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
DAEMON_INSTALL_DIR="/opt/stellar-daemon"
GITHUB_REPO="MarquesCoding/StellarStack"

# PostgreSQL configuration
postgres_user="stellarstack"
postgres_password=""
postgres_db="stellarstack"

# Upload limit configuration
upload_limit="100M"

# Dependency installation
install_docker="n"
install_nginx="n"
install_certbot="n"
install_git="n"
install_rust="n"

# Configuration reuse flags
skip_nginx_config="n"
skip_ssl_generation="n"

# Update mode
update_mode="n"

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

# Ask yes/no question
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
    local ip=""

    if command -v curl &> /dev/null; then
        ip=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null) || \
        ip=$(curl -s --max-time 5 https://ifconfig.me 2>/dev/null) || \
        ip=$(curl -s --max-time 5 https://icanhazip.com 2>/dev/null)
    fi

    if [ -z "$ip" ] && command -v wget &> /dev/null; then
        ip=$(wget -qO- --timeout=5 https://api.ipify.org 2>/dev/null)
    fi

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
    echo -e "${SECONDARY}  INTERFACE 2037 // STELLARSTACK INC // DOCKER INSTALLER // v${INSTALLER_VERSION} (${INSTALLER_DATE})${NC}"
    echo -e "${MUTED}  ════════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Show welcome screen
show_welcome() {
    clear_screen
    echo -e "${PRIMARY}  > INITIALIZATION SEQUENCE${NC}"
    echo ""
    echo -e "${SECONDARY}  This installer will set up StellarStack Panel and API using Docker.${NC}"
    echo -e "${SECONDARY}  Fast deployment with pre-built images and optional monitoring stack.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  SYSTEM REQUIREMENTS:${NC}"
    echo -e "${SECONDARY}    > Ubuntu 20.04+ / Debian 11+ / RHEL 8+${NC}"
    echo -e "${SECONDARY}    > 2GB RAM minimum (4GB+ recommended)${NC}"
    echo -e "${SECONDARY}    > 20GB disk space${NC}"
    echo -e "${SECONDARY}    > Docker & Docker Compose${NC}"
    echo -e "${SECONDARY}    > nginx (for reverse proxy)${NC}"
    echo ""
    wait_for_enter
}

# Select installation type
select_installation_type() {
    clear_screen
    echo -e "${PRIMARY}  > INSTALLATION TYPE${NC}"
    echo ""
    echo -e "${SECONDARY}  Select which components to install:${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  [1]${NC} ${SECONDARY}Install Panel + API${NC}"
    echo -e "${MUTED}      Complete StellarStack control panel with backend${NC}"
    echo ""
    echo -e "${PRIMARY}  [2]${NC} ${SECONDARY}Install Panel${NC}"
    echo -e "${MUTED}      Control panel only${NC}"
    echo ""
    echo -e "${PRIMARY}  [3]${NC} ${SECONDARY}Install API${NC}"
    echo -e "${MUTED}      Backend API only${NC}"
    echo ""
    echo -e "${PRIMARY}  [4]${NC} ${SECONDARY}Install Daemon${NC}"
    echo -e "${MUTED}      Game server management daemon (node)${NC}"
    echo ""
    echo -e "${PRIMARY}  [5]${NC} ${SECONDARY}Install All-in-One ${MUTED}(Panel + API + Daemon)${NC}"
    echo -e "${MUTED}      Complete installation with game server support${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    while true; do
        echo -ne "  ${SECONDARY}Enter your choice [1-5]:${NC} "
        read -r choice </dev/tty

        case $choice in
            1)
                installation_type="panel_and_api"
                print_success "Selected: Panel + API"
                break
                ;;
            2)
                installation_type="panel"
                print_success "Selected: Panel"
                break
                ;;
            3)
                installation_type="api"
                print_success "Selected: API"
                break
                ;;
            4)
                installation_type="daemon"
                print_success "Selected: Daemon"
                break
                ;;
            5)
                installation_type="all_in_one"
                print_success "Selected: All-in-One (Panel + API + Daemon)"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 1, 2, 3, 4, or 5."
                echo ""
                ;;
        esac
    done

    echo ""
    # Only ask about monitoring for panel/api installations
    if [[ "$installation_type" != "daemon" ]]; then
        if ask_yes_no "Install monitoring stack (Prometheus, Loki, Grafana)?" "y"; then
            install_monitoring="y"
            print_success "Monitoring stack will be installed"
        else
            print_info "Monitoring stack will not be installed"
        fi
    fi

    # For all-in-one, set daemon panel URL automatically
    if [[ "$installation_type" == "all_in_one" ]]; then
        print_info "Daemon will be configured to connect to local API"
    fi

    wait_for_enter
}

# Check for existing installation
check_existing_installation() {
    clear_screen
    echo -e "${PRIMARY}  > EXISTING INSTALLATION CHECK${NC}"
    echo ""

    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        update_mode="y"
        print_warning "Existing installation found at ${INSTALL_DIR}"
        print_info "System will be updated to latest version"
    else
        print_success "No existing installation detected"
        print_info "Proceeding with fresh installation"
    fi

    echo ""
    wait_for_enter
}

# Check dependencies
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

        # Create Docker networks for StellarStack
        # 1. stellar_network - for Docker Compose services (panel, API, database)
        if ! docker network ls | grep -q "stellar_network"; then
          print_task "Creating Docker network 'stellar_network' for services"
          docker network create stellar_network
          print_task_done "Creating Docker network 'stellar_network'"
        else
          print_success "Docker network 'stellar_network' already exists"
        fi

        # 2. stellar - for game server containers (daemon-managed)
        if ! docker network ls | grep -qw "stellar"; then
          print_task "Creating Docker network 'stellar' for game servers"
          docker network create stellar --subnet=172.18.0.0/16 --gateway=172.18.0.1
          print_task_done "Creating Docker network 'stellar'"
        else
          print_success "Docker network 'stellar' already exists"
        fi


        # Check if Docker is running
        if ! docker ps &> /dev/null; then
            print_warning "Docker is installed but not running"
            echo ""
            echo -e "${SECONDARY}  What would you like to do?${NC}"
            echo -e "    ${PRIMARY}[1]${NC} Start Docker and continue"
            echo -e "    ${PRIMARY}[2]${NC} Reinstall Docker"
            echo -e "    ${PRIMARY}[3]${NC} Exit and fix manually"
            echo ""
            echo -ne "  ${SECONDARY}Enter your choice [1-3]:${NC} "
            read -r docker_choice </dev/tty

            case $docker_choice in
                1)
                    print_task "Starting Docker"
                    systemctl start docker
                    systemctl enable docker
                    sleep 2
                    if docker ps &> /dev/null; then
                        print_task_done "Starting Docker"
                    else
                        echo ""
                        print_error "Failed to start Docker"
                        exit 1
                    fi
                    ;;
                2)
                    install_docker="y"
                    print_info "Docker will be reinstalled"
                    ;;
                3)
                    print_info "Please start Docker manually: systemctl start docker"
                    exit 0
                    ;;
                *)
                    print_error "Invalid choice"
                    exit 1
                    ;;
            esac
        fi
    else
        print_warning "Docker is NOT installed"
        echo ""
        echo -e "${SECONDARY}  Docker is required to run containers.${NC}"
        if ask_yes_no "Install Docker?" "y"; then
            install_docker="y"
            print_info "Docker will be installed"
        else
            print_error "Docker is required. Cannot continue."
            exit 1
        fi
    fi
    echo ""

    # Check Docker Compose
    if docker compose version &> /dev/null 2>&1; then
        print_success "Docker Compose is installed"
    elif command -v docker-compose &> /dev/null; then
        print_success "Docker Compose (standalone) is installed"
    else
        print_warning "Docker Compose is NOT installed"
        echo ""
        if [ "$install_docker" = "y" ]; then
            print_info "Docker Compose will be installed with Docker"
        else
            print_error "Docker Compose is required but not found"
            exit 1
        fi
    fi
    echo ""

    # Check nginx
    if command -v nginx &> /dev/null; then
        print_success "nginx is installed"

        # Check if there are existing StellarStack configs
        if ls /etc/nginx/sites-available/stellarstack-* &> /dev/null 2>&1; then
            print_warning "Found existing StellarStack nginx configurations"
            echo ""
            echo -e "${SECONDARY}  What would you like to do?${NC}"
            echo -e "    ${PRIMARY}[1]${NC} Keep existing nginx configs (use for updates)"
            echo -e "    ${PRIMARY}[2]${NC} Overwrite with new configs"
            echo -e "    ${PRIMARY}[3]${NC} Remove all StellarStack configs and start fresh"
            echo ""
            echo -ne "  ${SECONDARY}Enter your choice [1-3]:${NC} "
            read -r nginx_choice </dev/tty

            case $nginx_choice in
                1)
                    skip_nginx_config="y"
                    print_info "Existing nginx configurations will be preserved"
                    ;;
                2)
                    skip_nginx_config="n"
                    # Clear domain variables so they won't be extracted from old nginx configs
                    panel_domain=""
                    api_domain=""
                    monitoring_domain=""
                    daemon_ssl_domain=""
                    print_info "nginx configurations will be overwritten"
                    ;;
                3)
                    skip_nginx_config="n"
                    # Clear domain variables for fresh start
                    panel_domain=""
                    api_domain=""
                    monitoring_domain=""
                    daemon_ssl_domain=""
                    print_task "Removing existing StellarStack nginx configs"
                    rm -f /etc/nginx/sites-available/stellarstack-* 2>/dev/null || true
                    rm -f /etc/nginx/sites-enabled/stellarstack-* 2>/dev/null || true
                    print_task_done "Removing existing StellarStack nginx configs"
                    ;;
                *)
                    print_error "Invalid choice"
                    exit 1
                    ;;
            esac
            echo ""
        fi

        # Check if nginx is running
        if ! systemctl is-active --quiet nginx; then
            print_warning "nginx is installed but not running"
            if ask_yes_no "Start nginx now?" "y"; then
                print_task "Starting nginx"
                systemctl start nginx
                systemctl enable nginx
                print_task_done "Starting nginx"
            fi
        fi
    else
        print_warning "nginx is NOT installed"
        echo ""
        echo -e "${SECONDARY}  nginx is required as reverse proxy.${NC}"
        if ask_yes_no "Install nginx?" "y"; then
            install_nginx="y"
            print_info "nginx will be installed"
        else
            print_error "nginx is required. Cannot continue."
            exit 1
        fi
    fi
    echo ""

    # Check Git (for daemon installation)
    if [[ "$installation_type" == "daemon" || "$installation_type" == "all_in_one" ]]; then
        if command -v git &> /dev/null; then
            print_success "Git is installed"
        else
            print_warning "Git is NOT installed"
            echo ""
            echo -e "${SECONDARY}  Git is required to clone the repository for daemon.${NC}"
            if ask_yes_no "Install Git?" "y"; then
                install_git="y"
                print_info "Git will be installed"
            else
                print_error "Git is required. Cannot continue."
                exit 1
            fi
        fi
        echo ""

        # Check Rust/Cargo (for daemon installation)
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
    fi

    # Check Certbot
    if command -v certbot &> /dev/null; then
        print_success "Certbot is installed"

        # Check for existing certificates for our domains
        local existing_certs=""
        if [ -n "$panel_domain" ] && [ -d "/etc/letsencrypt/live/${panel_domain}" ]; then
            existing_certs="${existing_certs}Panel (${panel_domain}), "
        fi
        if [ -n "$api_domain" ] && [ -d "/etc/letsencrypt/live/${api_domain}" ]; then
            existing_certs="${existing_certs}API (${api_domain}), "
        fi
        if [ -n "$monitoring_domain" ] && [ -d "/etc/letsencrypt/live/${monitoring_domain}" ]; then
            existing_certs="${existing_certs}Monitoring (${monitoring_domain}), "
        fi

        if [ -n "$existing_certs" ]; then
            existing_certs=${existing_certs%, }  # Remove trailing comma
            print_info "Found existing SSL certificates: ${existing_certs}"
            echo ""
            if ask_yes_no "Renew/reuse existing certificates?" "y"; then
                skip_ssl_generation="y"
                print_info "Existing certificates will be reused"
            else
                print_info "New certificates will be generated"
            fi
            echo ""
        fi
    else
        print_warning "Certbot is NOT installed"
        echo ""
        echo -e "${SECONDARY}  Certbot is required for SSL certificates.${NC}"
        if ask_yes_no "Install Certbot?" "y"; then
            install_certbot="y"
            print_info "Certbot will be installed"
        else
            print_warning "Proceeding without Certbot (SSL will be unavailable)"
        fi
    fi

    echo ""
    wait_for_enter
}

# Collect domain configuration
collect_domain_config() {
    clear_screen
    echo -e "${PRIMARY}  > DOMAIN CONFIGURATION${NC}"
    echo ""
    echo -e "${SECONDARY}  Configure domains and SSL certificates.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Check for existing certificates and extract domains
    local found_existing_certs=false

    # First, try to extract domains from existing .env file (only if keeping existing configs)
    echo ""
    print_info "Checking for existing .env file at: ${ENV_FILE}"
    if [ -f "${ENV_FILE}" ]; then
        print_info "  ✓ .env file exists"
        print_info "  skip_nginx_config value: '${skip_nginx_config}'"
        
        if [ "$skip_nginx_config" = "y" ]; then
            print_info "  → Will extract domains from .env and nginx configs"
        else
            print_info "  → Skipping domain extraction (user chose to reconfigure)"
        fi
    else
        print_info "  ✗ .env file does not exist (fresh installation)"
    fi
    echo ""

    if [ -f "${ENV_FILE}" ] && [ "$skip_nginx_config" = "y" ]; then
        echo -e "${SECONDARY}  Extracting existing domains from .env file...${NC}"
        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
            # Extract panel domain from FRONTEND_URL, removing quotes and whitespace
            local extracted_panel=$(grep "^FRONTEND_URL=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | tr -d '"' | xargs | sed 's|https\?://||' | sed 's|/.*||')
            print_info "  Panel: grep result: '$(grep "^FRONTEND_URL=" "${ENV_FILE}" 2>/dev/null)'"
            print_info "  Panel: extracted: '${extracted_panel}'"
            if [ -n "$extracted_panel" ]; then
                panel_domain="$extracted_panel"
                print_info "  Panel domain SET: ${panel_domain}"
                if [ -d "/etc/letsencrypt/live/${extracted_panel}" ]; then
                    found_existing_certs=true
                fi
            else
                print_info "  Panel domain NOT found in .env"
            fi
        fi

        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
            # Extract API domain from API_URL, removing quotes and whitespace
            local extracted_api=$(grep "^API_URL=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | tr -d '"' | xargs | sed 's|https\?://||' | sed 's|/.*||')
            print_info "  API: grep result: '$(grep "^API_URL=" "${ENV_FILE}" 2>/dev/null)'"
            print_info "  API: extracted: '${extracted_api}'"
            if [ -n "$extracted_api" ]; then
                api_domain="$extracted_api"
                print_info "  API domain SET: ${api_domain}"
                if [ -d "/etc/letsencrypt/live/${extracted_api}" ]; then
                    found_existing_certs=true
                fi
            else
                print_info "  API domain NOT found in .env"
            fi
        fi

        if [ "$install_monitoring" = "y" ]; then
            # Extract monitoring domain from MONITORING_DOMAIN, removing quotes and whitespace
            local extracted_monitoring=$(grep "^MONITORING_DOMAIN=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | tr -d '"' | xargs)
            print_info "  Monitoring: grep result: '$(grep "^MONITORING_DOMAIN=" "${ENV_FILE}" 2>/dev/null)'"
            print_info "  Monitoring: extracted: '${extracted_monitoring}'"
            if [ -n "$extracted_monitoring" ]; then
                monitoring_domain="$extracted_monitoring"
                print_info "  Monitoring domain SET: ${monitoring_domain}"
                if [ -d "/etc/letsencrypt/live/${extracted_monitoring}" ]; then
                    found_existing_certs=true
                fi
            else
                print_info "  Monitoring domain NOT found in .env"
            fi
        fi
        echo ""
    elif [ -f "${ENV_FILE}" ]; then
        print_info "Existing .env found but not extracting (user chose to overwrite configs)"
        echo ""
    fi

    # If domains not found in .env, try nginx config files (only if keeping existing configs)
    if [ "$skip_nginx_config" = "y" ]; then
        if [ -z "$panel_domain" ] && [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
            if [ -f "${NGINX_CONF_DIR}/stellarstack-panel" ]; then
                panel_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-panel" | head -1 | awk '{print $2}' | sed 's/;//')
                if [ -n "$panel_domain" ]; then
                    print_info "Detected existing panel domain from nginx: ${panel_domain}"
                    if [ -d "/etc/letsencrypt/live/${panel_domain}" ]; then
                        found_existing_certs=true
                    fi
                fi
            fi
        fi

        if [ -z "$api_domain" ] && [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
            if [ -f "${NGINX_CONF_DIR}/stellarstack-api" ]; then
                api_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-api" | head -1 | awk '{print $2}' | sed 's/;//')
                if [ -n "$api_domain" ]; then
                    print_info "Detected existing API domain from nginx: ${api_domain}"
                    if [ -d "/etc/letsencrypt/live/${api_domain}" ]; then
                        found_existing_certs=true
                    fi
                fi
            fi
        fi

        if [ -z "$monitoring_domain" ] && [ "$install_monitoring" = "y" ]; then
            if [ -f "${NGINX_CONF_DIR}/stellarstack-monitoring" ]; then
                monitoring_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-monitoring" | head -1 | awk '{print $2}' | sed 's/;//')
                if [ -n "$monitoring_domain" ]; then
                    print_info "Detected existing monitoring domain from nginx: ${monitoring_domain}"
                    if [ -d "/etc/letsencrypt/live/${monitoring_domain}" ]; then
                        found_existing_certs=true
                    fi
                fi
            fi
        fi

        # Check for daemon domain if all-in-one
        if [ -z "$daemon_ssl_domain" ] && [[ "$installation_type" == "all_in_one" || "$installation_type" == "daemon" ]]; then
            if [ -f "${NGINX_CONF_DIR}/stellarstack-daemon" ]; then
                daemon_ssl_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-daemon" | head -1 | awk '{print $2}' | sed 's/;//')
                if [ -n "$daemon_ssl_domain" ]; then
                    print_info "Detected existing daemon domain from nginx: ${daemon_ssl_domain}"
                    if [ -d "/etc/letsencrypt/live/${daemon_ssl_domain}" ]; then
                        found_existing_certs=true
                    fi
                fi
            fi
        fi
    fi

    # If we found existing certs and have all required domains, skip domain input
    if [ "$found_existing_certs" = true ]; then
        local all_domains_found=true

        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]] && [ -z "$panel_domain" ]; then
            all_domains_found=false
        fi

        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]] && [ -z "$api_domain" ]; then
            all_domains_found=false
        fi

        if [ "$install_monitoring" = "y" ] && [ -z "$monitoring_domain" ]; then
            all_domains_found=false
        fi

        if [[ "$installation_type" == "all_in_one" ]] && [ -z "$daemon_ssl_domain" ]; then
            all_domains_found=false
        fi

        if [ "$all_domains_found" = true ]; then
            echo ""
            print_success "Using existing certificates and domains"
            echo ""
            echo -e "${SECONDARY}  Detected domains:${NC}"
            if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
                echo -e "    ${PRIMARY}Panel:${NC}          ${panel_domain}"
            fi
            if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
                echo -e "    ${PRIMARY}API:${NC}            ${api_domain}"
            fi
            if [ "$install_monitoring" = "y" ]; then
                echo -e "    ${PRIMARY}Monitoring:${NC}      ${monitoring_domain}"
            fi
            if [[ "$installation_type" == "all_in_one" ]]; then
                echo -e "    ${PRIMARY}Daemon:${NC}          ${daemon_ssl_domain}"
            fi
            echo ""
            skip_ssl_generation="y"
            
            # For all-in-one, set daemon_panel_url so daemon knows how to connect to API
            if [[ "$installation_type" == "all_in_one" ]]; then
                daemon_panel_url="https://${api_domain}"
                echo -e "${SECONDARY}  Daemon will connect to API at:${NC} ${daemon_panel_url}"
                echo ""
            fi
            
            echo ""
            wait_for_enter
            return
        fi
    fi

    # Display summary of partially detected domains (if some but not all found)
    local has_detected_domains=false
    if [ -n "$panel_domain" ] || [ -n "$api_domain" ] || [ -n "$monitoring_domain" ] || [ -n "$daemon_ssl_domain" ]; then
        has_detected_domains=true
        echo ""
        echo -e "${SECONDARY}  Detected domains:${NC}"
        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
            if [ -n "$panel_domain" ]; then
                echo -e "    ${PRIMARY}Panel:${NC}          ${panel_domain}"
            else
                echo -e "    ${MUTED}Panel:${NC}          (not detected, will be configured)"
            fi
        fi
        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
            if [ -n "$api_domain" ]; then
                echo -e "    ${PRIMARY}API:${NC}            ${api_domain}"
            else
                echo -e "    ${MUTED}API:${NC}            (not detected, will be configured)"
            fi
        fi
        if [ "$install_monitoring" = "y" ]; then
            if [ -n "$monitoring_domain" ]; then
                echo -e "    ${PRIMARY}Monitoring:${NC}      ${monitoring_domain}"
            else
                echo -e "    ${MUTED}Monitoring:${NC}      (not detected, will be configured)"
            fi
        fi
        if [[ "$installation_type" == "all_in_one" ]]; then
            if [ -n "$daemon_ssl_domain" ]; then
                echo -e "    ${PRIMARY}Daemon:${NC}          ${daemon_ssl_domain}"
            else
                echo -e "    ${MUTED}Daemon:${NC}          (not detected, will be configured)"
            fi
        fi
        echo ""
    fi

    # Get server IP
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
            print_error "Server IP is required for domain verification"
            exit 1
        fi
        echo ""
    fi

    # Collect Panel domain if installing Panel
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  PANEL CONFIGURATION:${NC}"
        echo ""
        local panel_domain_verified=false
        while [ "$panel_domain_verified" = false ]; do
            echo -e "${SECONDARY}  Panel Domain ${MUTED}(e.g., panel.example.com)${NC}"
            echo -ne "  ${PRIMARY}>${NC} "
            read -r panel_domain </dev/tty

            if [ -z "$panel_domain" ]; then
                print_error "Panel domain is required"
                echo ""
                continue
            fi

            echo ""
            echo -e "${SECONDARY}  Please create the following DNS record:${NC}"
            echo ""
            echo -e "    ${PRIMARY}Type:${NC}   A"
            echo -e "    ${PRIMARY}Name:${NC}   ${panel_domain}"
            echo -e "    ${PRIMARY}Value:${NC}  ${server_ip}"
            echo -e "    ${PRIMARY}TTL:${NC}    Auto / 3600"
            echo ""
            echo -e "${MUTED}  Example for Cloudflare/most DNS providers:${NC}"
            echo -e "    ${MUTED}A | ${panel_domain} | ${server_ip}${NC}"
            echo ""

            if ask_yes_no "Have you created the DNS record?" "n"; then
                echo ""
                print_task "Verifying DNS for ${panel_domain}"
                sleep 2

                local dns_result
                dns_result=$(verify_domain_dns "$panel_domain" "$server_ip")
                local dns_status=$?

                if [ "$dns_result" = "unable_to_resolve" ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}Could not resolve ${panel_domain}${NC}    "
                    echo ""
                    print_error "The domain could not be resolved. Please check:"
                    echo -e "    ${MUTED}- DNS record exists for this domain${NC}"
                    echo -e "    ${MUTED}- DNS has propagated (may take 5-15 minutes)${NC}"
                    echo ""
                    if ! ask_yes_no "Try verifying again?" "y"; then
                        if ask_yes_no "Skip verification and continue anyway?" "n"; then
                            print_warning "Skipping DNS verification - SSL certificate generation may fail"
                            panel_domain_verified=true
                        fi
                    fi
                elif [ $dns_status -ne 0 ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}DNS mismatch for ${panel_domain}${NC}    "
                    echo ""
                    print_error "Domain resolves to: ${dns_result}"
                    print_error "Expected (this server): ${server_ip}"
                    echo ""
                    if ! ask_yes_no "Try a different domain?" "y"; then
                        if ask_yes_no "Skip verification and continue anyway?" "n"; then
                            print_warning "Skipping DNS verification - SSL certificate generation may fail"
                            panel_domain_verified=true
                        fi
                    fi
                else
                    print_task_done "Verifying DNS for ${panel_domain}"
                    print_success "Domain ${panel_domain} correctly points to ${server_ip}"
                    panel_domain_verified=true
                fi
            else
                echo ""
                if ask_yes_no "Try a different domain?" "y"; then
                    continue
                else
                    print_error "Panel domain is required"
                    exit 1
                fi
            fi
        done
        echo ""
    fi

    # Collect API domain if installing API
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  API CONFIGURATION:${NC}"
        echo ""
        local api_domain_verified=false
        while [ "$api_domain_verified" = false ]; do
            echo -e "${SECONDARY}  API Domain ${MUTED}(e.g., api.example.com)${NC}"
            echo -ne "  ${PRIMARY}>${NC} "
            read -r api_domain </dev/tty

            if [ -z "$api_domain" ]; then
                print_error "API domain is required"
                echo ""
                continue
            fi

            echo ""
            echo -e "${SECONDARY}  Please create the following DNS record:${NC}"
            echo ""
            echo -e "    ${PRIMARY}Type:${NC}   A"
            echo -e "    ${PRIMARY}Name:${NC}   ${api_domain}"
            echo -e "    ${PRIMARY}Value:${NC}  ${server_ip}"
            echo -e "    ${PRIMARY}TTL:${NC}    Auto / 3600"
            echo ""
            echo -e "${MUTED}  Example for Cloudflare/most DNS providers:${NC}"
            echo -e "    ${MUTED}A | ${api_domain} | ${server_ip}${NC}"
            echo ""

            if ask_yes_no "Have you created the DNS record?" "n"; then
                echo ""
                print_task "Verifying DNS for ${api_domain}"
                sleep 2

                local dns_result
                dns_result=$(verify_domain_dns "$api_domain" "$server_ip")
                local dns_status=$?

                if [ "$dns_result" = "unable_to_resolve" ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}Could not resolve ${api_domain}${NC}    "
                    echo ""
                    print_error "The domain could not be resolved. Please check:"
                    echo -e "    ${MUTED}- DNS record exists for this domain${NC}"
                    echo -e "    ${MUTED}- DNS has propagated (may take 5-15 minutes)${NC}"
                    echo ""
                    if ! ask_yes_no "Try verifying again?" "y"; then
                        if ask_yes_no "Skip verification and continue anyway?" "n"; then
                            print_warning "Skipping DNS verification - SSL certificate generation may fail"
                            api_domain_verified=true
                        fi
                    fi
                elif [ $dns_status -ne 0 ]; then
                    echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}DNS mismatch for ${api_domain}${NC}    "
                    echo ""
                    print_error "Domain resolves to: ${dns_result}"
                    print_error "Expected (this server): ${server_ip}"
                    echo ""
                    if ! ask_yes_no "Try a different domain?" "y"; then
                        if ask_yes_no "Skip verification and continue anyway?" "n"; then
                            print_warning "Skipping DNS verification - SSL certificate generation may fail"
                            api_domain_verified=true
                        fi
                    fi
                else
                    print_task_done "Verifying DNS for ${api_domain}"
                    print_success "Domain ${api_domain} correctly points to ${server_ip}"
                    api_domain_verified=true
                fi
            else
                echo ""
                if ask_yes_no "Try a different domain?" "y"; then
                    continue
                else
                    print_error "API domain is required"
                    exit 1
                fi
            fi
        done
        echo ""
    fi

    # Collect monitoring domain if monitoring is enabled
    if [ "$install_monitoring" = "y" ]; then
        echo -e "${PRIMARY}  MONITORING CONFIGURATION:${NC}"
        echo ""
        local monitoring_domain_verified=false
        while [ "$monitoring_domain_verified" = false ]; do
            echo -e "${SECONDARY}  Monitoring Domain ${MUTED}(e.g., monitoring.example.com)${NC}"
            echo -ne "  ${PRIMARY}>${NC} "
            read -r monitoring_domain </dev/tty

            if [ -z "$monitoring_domain" ]; then
                print_error "Monitoring domain is required"
                echo ""
                continue
            fi

            echo ""
            echo -e "${SECONDARY}  Please create the following DNS record:${NC}"
            echo ""
            echo -e "    ${PRIMARY}Type:${NC}   A"
            echo -e "    ${PRIMARY}Name:${NC}   ${monitoring_domain}"
            echo -e "    ${PRIMARY}Value:${NC}  ${server_ip}"
            echo -e "    ${PRIMARY}TTL:${NC}    Auto / 3600"
            echo ""

            if ask_yes_no "Have you created the DNS record?" "n"; then
                echo ""
                print_task "Verifying DNS for ${monitoring_domain}"
                sleep 2

                local dns_result
                dns_result=$(verify_domain_dns "$monitoring_domain" "$server_ip")
                local dns_status=$?

                if [ "$dns_result" = "unable_to_resolve" ] || [ $dns_status -ne 0 ]; then
                    echo -e "\r  ${WARNING}[!]${NC} ${WARNING}DNS verification failed${NC}    "
                    if ask_yes_no "Skip verification and continue anyway?" "n"; then
                        print_warning "Skipping DNS verification for monitoring domain"
                        monitoring_domain_verified=true
                    fi
                else
                    print_task_done "Verifying DNS for ${monitoring_domain}"
                    print_success "Domain ${monitoring_domain} correctly points to ${server_ip}"
                    monitoring_domain_verified=true
                fi
            else
                echo ""
                if ask_yes_no "Try a different domain?" "y"; then
                    continue
                else
                    print_error "Monitoring domain is required"
                    exit 1
                fi
            fi
        done
    fi

    # Collect daemon domain if all-in-one installation
    if [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  DAEMON CONFIGURATION:${NC}"
        echo ""
        local daemon_domain_verified=false
        while [ "$daemon_domain_verified" = false ]; do
            echo -e "${SECONDARY}  Daemon Domain ${MUTED}(e.g., node.example.com)${NC}"
            echo -ne "  ${PRIMARY}>${NC} "
            read -r daemon_ssl_domain </dev/tty

            if [ -z "$daemon_ssl_domain" ]; then
                print_error "Daemon domain is required"
                echo ""
                continue
            fi

            echo ""
            echo -e "${SECONDARY}  Please create the following DNS record:${NC}"
            echo ""
            echo -e "    ${PRIMARY}Type:${NC}   A"
            echo -e "    ${PRIMARY}Name:${NC}   ${daemon_ssl_domain}"
            echo -e "    ${PRIMARY}Value:${NC}  ${server_ip}"
            echo -e "    ${PRIMARY}TTL:${NC}    Auto / 3600"
            echo ""

            if ask_yes_no "Have you created the DNS record?" "n"; then
                echo ""
                print_task "Verifying DNS for ${daemon_ssl_domain}"
                sleep 2

                local dns_result
                dns_result=$(verify_domain_dns "$daemon_ssl_domain" "$server_ip")
                local dns_status=$?

                if [ "$dns_result" = "unable_to_resolve" ] || [ $dns_status -ne 0 ]; then
                    echo -e "\r  ${WARNING}[!]${NC} ${WARNING}DNS verification failed${NC}    "
                    if ask_yes_no "Skip verification and continue anyway?" "n"; then
                        print_warning "Skipping DNS verification for daemon domain"
                        daemon_domain_verified=true
                    fi
                else
                    print_task_done "Verifying DNS for ${daemon_ssl_domain}"
                    print_success "Domain ${daemon_ssl_domain} correctly points to ${server_ip}"
                    daemon_domain_verified=true
                fi
            else
                echo ""
                if ask_yes_no "Try a different domain?" "y"; then
                    continue
                else
                    print_error "Daemon domain is required"
                    exit 1
                fi
            fi
        done

        # Set daemon configuration for all-in-one
        daemon_enable_ssl="y"
        daemon_panel_url="https://${api_domain}"
        echo ""
        print_info "Daemon will connect to API at: ${daemon_panel_url}"
        echo ""

        # Daemon ports
        echo -e "${SECONDARY}  Daemon API Port ${MUTED}[default: 8080]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r input_port </dev/tty
        if [ -n "$input_port" ]; then
            daemon_port="$input_port"
        fi
        echo ""

        echo -e "${SECONDARY}  SFTP Port ${MUTED}[default: 2022]${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r input_sftp </dev/tty
        if [ -n "$input_sftp" ]; then
            daemon_sftp_port="$input_sftp"
        fi
        echo ""
    fi

    # Confirm all domains
    confirm_domains_config

    wait_for_enter
}

# Confirm all configured domains
confirm_domains_config() {
    clear_screen
    echo -e "${PRIMARY}  > DOMAIN CONFIRMATION${NC}"
    echo ""
    echo -e "${SECONDARY}  Please review your domain configuration:${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Show Panel domain
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  Panel:${NC}"
        echo -e "    ${SECONDARY}Domain:${NC} ${panel_domain}"
        echo ""
    fi

    # Show API domain
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  API:${NC}"
        echo -e "    ${SECONDARY}Domain:${NC} ${api_domain}"
        echo ""
    fi

    # Show Daemon/Node domain
    if [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  Node (Daemon):${NC}"
        echo -e "    ${SECONDARY}Domain:${NC} ${daemon_ssl_domain}"
        echo -e "    ${SECONDARY}API Port:${NC} ${daemon_port}"
        echo -e "    ${SECONDARY}SFTP Port:${NC} ${daemon_sftp_port}"
        echo ""
    fi

    # Show Monitoring domain
    if [ "$install_monitoring" = "y" ]; then
        echo -e "${PRIMARY}  Monitoring:${NC}"
        echo -e "    ${SECONDARY}Domain:${NC} ${monitoring_domain}"
        echo ""
    fi

    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if ask_yes_no "Are these domain configurations correct?" "y"; then
        print_success "Domain configuration confirmed"
        echo ""
    else
        print_error "Please reconfigure your domains"
        echo ""
        exit 1
    fi
}

# Collect daemon configuration
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
    echo ""

    # SSL Configuration
    if ask_yes_no "Enable SSL with Certbot?" "n"; then
        daemon_enable_ssl="y"
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

            if [ "$dns_result" = "unable_to_resolve" ] || [ $dns_status -ne 0 ]; then
                echo -e "\r  ${WARNING}[!]${NC} ${WARNING}DNS verification failed${NC}    "
                if ask_yes_no "Skip verification and continue anyway?" "n"; then
                    print_warning "Proceeding without DNS verification"
                    domain_verified=true
                fi
            else
                print_task_done "Verifying DNS for ${daemon_ssl_domain}"
                print_success "Domain ${daemon_ssl_domain} correctly points to ${server_ip}"
                domain_verified=true
            fi
        done
    else
        print_info "SSL will be disabled"
    fi
    echo ""

    # Redis Configuration
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

# Collect upload limit configuration
collect_upload_limit_config() {
    clear_screen
    echo -e "${PRIMARY}  > UPLOAD SIZE LIMIT${NC}"
    echo ""
    echo -e "${SECONDARY}  Configure the maximum file upload size.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Check for existing upload limit configuration
    local existing_limit=""
    if [ -f "${ENV_FILE}" ]; then
        existing_limit=$(grep "^UPLOAD_LIMIT=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | tr -d '"' | xargs)
    fi

    # If no limit in .env, try to extract from nginx config
    if [ -z "$existing_limit" ] && [ -f "${NGINX_CONF_DIR}/stellarstack-panel" ]; then
        existing_limit=$(grep "client_max_body_size" "${NGINX_CONF_DIR}/stellarstack-panel" | grep -oP '\d+[kKmMgG]?' | head -1)
    fi

    # If we found existing limit, use it
    if [ -n "$existing_limit" ]; then
        upload_limit="$existing_limit"
        echo ""
        print_success "Using existing upload limit: ${upload_limit}"
        echo ""
        wait_for_enter
        return
    fi

    echo -e "${SECONDARY}  Upload size limit ${MUTED}[default: 100M]${NC}"
    echo -e "${MUTED}  Valid formats: 50M, 100M, 500M, 1G, 2G, 1024k, 52428800${NC}"
    echo ""

    local limit_valid=false
    while [ "$limit_valid" = false ]; do
        echo -ne "  ${PRIMARY}>${NC} "
        read -r input_upload_limit </dev/tty

        if [ -z "$input_upload_limit" ]; then
            print_success "Using default: ${upload_limit}"
            limit_valid=true
            continue
        fi

        # Validate format: number followed by optional k/K, m/M, g/G, or just a number
        if [[ "$input_upload_limit" =~ ^[0-9]+[kKmMgG]?$ ]]; then
            upload_limit="$input_upload_limit"
            print_success "Upload limit set to: ${upload_limit}"
            limit_valid=true
        else
            print_error "Invalid format: '$input_upload_limit'"
            echo ""
            echo -e "${SECONDARY}  Please enter a valid size (e.g., 50M, 1G, 500k, or 52428800)${NC}"
            echo ""
        fi
    done

    echo ""
    wait_for_enter
}

# Collect admin credentials
collect_admin_credentials() {
    clear_screen
    echo -e "${PRIMARY}  > ADMIN ACCOUNT SETUP${NC}"
    echo ""
    echo -e "${SECONDARY}  Create the initial administrator account.${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Admin Email
    local email_valid=false
    while [ "$email_valid" = false ]; do
        echo -e "${SECONDARY}  Admin Email Address:${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -r admin_email </dev/tty

        if [ -z "$admin_email" ]; then
            print_error "Email address is required"
            echo ""
            continue
        fi

        # Basic email validation
        if [[ ! "$admin_email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
            print_error "Invalid email format"
            echo ""
            continue
        fi

        email_valid=true
    done

    echo ""

    # Admin Password
    local password_valid=false
    while [ "$password_valid" = false ]; do
        echo -e "${SECONDARY}  Admin Password ${MUTED}(minimum 8 characters)${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -s -r admin_password </dev/tty
        echo ""

        if [ -z "$admin_password" ]; then
            print_error "Password is required"
            echo ""
            continue
        fi

        if [ ${#admin_password} -lt 8 ]; then
            print_error "Password must be at least 8 characters"
            echo ""
            continue
        fi

        echo ""
        echo -e "${SECONDARY}  Confirm Password:${NC}"
        echo -ne "  ${PRIMARY}>${NC} "
        read -s -r admin_password_confirm </dev/tty
        echo ""

        if [ "$admin_password" != "$admin_password_confirm" ]; then
            print_error "Passwords do not match"
            echo ""
            continue
        fi

        password_valid=true
    done

    echo ""
    print_success "Admin account configured"
    print_info "Email: ${admin_email}"
    echo ""

    wait_for_enter
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
        usermod -aG docker $USER 2>/dev/null || true
        print_task_done "Installing Docker"

        # Verify Docker is working
        print_task "Verifying Docker installation"
        if ! docker ps > /dev/null 2>&1; then
            echo ""
            echo -e "${ERROR}Docker was installed but is not responding${NC}"
            echo -e "${WARNING}Try running: systemctl restart docker${NC}"
            exit 1
        fi
        print_task_done "Verifying Docker installation"
    else
        print_success "Docker already installed"

        # Verify Docker is working
        print_task "Verifying Docker is running"
        if ! docker ps > /dev/null 2>&1; then
            echo ""
            echo -e "${ERROR}Docker is installed but not responding${NC}"
            echo -e "${WARNING}Try running: systemctl start docker${NC}"
            exit 1
        fi
        print_task_done "Verifying Docker is running"
    fi

    # Install nginx
    if [ "$install_nginx" = "y" ]; then
        print_task "Installing nginx"
        if command -v apt-get &> /dev/null; then
            apt-get update -qq && apt-get install -y nginx > /dev/null 2>&1
        elif command -v dnf &> /dev/null; then
            dnf install -y nginx > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            yum install -y nginx > /dev/null 2>&1
        fi
        systemctl start nginx
        systemctl enable nginx
        print_task_done "Installing nginx"
    else
        print_success "nginx already installed"
    fi

    # Install Certbot
    if [ "$install_certbot" = "y" ]; then
        print_task "Installing Certbot"
        if command -v apt-get &> /dev/null; then
            apt-get install -y certbot python3-certbot-nginx > /dev/null 2>&1
        elif command -v dnf &> /dev/null; then
            dnf install -y certbot python3-certbot-nginx > /dev/null 2>&1
        elif command -v yum &> /dev/null; then
            yum install -y certbot python3-certbot-nginx > /dev/null 2>&1
        fi
        print_task_done "Installing Certbot"
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
    fi
}

# Generate environment file
generate_env_file() {
    print_step "GENERATING CONFIGURATION"

    # Validate that all required domains are set
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        if [ -z "$panel_domain" ]; then
            echo ""
            print_error "Panel domain is not configured"
            echo -e "  ${MUTED}Value: '${panel_domain}'${NC}"
            echo -e "  ${MUTED}Installation type: ${installation_type}${NC}"
            echo ""
            print_error "Cannot generate .env file. Please reconfigure your domains."
            exit 1
        fi
    fi

    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        if [ -z "$api_domain" ]; then
            echo ""
            print_error "API domain is not configured"
            echo -e "  ${MUTED}Value: '${api_domain}'${NC}"
            echo -e "  ${MUTED}Installation type: ${installation_type}${NC}"
            echo ""
            print_error "Cannot generate .env file. Please reconfigure your domains."
            exit 1
        fi
    fi

    if [ "$install_monitoring" = "y" ] && [ -z "$monitoring_domain" ]; then
        echo ""
        print_error "Monitoring domain is not configured"
        echo -e "  ${MUTED}Value: '${monitoring_domain}'${NC}"
        echo ""
        print_error "Cannot generate .env file. Please reconfigure your domains."
        exit 1
    fi

    # Check if .env file already exists (update mode)
    local env_exists=false
    local existing_postgres_password=""
    local existing_jwt_secret=""
    local existing_better_auth_secret=""
    local existing_download_token_secret=""
    local existing_encryption_key=""
    local existing_grafana_password=""

    if [ -f "${ENV_FILE}" ]; then
        env_exists=true
        existing_postgres_password=$(grep "^POSTGRES_PASSWORD=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
        existing_jwt_secret=$(grep "^JWT_SECRET=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
        existing_better_auth_secret=$(grep "^BETTER_AUTH_SECRET=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
        existing_download_token_secret=$(grep "^DOWNLOAD_TOKEN_SECRET=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
        existing_encryption_key=$(grep "^ENCRYPTION_KEY=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
        existing_grafana_password=$(grep "^GRAFANA_ADMIN_PASSWORD=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
    fi

    # Generate new secrets only if they don't exist
    if [ "$env_exists" = true ] && [ -n "$existing_postgres_password" ]; then
        postgres_password="$existing_postgres_password"
    else
        postgres_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    fi

    if [ "$env_exists" = true ] && [ -n "$existing_jwt_secret" ]; then
        local jwt_secret="$existing_jwt_secret"
    else
        local jwt_secret=$(openssl rand -base64 32)
    fi

    if [ "$env_exists" = true ] && [ -n "$existing_better_auth_secret" ]; then
        local better_auth_secret="$existing_better_auth_secret"
    else
        local better_auth_secret=$(openssl rand -base64 32)
    fi

    if [ "$env_exists" = true ] && [ -n "$existing_download_token_secret" ]; then
        local download_token_secret="$existing_download_token_secret"
    else
        local download_token_secret=$(openssl rand -base64 32)
    fi

    if [ "$env_exists" = true ] && [ -n "$existing_encryption_key" ]; then
        local encryption_key="$existing_encryption_key"
    else
        local encryption_key=$(openssl rand -base64 32)
    fi

    # Create install directory
    mkdir -p "${INSTALL_DIR}"

    # Generate .env file
    print_task "Creating environment file"

    cat > "${ENV_FILE}" << EOF
# Database Configuration
POSTGRES_USER=${postgres_user}
POSTGRES_PASSWORD=${postgres_password}
POSTGRES_DB=${postgres_db}
DATABASE_URL=postgresql://${postgres_user}:${postgres_password}@postgres:5432/${postgres_db}

# API Configuration
PORT=3001
HOSTNAME=::
API_URL=https://${api_domain}
JWT_SECRET=${jwt_secret}
BETTER_AUTH_SECRET=${better_auth_secret}
DOWNLOAD_TOKEN_SECRET=${download_token_secret}
ENCRYPTION_KEY=${encryption_key}
NODE_ENV=production

# Panel Configuration (Next.js)
# NEXT_PUBLIC_API_URL is resolved at runtime using next-public-env
# This value is injected into the browser at page load time
NEXT_PUBLIC_API_URL=https://${api_domain}
FRONTEND_URL=https://${panel_domain}

# Upload Limit Configuration
UPLOAD_LIMIT=${upload_limit}

# Monitoring (if enabled)
EOF

    if [ "$install_monitoring" = "y" ]; then
        if [ "$env_exists" = true ] && [ -n "$existing_grafana_password" ]; then
            local grafana_password="$existing_grafana_password"
        else
            local grafana_password=$(openssl rand -base64 16 | tr -d "=+/")
        fi

        cat >> "${ENV_FILE}" << EOF
MONITORING_DOMAIN=${monitoring_domain}
GRAFANA_ADMIN_PASSWORD=${grafana_password}
EOF
    fi

    chmod 600 "${ENV_FILE}"
    print_task_done "Creating environment file"
}

# Generate PostgreSQL initialization script
generate_postgres_init_script() {
    print_task "Creating PostgreSQL initialization script"

    # Create initialization script that explicitly sets the password
    # This ensures the password hash is created correctly for SCRAM-SHA-256 authentication
    cat > "${INSTALL_DIR}/init-postgres.sh" << 'INIT_EOF'
#!/bin/bash
set -e

# Wait a moment for PostgreSQL to fully initialize
sleep 2

# Explicitly set the password to ensure proper SCRAM-SHA-256 hash generation
# This fixes authentication issues that sometimes occur with environment variable initialization
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Ensure the password is set correctly with proper SCRAM-SHA-256 hash
    ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';

    -- Grant all privileges
    GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
EOSQL

echo "PostgreSQL user password has been explicitly set and verified"
INIT_EOF

    chmod +x "${INSTALL_DIR}/init-postgres.sh"
    print_task_done "Creating PostgreSQL initialization script"
}

# Generate Docker Compose file
generate_docker_compose() {
    print_task "Generating Docker Compose configuration"

    cat > "${DOCKER_COMPOSE_FILE}" << 'COMPOSE_EOF'
networks:
  stellarstack:
    driver: bridge

volumes:
  postgres_data:
  prometheus_data:
  grafana_data:
  loki_data:

services:
  postgres:
    image: postgres:16-alpine
    container_name: stellarstack-postgres
    restart: unless-stopped
    networks:
      - stellarstack
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init-postgres.sh:/docker-entrypoint-initdb.d/init-postgres.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

COMPOSE_EOF

    # Add API service if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        cat >> "${DOCKER_COMPOSE_FILE}" << 'COMPOSE_EOF'
  api:
    image: stellarstackoss/stellarstack-api:latest
    container_name: stellarstack-api
    restart: unless-stopped
    networks:
      - stellarstack
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PORT=${PORT}
      - HOSTNAME=${HOSTNAME}
      - API_URL=${API_URL}
      - JWT_SECRET=${JWT_SECRET}
      - BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
      - DOWNLOAD_TOKEN_SECRET=${DOWNLOAD_TOKEN_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
      - NODE_ENV=${NODE_ENV}
      - FRONTEND_URL=${FRONTEND_URL}
    ports:
      - "127.0.0.1:3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
    command: >
      sh -c "npx prisma db push --accept-data-loss && node --import tsx/esm src/index.ts"
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

COMPOSE_EOF
    fi

    # Add Panel service if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        cat >> "${DOCKER_COMPOSE_FILE}" << 'COMPOSE_EOF'
  panel:
    image: stellarstackoss/stellarstack-web:latest
    container_name: stellarstack-panel
    restart: unless-stopped
    networks:
      - stellarstack
    environment:
      - NODE_ENV=${NODE_ENV}
      - PORT=3000
      - HOSTNAME=${HOSTNAME}
      - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - api
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3

COMPOSE_EOF
    fi

    # Add monitoring stack if enabled
    if [ "$install_monitoring" = "y" ]; then
        cat >> "${DOCKER_COMPOSE_FILE}" << 'COMPOSE_EOF'
  prometheus:
    image: prom/prometheus:latest
    container_name: stellarstack-prometheus
    restart: unless-stopped
    networks:
      - stellarstack
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - prometheus_data:/prometheus
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  loki:
    image: grafana/loki:latest
    container_name: stellarstack-loki
    restart: unless-stopped
    networks:
      - stellarstack
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - loki_data:/loki
      - ./loki-config.yml:/etc/loki/local-config.yaml:ro
    command: -config.file=/etc/loki/local-config.yaml

  promtail:
    image: grafana/promtail:latest
    container_name: stellarstack-promtail
    restart: unless-stopped
    networks:
      - stellarstack
    volumes:
      - ./promtail-config.yml:/etc/promtail/config.yml:ro
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/config.yml

  grafana:
    image: grafana/grafana:latest
    container_name: stellarstack-grafana
    restart: unless-stopped
    networks:
      - stellarstack
    ports:
      - "127.0.0.1:3002:3000"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana-provisioning:/etc/grafana/provisioning:ro
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_SERVER_ROOT_URL=https://${MONITORING_DOMAIN}
      - GF_USERS_ALLOW_SIGN_UP=false
    depends_on:
      - prometheus
      - loki

COMPOSE_EOF
    fi

    print_task_done "Generating Docker Compose configuration"
}

# Generate monitoring configs
generate_monitoring_configs() {
    if [ "$install_monitoring" != "y" ]; then
        return
    fi

    print_task "Generating monitoring configurations"

    # Prometheus config
    cat > "${INSTALL_DIR}/prometheus.yml" << 'PROM_EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: '/metrics'

  - job_name: 'panel'
    static_configs:
      - targets: ['panel:3000']
    metrics_path: '/metrics'
PROM_EOF

    # Loki config
    cat > "${INSTALL_DIR}/loki-config.yml" << 'LOKI_EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-05-15
      store: boltdb
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 168h

storage_config:
  boltdb:
    directory: /loki/index
  filesystem:
    directory: /loki/chunks

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  reject_old_samples_max_age: 168h
LOKI_EOF

    # Promtail config
    cat > "${INSTALL_DIR}/promtail-config.yml" << 'PROMTAIL_EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'logstream'
      - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
        target_label: 'service'
PROMTAIL_EOF

    # Create Grafana provisioning directory
    mkdir -p "${INSTALL_DIR}/grafana-provisioning/datasources"
    mkdir -p "${INSTALL_DIR}/grafana-provisioning/dashboards"

    # Grafana datasources
    cat > "${INSTALL_DIR}/grafana-provisioning/datasources/datasources.yml" << 'GRAFANA_DS_EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
GRAFANA_DS_EOF

    print_task_done "Generating monitoring configurations"
}

# Configure nginx reverse proxy
configure_nginx() {
    # Skip if user chose to keep existing configs
    if [ "$skip_nginx_config" = "y" ]; then
        print_step "CONFIGURING NGINX"
        print_info "Skipping nginx configuration (using existing configs)"
        echo ""
        wait_for_enter
        return
    fi

    print_step "CONFIGURING NGINX"

    # Configure Panel nginx if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        print_task "Configuring nginx for Panel (${panel_domain})"

        # Determine if we need API proxy (only for panel_and_api)
        local include_api_proxy=""
        if [[ "$installation_type" == "panel_and_api" ]]; then
            include_api_proxy="
    # Proxy API requests to API container
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_cache_bypass \\\$http_upgrade;

        # WebSocket support
        proxy_read_timeout 86400;
    }
"
        fi

        cat > "${NGINX_CONF_DIR}/stellarstack-panel" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${panel_domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${panel_domain};

    ssl_certificate /etc/letsencrypt/live/${panel_domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${panel_domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    client_max_body_size ${upload_limit};
${include_api_proxy}
    # Panel frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

        ln -sf "${NGINX_CONF_DIR}/stellarstack-panel" "${NGINX_ENABLED_DIR}/stellarstack-panel"
        print_task_done "Configuring nginx for Panel (${panel_domain})"
    fi

    # Configure API nginx if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        print_task "Configuring nginx for API (${api_domain})"

        cat > "${NGINX_CONF_DIR}/stellarstack-api" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${api_domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${api_domain};

    ssl_certificate /etc/letsencrypt/live/${api_domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${api_domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    client_max_body_size ${upload_limit};

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

        ln -sf "${NGINX_CONF_DIR}/stellarstack-api" "${NGINX_ENABLED_DIR}/stellarstack-api"
        print_task_done "Configuring nginx for API (${api_domain})"
    fi

    # Configure Daemon nginx if all-in-one
    if [[ "$installation_type" == "all_in_one" ]]; then
        print_task "Configuring nginx for Daemon (${daemon_ssl_domain})"

        cat > "${NGINX_CONF_DIR}/stellarstack-daemon" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${daemon_ssl_domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${daemon_ssl_domain};

    ssl_certificate /etc/letsencrypt/live/${daemon_ssl_domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${daemon_ssl_domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    client_max_body_size ${upload_limit};

    # Increase timeouts for long-running game server operations
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;

    location / {
        proxy_pass http://127.0.0.1:${daemon_port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Longer timeouts for game server operations
        proxy_read_timeout 300;
        proxy_connect_timeout 75;
        proxy_send_timeout 300;
    }
}
EOF

        ln -sf "${NGINX_CONF_DIR}/stellarstack-daemon" "${NGINX_ENABLED_DIR}/stellarstack-daemon"
        print_task_done "Configuring nginx for Daemon (${daemon_ssl_domain})"
    fi

    # Configure Monitoring nginx if needed
    if [ "$install_monitoring" = "y" ]; then
        print_task "Configuring nginx for Monitoring (${monitoring_domain})"

        cat > "${NGINX_CONF_DIR}/stellarstack-monitoring" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${monitoring_domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${monitoring_domain};

    ssl_certificate /etc/letsencrypt/live/${monitoring_domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${monitoring_domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    client_max_body_size ${upload_limit};

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

        ln -sf "${NGINX_CONF_DIR}/stellarstack-monitoring" "${NGINX_ENABLED_DIR}/stellarstack-monitoring"
        print_task_done "Configuring nginx for Monitoring (${monitoring_domain})"
    fi
}

# Obtain SSL certificates
obtain_ssl_certificates() {
    # Skip if user chose to reuse existing certificates
    if [ "$skip_ssl_generation" = "y" ]; then
        print_step "OBTAINING SSL CERTIFICATES"
        print_info "Skipping SSL certificate generation (using existing certificates)"
        echo ""
        wait_for_enter
        return
    fi

    print_step "OBTAINING SSL CERTIFICATES"

    # Stop nginx temporarily
    systemctl stop nginx

    # Get Panel SSL if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        if [ -d "/etc/letsencrypt/live/${panel_domain}" ]; then
            print_success "SSL certificate already exists for ${panel_domain}"
        else
            print_task "Obtaining SSL certificate for ${panel_domain}"
            if certbot certonly --standalone -d "${panel_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
                print_task_done "Obtaining SSL certificate for ${panel_domain}"
            else
                print_warning "Failed to obtain SSL certificate for ${panel_domain}"
            fi
        fi
    fi

    # Get API SSL if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        if [ -d "/etc/letsencrypt/live/${api_domain}" ]; then
            print_success "SSL certificate already exists for ${api_domain}"
        else
            print_task "Obtaining SSL certificate for ${api_domain}"
            if certbot certonly --standalone -d "${api_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
                print_task_done "Obtaining SSL certificate for ${api_domain}"
            else
                print_warning "Failed to obtain SSL certificate for ${api_domain}"
            fi
        fi
    fi

    # Get Monitoring SSL if needed
    if [ "$install_monitoring" = "y" ]; then
        if [ -d "/etc/letsencrypt/live/${monitoring_domain}" ]; then
            print_success "SSL certificate already exists for ${monitoring_domain}"
        else
            print_task "Obtaining SSL certificate for ${monitoring_domain}"
            if certbot certonly --standalone -d "${monitoring_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
                print_task_done "Obtaining SSL certificate for ${monitoring_domain}"
            else
                print_warning "Failed to obtain SSL certificate for ${monitoring_domain}"
            fi
        fi
    fi

    # Get Daemon SSL if all-in-one
    if [[ "$installation_type" == "all_in_one" ]]; then
        if [ -d "/etc/letsencrypt/live/${daemon_ssl_domain}" ]; then
            print_success "SSL certificate already exists for ${daemon_ssl_domain}"
        else
            print_task "Obtaining SSL certificate for ${daemon_ssl_domain}"
            if certbot certonly --standalone -d "${daemon_ssl_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
                print_task_done "Obtaining SSL certificate for ${daemon_ssl_domain}"
            else
                print_warning "Failed to obtain SSL certificate for ${daemon_ssl_domain}"
            fi
        fi
    fi

    # Start nginx again
    systemctl start nginx
}

# Check container health
check_container_health() {
    local container=$1
    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)

        # If container has no healthcheck, just check if it's running
        if [ -z "$health" ]; then
            if [ "$status" = "running" ]; then
                return 0
            fi
        elif [ "$health" = "healthy" ]; then
            return 0
        fi

        # Check if container exited
        if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
            return 1
        fi

        sleep 1
        attempt=$((attempt + 1))
    done

    return 1
}

# Monitor container startup
monitor_container_startup() {
    local container=$1
    local service_name=$2
    local max_wait=60
    local elapsed=0

    print_task "Waiting for ${service_name} to be healthy"

    while [ $elapsed -lt $max_wait ]; do
        local health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)
        local status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null)

        if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
            echo ""
            echo -e "  ${ERROR}[✗]${NC} ${ERROR}${service_name} failed to start${NC}"
            echo ""
            echo -e "  ${WARNING}Last 20 log lines:${NC}"
            docker logs --tail 20 "$container" 2>&1 | sed 's/^/    /'
            return 1
        fi

        if [ -z "$health" ]; then
            # No healthcheck - just check if running
            if [ "$status" = "running" ]; then
                print_task_done "Waiting for ${service_name} to be healthy"
                return 0
            fi
        else
            case "$health" in
                "healthy")
                    print_task_done "Waiting for ${service_name} to be healthy"
                    return 0
                    ;;
                "unhealthy")
                    echo ""
                    echo -e "  ${WARNING}[!]${NC} ${WARNING}${service_name} is unhealthy${NC}"
                    echo ""
                    echo -e "  ${WARNING}Last 20 log lines:${NC}"
                    docker logs --tail 20 "$container" 2>&1 | sed 's/^/    /'
                    return 1
                    ;;
            esac
        fi

        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo ""
    echo -e "  ${WARNING}[!]${NC} ${WARNING}${service_name} timeout waiting for healthy status${NC}"
    echo ""
    return 0
}

# Pull and start Docker containers
pull_and_start() {
    print_step "DEPLOYING CONTAINERS"

    cd "${INSTALL_DIR}"

    # Stop and remove existing containers if they exist
    # NOTE: This does NOT remove volumes, so database data is preserved
    print_task "Checking for existing containers"

    # First, try to stop containers via docker-compose if compose file exists
    if [ -f "${DOCKER_COMPOSE_FILE}" ]; then
        if docker compose ps -q 2>/dev/null | grep -q .; then
            docker compose down > /dev/null 2>&1 || true
        fi
    fi

    # Also check for manually created containers and remove them
    local containers_removed=false
    for container in stellarstack-panel stellarstack-api stellarstack-postgres stellarstack-grafana stellarstack-loki stellarstack-prometheus stellarstack-promtail; do
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            docker stop "$container" > /dev/null 2>&1 || true
            docker rm "$container" > /dev/null 2>&1 || true
            containers_removed=true
        fi
    done

    if [ "$containers_removed" = true ]; then
        print_task_done "Checking for existing containers"
        print_info "Existing containers removed (data volumes preserved)"
    else
        print_task_done "Checking for existing containers"
    fi
    echo ""

    # Pull images
    local images=()
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        images+=("${API_IMAGE}:latest")
    fi
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
        images+=("${PANEL_IMAGE}:latest")
    fi
    images+=("postgres:16-alpine")

    if [ "$install_monitoring" = "y" ]; then
        images+=("prom/prometheus:latest" "grafana/loki:latest" "grafana/promtail:latest" "grafana/grafana:latest")
    fi

    for image in "${images[@]}"; do
        print_task "Pulling ${image}"

        # Pull image and capture any errors
        if ! docker pull "$image" > /tmp/docker-pull.log 2>&1; then
            echo ""
            echo -e "${ERROR}Failed to pull image: $image${NC}"
            echo -e "${WARNING}Error output:${NC}"
            cat /tmp/docker-pull.log | tail -10 | sed 's/^/    /'
            echo ""
            exit 1
        fi
        print_task_done "Pulling ${image}"
    done
    echo ""

    # Start containers
    print_task "Starting containers"
    if ! docker compose up -d --remove-orphans > /tmp/docker-compose.log 2>&1; then
        echo ""
        echo -e "${ERROR}Failed to start containers${NC}"
        echo -e "${WARNING}Error output:${NC}"
        cat /tmp/docker-compose.log | sed 's/^/    /'
        echo ""
        exit 1
    fi
    print_task_done "Starting containers"

    echo ""
    print_step "MONITORING CONTAINER HEALTH"

    # Monitor postgres first (required by others)
    if ! monitor_container_startup "stellarstack-postgres" "PostgreSQL"; then
        print_error "PostgreSQL failed to start. Installation cannot continue."
        echo ""
        echo -e "${SECONDARY}  Check logs with: docker logs stellarstack-postgres${NC}"
        exit 1
    fi

    # Verify PostgreSQL password and fix if needed
    # This ensures the password works even if the container was initialized with a broken hash
    print_task "Verifying PostgreSQL authentication"

    # Test if the password works from the network (how the API will connect)
    if ! docker run --rm --network stellarstack_stellarstack postgres:16-alpine \
        psql "postgresql://${postgres_user}:${postgres_password}@postgres:5432/${postgres_db}" \
        -c "SELECT 1" > /dev/null 2>&1; then

        echo -e "\r  ${WARNING}[!]${NC} ${WARNING}PostgreSQL password needs to be reset${NC}    "
        print_task "Resetting PostgreSQL password"

        # Reset the password using ALTER USER (this always works)
        docker exec stellarstack-postgres psql -U "${postgres_user}" -d "${postgres_db}" \
            -c "ALTER USER ${postgres_user} WITH PASSWORD '${postgres_password}';" > /dev/null 2>&1

        # Verify it works now
        if docker run --rm --network stellarstack_stellarstack postgres:16-alpine \
            psql "postgresql://${postgres_user}:${postgres_password}@postgres:5432/${postgres_db}" \
            -c "SELECT 1" > /dev/null 2>&1; then
            print_task_done "Resetting PostgreSQL password"
        else
            echo -e "\r  ${ERROR}[✗]${NC} ${ERROR}Failed to reset PostgreSQL password${NC}    "
            print_error "PostgreSQL authentication still failing after password reset"
            exit 1
        fi
    else
        print_task_done "Verifying PostgreSQL authentication"
    fi

    # Monitor API if installed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        if ! monitor_container_startup "stellarstack-api" "API"; then
            print_warning "API had issues starting. Check logs with: docker logs stellarstack-api"
            echo ""

            if ask_yes_no "Continue anyway?" "n"; then
                echo ""
            else
                exit 1
            fi
        else
            # API is healthy - seed admin account if this is a fresh install
            if [ "$update_mode" != "y" ] && [ -n "$admin_email" ] && [ -n "$admin_password" ]; then
                echo ""
                print_task "Creating admin account in database"

                # Disable exit-on-error for this section
                set +e

                # Create a temporary seeding script with hardcoded credentials
                cat > "${INSTALL_DIR}/seed-admin.ts" << SEED_EOF
import { PrismaClient } from '@prisma/client';
import { auth } from './src/lib/auth';

const prisma = new PrismaClient();

async function seedAdmin() {
  const email = '${admin_email}';
  const password = '${admin_password}';

  try {
    // Check if admin already exists
    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      console.log('Admin user already exists');
      await prisma.\$disconnect();
      process.exit(0);
    }

    // Use better-auth's API to create user with proper password hash
    console.log('Creating admin user via better-auth API...');
    const ctx = await auth.api.signUpEmail({
      body: {
        email: email,
        password: password,
        name: 'Administrator',
      },
    });

    if (ctx.user) {
      // Update user to be admin and verify email
      await prisma.user.update({
        where: { id: ctx.user.id },
        data: {
          role: 'admin',
          emailVerified: true,
        },
      });
      console.log('Admin user created successfully:', ctx.user.email);
    } else {
      console.error('Failed to create admin user - no user returned from signUpEmail');
      process.exit(1);
    }

    await prisma.\$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin:', error.message);
    console.error('Stack:', error.stack);
    await prisma.\$disconnect();
    process.exit(1);
  }
}

seedAdmin();
SEED_EOF

                # Copy the seeding script into the API container and run it
                echo -e "${MUTED}  Copying seed script to container...${NC}"
                if ! docker cp "${INSTALL_DIR}/seed-admin.ts" stellarstack-api:/app/apps/api/seed-admin.ts 2>/tmp/seed-copy-error.log; then
                    echo ""
                    echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Failed to copy seed script to container${NC}    "
                    cat /tmp/seed-copy-error.log | sed 's/^/    /' || true
                    print_info "You can create an admin account manually after installation"
                else
                    # Run the seeding script inside the API container with tsx
                    echo -e "${MUTED}  Running seed script in container...${NC}"
                    local seed_output
                    seed_output=$(docker exec stellarstack-api node --import tsx/esm seed-admin.ts 2>&1) || true
                    local seed_status=$?

                    echo -e "${MUTED}  Seed script exit code: ${seed_status}${NC}"

                    if [ $seed_status -eq 0 ]; then
                        print_task_done "Creating admin account in database"
                        print_success "Admin account created: ${admin_email}"
                    elif echo "$seed_output" | grep -q "already exists"; then
                        print_task_done "Creating admin account in database"
                        print_info "Admin user already exists"
                    else
                        echo ""
                        echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Seed script failed (exit code: ${seed_status})${NC}    "
                        echo ""
                        echo -e "${MUTED}  Error output:${NC}"
                        echo "$seed_output" | sed 's/^/    /' || echo "    (no output)"
                        echo ""
                        # Try direct database insertion as fallback
                        echo -e "${MUTED}  Trying fallback method (direct SQL)...${NC}"

                        # Generate bcrypt hash using the API container's bcrypt
                        local password_hash
                        password_hash=$(docker exec stellarstack-api node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('${admin_password}', 10).then(h => console.log(h));" 2>/dev/null) || true

                        if [ -n "$password_hash" ]; then
                            # Insert user and account in a transaction
                            docker exec stellarstack-postgres psql -U "${postgres_user}" -d "${postgres_db}" << SQLEOF > /dev/null 2>&1 || true
DO \$\$
DECLARE
    new_user_id TEXT;
BEGIN
    -- Insert user if doesn't exist
    INSERT INTO users (id, email, "emailVerified", name, role, "createdAt", "updatedAt")
    VALUES (
        'cl' || substr(md5(random()::text), 1, 24),
        '${admin_email}',
        true,
        'Administrator',
        'admin',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO new_user_id;

    -- Get user ID if it already existed
    IF new_user_id IS NULL THEN
        SELECT id INTO new_user_id FROM users WHERE email = '${admin_email}';
    END IF;

    -- Insert credential account
    INSERT INTO accounts (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    VALUES (
        'cl' || substr(md5(random()::text), 1, 24),
        '${admin_email}',
        'credential',
        new_user_id,
        '${password_hash}',
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;
END \$\$;
SQLEOF

                            print_task_done "Creating admin account in database"
                            print_success "Admin account created: ${admin_email}"
                        else
                            echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Could not create admin account automatically${NC}    "
                            print_info "Please create an admin account manually after installation"
                        fi
                    fi
                fi

                # Cleanup temp scripts (always run)
                rm -f "${INSTALL_DIR}/seed-admin.ts" || true
                docker exec stellarstack-api rm -f seed-admin.ts > /dev/null 2>&1 || true

                # Re-enable exit-on-error
                set -e

                echo -e "${MUTED}  Admin account seeding completed${NC}"
                echo ""
            fi
        fi
    fi

    # Monitor Panel if installed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" || "$installation_type" == "all_in_one" ]]; then
        if ! monitor_container_startup "stellarstack-panel" "Panel"; then
            print_warning "Panel had issues starting. Check logs with: docker logs stellarstack-panel"
            echo ""

            if ask_yes_no "Continue anyway?" "n"; then
                echo ""
            else
                exit 1
            fi
        fi
    fi

    # Monitor monitoring stack if enabled
    if [ "$install_monitoring" = "y" ]; then
        monitor_container_startup "stellarstack-prometheus" "Prometheus" || true
        monitor_container_startup "stellarstack-loki" "Loki" || true
        monitor_container_startup "stellarstack-promtail" "Promtail" || true
        monitor_container_startup "stellarstack-grafana" "Grafana" || true
    fi

    echo ""
    print_step "FINALIZING"

    # Reload nginx
    print_task "Reloading nginx"
    systemctl reload nginx > /dev/null 2>&1
    print_task_done "Reloading nginx"

    # Show final status
    echo ""
    print_info "Container status:"
    echo ""
    docker compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" | sed 's/^/    /'
    echo ""
}

# Create daemon node and get token (for all-in-one installations)
create_daemon_node_token() {
    print_step "CONFIGURING DAEMON NODE"

    print_task "Generating daemon authentication token"
    daemon_token=$(openssl rand -base64 48 | tr -d "=+/" | cut -c1-48)
    print_task_done "Generating daemon authentication token"

    print_task "Creating location and node in database"

    # Disable exit-on-error for this section
    set +e

    # Create a seeding script that creates location, node, and syncs with daemon
    cat > "${INSTALL_DIR}/seed-all-in-one.ts" << 'SEED_EOF'
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

// Hash token using SHA-256 (same as API)
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function seedAllInOne() {
  const daemonDomain = process.env.DAEMON_DOMAIN || 'node.example.com';
  const daemonToken = process.env.DAEMON_TOKEN || '';
  const daemonPort = process.env.DAEMON_PORT || '443';
  const daemonProtocol = process.env.DAEMON_PROTOCOL || 'HTTPS_PROXY';

  try {
    // Create default location
    let location = await prisma.location.findFirst({
      where: { name: 'Default Location' }
    });

    if (!location) {
      console.log('Creating default location...');
      location = await prisma.location.create({
        data: {
          name: 'Default Location',
          description: 'Auto-configured default location for all-in-one installation',
        }
      });
      console.log('Default location created:', location.name);
    } else {
      console.log('Default location already exists:', location.name);
    }

    // Hash the token for storage
    const tokenHash = hashToken(daemonToken);

    // Create node
    let node = await prisma.node.findFirst({
      where: { host: daemonDomain }
    });

    if (!node) {
      console.log('Creating daemon node...');
      node = await prisma.node.create({
        data: {
          displayName: 'Default Node',
          host: daemonDomain,
          port: parseInt(daemonPort),
          protocol: daemonProtocol as any, // HTTPS_PROXY for nginx reverse proxy
          sftpPort: 2022,
          memoryLimit: BigInt(8192 * 1024 * 1024), // 8GB in bytes
          diskLimit: BigInt(102400 * 1024 * 1024), // 100GB in bytes
          cpuLimit: 4.0, // 4 CPU cores
          uploadLimit: BigInt(100 * 1024 * 1024), // 100MB in bytes
          locationId: location.id,
          token: daemonToken,
          tokenHash: tokenHash,
        }
      });
      console.log('Daemon node created:', node.host);
    } else {
      console.log('Daemon node already exists:', node.host);
      // Update token if needed
      await prisma.node.update({
        where: { id: node.id },
        data: {
          token: daemonToken,
          tokenHash: tokenHash,
          isOnline: false, // Force re-authentication
        }
      });
      console.log('Daemon node tokens updated');
    }

    // Output node ID so install script can use it
    console.log('NODE_ID=' + node.id);

    await prisma.$disconnect();
    console.log('All-in-one seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding all-in-one:', error);
    console.error('Stack:', error.stack);
    await prisma.$disconnect();
    process.exit(1);
  }
}

seedAllInOne();
SEED_EOF

    # Copy the seeding script into the API container and run it
    echo -e "${MUTED}  Copying seed script to container...${NC}"
    if ! docker cp "${INSTALL_DIR}/seed-all-in-one.ts" stellarstack-api:/app/apps/api/seed-all-in-one.ts 2>/tmp/seed-copy-error.log; then
        echo ""
        echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Failed to copy seed script to container${NC}    "
        cat /tmp/seed-copy-error.log | sed 's/^/    /' || true
        print_error "Could not configure daemon node automatically"
        set -e
        return 1
    fi

    # Run the seeding script inside the API container
    echo -e "${MUTED}  Running seed script in container...${NC}"
    local seed_output
    seed_output=$(docker exec -e DAEMON_DOMAIN="${daemon_ssl_domain}" \
        -e DAEMON_TOKEN="${daemon_token}" \
        -e DAEMON_PORT="443" \
        -e DAEMON_PROTOCOL="HTTPS_PROXY" \
        stellarstack-api node --import tsx/esm seed-all-in-one.ts 2>&1) || true
    local seed_status=$?

    if [ $seed_status -eq 0 ]; then
        print_task_done "Creating location and node in database"

        # Extract node ID from output
        daemon_token_id=$(echo "$seed_output" | grep "NODE_ID=" | cut -d'=' -f2)

        if [ -z "$daemon_token_id" ]; then
            print_warning "Could not extract node ID, falling back to token-only auth"
        else
            print_success "Daemon node configured automatically"
            print_info "Node ID: ${daemon_token_id}"
            print_info "Node FQDN: ${daemon_ssl_domain}"
            print_info "Location: Default Location"
        fi
    else
        echo ""
        echo -e "\r  ${WARNING}[!]${NC} ${WARNING}Automatic node creation failed${NC}    "
        echo ""
        echo -e "${MUTED}  Error output:${NC}"
        echo "$seed_output" | sed 's/^/    /' || echo "    (no output)"
        print_warning "You will need to create the node manually in the Panel"
    fi

    # Cleanup temp scripts
    rm -f "${INSTALL_DIR}/seed-all-in-one.ts" || true
    docker exec stellarstack-api rm -f seed-all-in-one.ts > /dev/null 2>&1 || true

    # Re-enable exit-on-error
    set -e

    echo ""
}

# Install daemon from source
install_daemon() {
    print_step "INSTALLING STELLAR DAEMON"

    BUILD_DIR="/tmp/stellar-daemon-build"
    rm -rf "${BUILD_DIR}"

    print_task "Cloning repository"
    git clone --depth 1 "https://github.com/${GITHUB_REPO}.git" "${BUILD_DIR}" > /dev/null 2>&1
    print_task_done "Cloning repository"

    echo ""
    echo -e "  ${SECONDARY}Building daemon (this may take 5-10 minutes)...${NC}"
    echo ""

    cd "${BUILD_DIR}/apps/daemon"
    export PATH="$HOME/.cargo/bin:$PATH"

    print_task "Compiling daemon"
    if cargo build --release > /tmp/daemon-build.log 2>&1; then
        print_task_done "Compiling daemon"
    else
        echo ""
        print_error "Failed to build daemon"
        echo -e "${WARNING}Last 20 lines of build log:${NC}"
        tail -20 /tmp/daemon-build.log | sed 's/^/    /'
        exit 1
    fi

    print_task "Creating installation directories"
    mkdir -p "${DAEMON_INSTALL_DIR}"/{volumes,backups,archives,tmp,logs}
    print_task_done "Creating installation directories"

    # Stop daemon service if it's running to allow binary replacement
    if systemctl list-unit-files | grep -q "stellar-daemon.service"; then
        if systemctl is-active --quiet stellar-daemon; then
            print_task "Stopping running daemon service"
            systemctl stop stellar-daemon > /dev/null 2>&1 || true
            print_task_done "Stopping running daemon service"
        fi
    fi

    print_task "Installing daemon binary"
    cp "${BUILD_DIR}/apps/daemon/target/release/stellar-daemon" "${DAEMON_INSTALL_DIR}/stellar-daemon"
    chmod +x "${DAEMON_INSTALL_DIR}/stellar-daemon"
    print_task_done "Installing daemon binary"

    # Setup SSL if enabled
    local ssl_enabled="false"
    local ssl_cert=""
    local ssl_key=""

    if [ "$daemon_enable_ssl" = "y" ] && [ -n "$daemon_ssl_domain" ]; then
        # For all-in-one, nginx handles SSL, so we don't need to configure SSL in daemon
        if [[ "$installation_type" == "all_in_one" ]]; then
            print_info "SSL handled by nginx reverse proxy"
            ssl_enabled="false"  # Daemon listens on HTTP, nginx terminates SSL
        else
            # Standalone daemon installation - daemon handles SSL itself
            print_task "Obtaining SSL certificate"
            # Stop services that might be using port 80
            systemctl stop nginx > /dev/null 2>&1 || true

            if certbot certonly --standalone -d "${daemon_ssl_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
                ssl_enabled="true"
                ssl_cert="/etc/letsencrypt/live/${daemon_ssl_domain}/fullchain.pem"
                ssl_key="/etc/letsencrypt/live/${daemon_ssl_domain}/privkey.pem"
                print_task_done "Obtaining SSL certificate"
            else
                print_warning "Failed to obtain SSL certificate, continuing without SSL"
            fi

            # Restart nginx if it was running
            systemctl start nginx > /dev/null 2>&1 || true
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

    # Determine API host - use localhost for all-in-one (nginx proxies), public IP for standalone
    local api_host="${server_ip}"
    if [[ "$installation_type" == "all_in_one" ]]; then
        api_host="127.0.0.1"
    fi

    cat > "${DAEMON_INSTALL_DIR}/config.toml" << EOF
# StellarStack Daemon Configuration
# Generated by install-script.sh on $(date)

debug = false

[api]
host = "${api_host}"
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
token_id = "${daemon_token_id:-}"
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

    echo ""
    print_success "Daemon installation complete"
}

# Show completion screen
show_complete() {
    clear_screen
    echo -e "${PRIMARY}  > DEPLOYMENT COMPLETE${NC}"
    echo ""
    echo -e "${SECONDARY}  StellarStack has been successfully deployed!${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  ACCESS POINTS:${NC}"
    echo ""

    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
        echo -e "    ${PRIMARY}>${NC}  Panel:     ${PRIMARY}https://${panel_domain}${NC}"
    fi

    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        echo -e "    ${PRIMARY}>${NC}  API:       ${PRIMARY}https://${api_domain}${NC}"
    fi

    if [ "$install_monitoring" = "y" ]; then
        echo -e "    ${PRIMARY}>${NC}  Monitoring: ${PRIMARY}https://${monitoring_domain}${NC}"
    fi

    if [[ "$installation_type" == "daemon" ]]; then
        local protocol="http"
        if [ "$daemon_enable_ssl" = "y" ]; then
            protocol="https"
            echo -e "    ${PRIMARY}>${NC}  Daemon:    ${PRIMARY}${protocol}://${daemon_ssl_domain}:${daemon_port}${NC}"
        else
            echo -e "    ${PRIMARY}>${NC}  Daemon:    ${PRIMARY}${protocol}://${server_ip}:${daemon_port}${NC}"
        fi
        echo -e "    ${PRIMARY}>${NC}  SFTP:      ${PRIMARY}Port ${daemon_sftp_port}${NC}"
    fi

    if [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "    ${PRIMARY}>${NC}  Daemon:    ${PRIMARY}https://${daemon_ssl_domain}${NC}"
        echo -e "    ${PRIMARY}>${NC}  SFTP:      ${PRIMARY}Port ${daemon_sftp_port}${NC}"
    fi

    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Show admin credentials if they were set
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]] && [ -n "$admin_email" ]; then
        echo -e "${PRIMARY}  ADMIN ACCOUNT:${NC}"
        echo ""
        echo -e "    ${SECONDARY}Email:${NC}    ${PRIMARY}${admin_email}${NC}"
        echo -e "    ${SECONDARY}Password:${NC} ${PRIMARY}${admin_password}${NC}"
        echo ""
        echo -e "    ${WARNING}[!]${NC} ${WARNING}Save these credentials securely!${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi

    # Show daemon node info for all-in-one
    if [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  DAEMON NODE (Auto-configured):${NC}"
        echo ""
        echo -e "    ${SECONDARY}Node Name:${NC}     ${PRIMARY}Default Node${NC}"
        echo -e "    ${SECONDARY}Location:${NC}      ${PRIMARY}Default Location${NC}"
        echo -e "    ${SECONDARY}FQDN:${NC}          ${PRIMARY}${daemon_ssl_domain}${NC}"
        echo -e "    ${SECONDARY}Status:${NC}        ${PRIMARY}✓ Ready to deploy servers${NC}"
        echo ""
        echo -e "    ${PRIMARY}[✓]${NC} ${PRIMARY}Node is fully configured and connected to Panel!${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi

    echo -e "${PRIMARY}  USEFUL COMMANDS:${NC}"
    echo ""
    if [[ "$installation_type" == "daemon" ]]; then
        echo -e "    ${SECONDARY}systemctl status stellar-daemon${NC}  ${MUTED}# Check daemon status${NC}"
        echo -e "    ${SECONDARY}systemctl restart stellar-daemon${NC} ${MUTED}# Restart daemon${NC}"
        echo -e "    ${SECONDARY}systemctl stop stellar-daemon${NC}    ${MUTED}# Stop daemon${NC}"
        echo -e "    ${SECONDARY}journalctl -u stellar-daemon -f${NC}  ${MUTED}# View daemon logs${NC}"
    elif [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "    ${SECONDARY}cd ${INSTALL_DIR}${NC}"
        echo -e "    ${SECONDARY}docker compose ps${NC}              ${MUTED}# Check Panel/API status${NC}"
        echo -e "    ${SECONDARY}docker compose logs -f${NC}          ${MUTED}# View Panel/API logs${NC}"
        echo -e "    ${SECONDARY}systemctl status stellar-daemon${NC}  ${MUTED}# Check daemon status${NC}"
        echo -e "    ${SECONDARY}journalctl -u stellar-daemon -f${NC}  ${MUTED}# View daemon logs${NC}"
    else
        echo -e "    ${SECONDARY}cd ${INSTALL_DIR}${NC}"
        echo -e "    ${SECONDARY}docker compose ps${NC}              ${MUTED}# Check container status${NC}"
        echo -e "    ${SECONDARY}docker compose logs -f${NC}          ${MUTED}# View logs${NC}"
        echo -e "    ${SECONDARY}docker compose restart${NC}          ${MUTED}# Restart all services${NC}"
        echo -e "    ${SECONDARY}docker compose pull && docker compose up -d${NC} ${MUTED}# Update to latest${NC}"
    fi
    echo ""
    if [[ "$installation_type" == "daemon" ]]; then
        echo -e "${PRIMARY}  DAEMON CONFIGURATION:${NC}"
        echo ""
        echo -e "    ${SECONDARY}Config file:${NC}  ${PRIMARY}${DAEMON_INSTALL_DIR}/config.toml${NC}"
        echo -e "    ${SECONDARY}Volumes:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/volumes${NC}"
        echo -e "    ${SECONDARY}Backups:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/backups${NC}"
        echo -e "    ${SECONDARY}Logs:${NC}         ${PRIMARY}${DAEMON_INSTALL_DIR}/logs${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    elif [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  DATA MANAGEMENT:${NC}"
        echo ""
        echo -e "    ${SECONDARY}docker volume ls${NC}                ${MUTED}# List all data volumes${NC}"
        echo -e "    ${SECONDARY}docker volume inspect stellarstack_postgres_data${NC} ${MUTED}# Check database volume${NC}"
        echo ""
        echo -e "    ${WARNING}[!]${NC} ${WARNING}Your database persists across container updates${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
        echo -e "${PRIMARY}  DAEMON CONFIGURATION:${NC}"
        echo ""
        echo -e "    ${SECONDARY}Config file:${NC}  ${PRIMARY}${DAEMON_INSTALL_DIR}/config.toml${NC}"
        echo -e "    ${SECONDARY}Volumes:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/volumes${NC}"
        echo -e "    ${SECONDARY}Backups:${NC}      ${PRIMARY}${DAEMON_INSTALL_DIR}/backups${NC}"
        echo -e "    ${SECONDARY}Logs:${NC}         ${PRIMARY}${DAEMON_INSTALL_DIR}/logs${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    else
        echo -e "${PRIMARY}  DATA MANAGEMENT:${NC}"
        echo ""
        echo -e "    ${SECONDARY}docker volume ls${NC}                ${MUTED}# List all data volumes${NC}"
        echo -e "    ${SECONDARY}docker volume inspect stellarstack_postgres_data${NC} ${MUTED}# Check database volume${NC}"
        echo ""
        echo -e "    ${WARNING}[!]${NC} ${WARNING}Your database persists across container updates${NC}"
        echo -e "    ${WARNING}[!]${NC} ${WARNING}To wipe all data: docker compose down -v (destructive!)${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi
    echo -e "${PRIMARY}  DATABASE CREDENTIALS:${NC}"
    echo ""
    echo -e "    ${SECONDARY}Database:${NC}     ${PRIMARY}${postgres_db}${NC}"
    echo -e "    ${SECONDARY}Username:${NC}     ${PRIMARY}${postgres_user}${NC}"
    echo -e "    ${SECONDARY}Password:${NC}     ${PRIMARY}${postgres_password}${NC}"
    echo ""
    echo -e "    ${WARNING}[!]${NC} ${WARNING}Save these credentials securely!${NC}"
    echo ""

    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        local jwt_secret=$(grep "^JWT_SECRET=" "${ENV_FILE}" | cut -d= -f2)
        local better_auth_secret=$(grep "^BETTER_AUTH_SECRET=" "${ENV_FILE}" | cut -d= -f2)
        local download_token_secret=$(grep "^DOWNLOAD_TOKEN_SECRET=" "${ENV_FILE}" | cut -d= -f2)
        local encryption_key=$(grep "^ENCRYPTION_KEY=" "${ENV_FILE}" | cut -d= -f2)

        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
        echo -e "${PRIMARY}  API SECURITY CREDENTIALS:${NC}"
        echo ""
        echo -e "    ${SECONDARY}JWT Secret:${NC}            ${PRIMARY}${jwt_secret}${NC}"
        echo -e "    ${SECONDARY}Better Auth Secret:${NC}    ${PRIMARY}${better_auth_secret}${NC}"
        echo -e "    ${SECONDARY}Download Token Secret:${NC} ${PRIMARY}${download_token_secret}${NC}"
        echo -e "    ${SECONDARY}Encryption Key:${NC}        ${PRIMARY}${encryption_key}${NC}"
        echo ""
        echo -e "    ${WARNING}[!]${NC} ${WARNING}These are stored in ${ENV_FILE}${NC}"
        echo ""
    fi

    if [ "$install_monitoring" = "y" ]; then
        local grafana_password=$(grep GRAFANA_ADMIN_PASSWORD "${ENV_FILE}" | cut -d= -f2)
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
        echo -e "${PRIMARY}  GRAFANA CREDENTIALS:${NC}"
        echo ""
        echo -e "    ${SECONDARY}Username:${NC}     ${PRIMARY}admin${NC}"
        echo -e "    ${SECONDARY}Password:${NC}     ${PRIMARY}${grafana_password}${NC}"
        echo ""
    fi

    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    # Show getting started for all-in-one
    if [[ "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  GETTING STARTED:${NC}"
        echo ""
        echo -e "  ${PRIMARY}Your all-in-one installation is ready!${NC}"
        echo ""
        echo -e "    ${SECONDARY}1. Log in to Panel:${NC} ${PRIMARY}https://${panel_domain}${NC}"
        echo -e "    ${SECONDARY}2. Navigate to:${NC} ${MUTED}Servers > Create Server${NC}"
        echo -e "    ${SECONDARY}3. Select location:${NC} ${PRIMARY}Default Location${NC}"
        echo -e "    ${SECONDARY}4. Select node:${NC} ${PRIMARY}Default Node${NC}"
        echo -e "    ${SECONDARY}5. Deploy your first game server!${NC}"
        echo ""
        echo -e "  ${PRIMARY}No additional configuration needed - everything is ready to use!${NC}"
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi

    # Show firewall instructions for daemon installations
    if [[ "$installation_type" == "daemon" || "$installation_type" == "all_in_one" ]]; then
        echo -e "${PRIMARY}  FIREWALL CONFIGURATION:${NC}"
        echo ""
        echo -e "${WARNING}  [!]${NC} ${WARNING}Important: Open these ports in your firewall${NC}"
        echo ""
        echo -e "    ${SECONDARY}Port ${daemon_sftp_port}:${NC}  SFTP (required for file management)"
        if [[ "$installation_type" == "daemon" ]]; then
            echo -e "    ${SECONDARY}Port ${daemon_port}:${NC}  Daemon API"
        fi
        echo ""
        echo -e "  ${MUTED}Example for ufw:${NC}"
        echo -e "    ${SECONDARY}sudo ufw allow ${daemon_sftp_port}/tcp${NC}"
        if [[ "$installation_type" == "daemon" ]]; then
            echo -e "    ${SECONDARY}sudo ufw allow ${daemon_port}/tcp${NC}"
        fi
        echo ""
        echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi

    echo -e "${SECONDARY}  Thank you for installing StellarStack!${NC}"
    echo -e "${MUTED}  Documentation: https://docs.stellarstack.app${NC}"
    echo ""
}

# Uninstall function - completely remove StellarStack
uninstall() {
    clear_screen
    echo -e "${ERROR}  > UNINSTALL STELLARSTACK${NC}"
    echo ""
    echo -e "${WARNING}  WARNING: This will completely remove StellarStack from your system!${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${SECONDARY}  The following will be removed:${NC}"
    echo -e "    ${MUTED}• All StellarStack Docker containers${NC}"
    echo -e "    ${MUTED}• All Docker volumes (including database data)${NC}"
    echo -e "    ${MUTED}• All nginx configurations${NC}"
    echo -e "    ${MUTED}• Installation directory (${INSTALL_DIR})${NC}"
    echo ""
    echo -e "${PRIMARY}  The following will NOT be removed:${NC}"
    echo -e "    ${MUTED}• Docker and nginx (system packages)${NC}"
    echo -e "    ${MUTED}• SSL certificates in /etc/letsencrypt${NC}"
    echo -e "    ${MUTED}• Docker images (use 'docker rmi' to remove)${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    if ! ask_yes_no "Are you sure you want to uninstall StellarStack?" "n"; then
        echo ""
        print_info "Uninstall cancelled"
        exit 0
    fi

    echo ""
    if ! ask_yes_no "Type 'Y' to confirm - This will DELETE ALL DATA" "n"; then
        echo ""
        print_info "Uninstall cancelled"
        exit 0
    fi

    echo ""
    print_step "UNINSTALLING STELLARSTACK"

    # Stop and remove containers
    print_task "Stopping and removing containers"
    cd "${INSTALL_DIR}" 2>/dev/null || true
    if [ -f "${DOCKER_COMPOSE_FILE}" ]; then
        docker compose down -v > /dev/null 2>&1 || true
    fi

    # Remove individual containers if they still exist
    for container in stellarstack-panel stellarstack-api stellarstack-postgres stellarstack-grafana stellarstack-loki stellarstack-prometheus stellarstack-promtail stellarstack-certbot stellarstack-nginx; do
        docker stop "$container" > /dev/null 2>&1 || true
        docker rm "$container" > /dev/null 2>&1 || true
    done
    print_task_done "Stopping and removing containers"

    # Stop and remove daemon service if it exists
    if systemctl list-unit-files | grep -q "stellar-daemon.service"; then
        print_task "Stopping and removing daemon service"
        systemctl stop stellar-daemon > /dev/null 2>&1 || true
        systemctl disable stellar-daemon > /dev/null 2>&1 || true
        rm -f /etc/systemd/system/stellar-daemon.service
        systemctl daemon-reload
        print_task_done "Stopping and removing daemon service"
    fi

    # Remove Docker volumes
    print_task "Removing Docker volumes"
    docker volume rm stellarstack_postgres_data > /dev/null 2>&1 || true
    docker volume rm stellarstack_prometheus_data > /dev/null 2>&1 || true
    docker volume rm stellarstack_grafana_data > /dev/null 2>&1 || true
    docker volume rm stellarstack_loki_data > /dev/null 2>&1 || true
    docker volume rm stellarstack_certbot_www > /dev/null 2>&1 || true
    docker volume rm stellarstack_certbot_conf > /dev/null 2>&1 || true
    print_task_done "Removing Docker volumes"

    # Remove Docker network
    print_task "Removing Docker network"
    docker network rm stellarstack > /dev/null 2>&1 || true
    print_task_done "Removing Docker network"

    # Remove nginx configurations
    print_task "Removing nginx configurations"
    rm -f /etc/nginx/sites-available/stellarstack-* 2>/dev/null || true
    rm -f /etc/nginx/sites-enabled/stellarstack-* 2>/dev/null || true
    systemctl reload nginx > /dev/null 2>&1 || true
    print_task_done "Removing nginx configurations"

    # Remove installation directory
    print_task "Removing installation directory"
    rm -rf "${INSTALL_DIR}" 2>/dev/null || true
    rm -rf "${DAEMON_INSTALL_DIR}" 2>/dev/null || true
    print_task_done "Removing installation directory"

    echo ""
    echo -e "${PRIMARY}  ✓ StellarStack has been completely uninstalled${NC}"
    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${SECONDARY}  Optional cleanup:${NC}"
    echo ""
    echo -e "    ${MUTED}# Remove Docker images (optional)${NC}"
    echo -e "    ${SECONDARY}docker rmi stellarstackoss/stellarstack-api:latest${NC}"
    echo -e "    ${SECONDARY}docker rmi stellarstackoss/stellarstack-web:latest${NC}"
    echo ""
    echo -e "    ${MUTED}# Remove SSL certificates (optional)${NC}"
    echo -e "    ${SECONDARY}certbot delete --cert-name yourdomain.com${NC}"
    echo ""
    echo -e "    ${MUTED}# Remove Docker and nginx (optional)${NC}"
    echo -e "    ${SECONDARY}apt-get remove docker-ce docker-ce-cli containerd.io nginx${NC}"
    echo ""
}

# Show usage information
show_usage() {
    echo -e "${PRIMARY}StellarStack Installer${NC} ${MUTED}v${INSTALLER_VERSION}${NC}"
    echo -e "${MUTED}Built: ${INSTALLER_DATE}${NC}"
    echo ""
    echo -e "${SECONDARY}Usage:${NC}"
    echo -e "  ${PRIMARY}sudo $0${NC}                 ${MUTED}# Install or update StellarStack${NC}"
    echo -e "  ${PRIMARY}sudo $0 --uninstall${NC}    ${MUTED}# Completely remove StellarStack${NC}"
    echo -e "  ${PRIMARY}sudo $0 --help${NC}         ${MUTED}# Show this help message${NC}"
    echo ""
    echo -e "${SECONDARY}Options:${NC}"
    echo -e "  ${PRIMARY}--uninstall, --remove, -u${NC}  ${MUTED}Remove all StellarStack components${NC}"
    echo -e "  ${PRIMARY}--help, -h${NC}                 ${MUTED}Display this help message${NC}"
    echo -e "  ${PRIMARY}--version, -v${NC}              ${MUTED}Show version information${NC}"
    echo ""
}

# Main function
main() {
    # Check for version flag
    if [ "$1" = "--version" ] || [ "$1" = "-v" ]; then
        echo -e "${PRIMARY}StellarStack Installer${NC}"
        echo -e "${SECONDARY}Version:${NC} ${INSTALLER_VERSION}"
        echo -e "${SECONDARY}Built:${NC}   ${INSTALLER_DATE}"
        exit 0
    fi

    # Check for help flag
    if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
        show_usage
        exit 0
    fi

    # Check for uninstall flag
    if [ "$1" = "--uninstall" ] || [ "$1" = "--remove" ] || [ "$1" = "-u" ]; then
        uninstall
        exit 0
    fi

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        echo -e "${ERROR}This script must be run as root${NC}"
        echo -e "Run with: sudo $0"
        exit 1
    fi

    # Welcome and configuration
    show_welcome
    select_installation_type
    check_existing_installation
    check_dependencies

    # Handle daemon installation separately
    if [[ "$installation_type" == "daemon" ]]; then
        # Get server IP for daemon
        print_task "Detecting server IP address"
        server_ip=$(get_server_ip)
        if [ -n "$server_ip" ]; then
            print_task_done "Detecting server IP address"
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
        fi

        # Collect daemon configuration
        collect_daemon_config

        # Install system dependencies
        install_dependencies

        # Install daemon
        install_daemon

        # Show completion message
        show_complete
        return
    fi

    # Regular panel/API installation flow
    collect_domain_config

    # Collect upload limit configuration
    collect_upload_limit_config

    # Collect admin credentials (only for fresh installations or if API is being installed)
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" || "$installation_type" == "all_in_one" ]]; then
        if [ "$update_mode" != "y" ]; then
            collect_admin_credentials
        fi
    fi

    # Install system dependencies
    install_dependencies

    # Generate configuration files
    generate_env_file
    generate_postgres_init_script
    generate_docker_compose
    generate_monitoring_configs

    # Configure nginx
    configure_nginx

    # Obtain SSL certificates
    obtain_ssl_certificates

    # Deploy containers
    pull_and_start

    # For all-in-one, install daemon after panel/API are running
    if [[ "$installation_type" == "all_in_one" ]]; then
        echo ""
        print_step "INSTALLING DAEMON"

        # Create/get daemon node tokens
        create_daemon_node_token

        # Install daemon (skip SSL generation, nginx handles it)
        install_daemon
    fi

    # Show completion message
    show_complete
}

# Run
main "$@"
