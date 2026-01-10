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

# Version info
INSTALLER_VERSION="1.0.0"
INSTALLER_DATE=$(date +%Y-%m-%d)

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
installation_type=""  # Options: panel_and_api, panel, api

# Configuration
panel_domain=""
api_domain=""
monitoring_domain=""
server_ip=""
install_monitoring="n"

# PostgreSQL configuration
postgres_user="stellarstack"
postgres_password=""
postgres_db="stellarstack"

# Dependency installation
install_docker="n"
install_nginx="n"
install_certbot="n"

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
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""

    while true; do
        echo -ne "  ${SECONDARY}Enter your choice [1-3]:${NC} "
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
            *)
                print_error "Invalid choice. Please enter 1, 2, or 3."
                echo ""
                ;;
        esac
    done

    echo ""
    if ask_yes_no "Install monitoring stack (Prometheus, Loki, Grafana)?" "y"; then
        install_monitoring="y"
        print_success "Monitoring stack will be installed"
    else
        print_info "Monitoring stack will not be installed"
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
                    print_info "nginx configurations will be overwritten"
                    ;;
                3)
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

    # First, try to extract domains from existing .env file
    if [ -f "${ENV_FILE}" ]; then
        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
            # Extract panel domain from FRONTEND_URL
            local extracted_panel=$(grep "^FRONTEND_URL=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | sed 's|https\?://||' | sed 's|/.*||')
            if [ -n "$extracted_panel" ] && [ -d "/etc/letsencrypt/live/${extracted_panel}" ]; then
                panel_domain="$extracted_panel"
                print_info "Detected existing panel domain: ${panel_domain}"
                found_existing_certs=true
            fi
        fi

        if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
            # Extract API domain from NEXT_PUBLIC_API_URL
            local extracted_api=$(grep "^NEXT_PUBLIC_API_URL=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2 | sed 's|https\?://||' | sed 's|/.*||')
            if [ -n "$extracted_api" ] && [ -d "/etc/letsencrypt/live/${extracted_api}" ]; then
                api_domain="$extracted_api"
                print_info "Detected existing API domain: ${api_domain}"
                found_existing_certs=true
            fi
        fi

        if [ "$install_monitoring" = "y" ]; then
            # Extract monitoring domain from MONITORING_DOMAIN
            local extracted_monitoring=$(grep "^MONITORING_DOMAIN=" "${ENV_FILE}" 2>/dev/null | cut -d= -f2)
            if [ -n "$extracted_monitoring" ] && [ -d "/etc/letsencrypt/live/${extracted_monitoring}" ]; then
                monitoring_domain="$extracted_monitoring"
                print_info "Detected existing monitoring domain: ${monitoring_domain}"
                found_existing_certs=true
            fi
        fi
    fi

    # If domains not found in .env, try nginx config files
    if [ -z "$panel_domain" ] && [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
        if [ -f "${NGINX_CONF_DIR}/stellarstack-panel" ]; then
            panel_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-panel" | head -1 | awk '{print $2}' | sed 's/;//')
            if [ -n "$panel_domain" ] && [ -d "/etc/letsencrypt/live/${panel_domain}" ]; then
                print_info "Detected existing panel domain from nginx: ${panel_domain}"
                found_existing_certs=true
            fi
        fi
    fi

    if [ -z "$api_domain" ] && [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        if [ -f "${NGINX_CONF_DIR}/stellarstack-api" ]; then
            api_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-api" | head -1 | awk '{print $2}' | sed 's/;//')
            if [ -n "$api_domain" ] && [ -d "/etc/letsencrypt/live/${api_domain}" ]; then
                print_info "Detected existing API domain from nginx: ${api_domain}"
                found_existing_certs=true
            fi
        fi
    fi

    if [ -z "$monitoring_domain" ] && [ "$install_monitoring" = "y" ]; then
        if [ -f "${NGINX_CONF_DIR}/stellarstack-monitoring" ]; then
            monitoring_domain=$(grep "server_name" "${NGINX_CONF_DIR}/stellarstack-monitoring" | head -1 | awk '{print $2}' | sed 's/;//')
            if [ -n "$monitoring_domain" ] && [ -d "/etc/letsencrypt/live/${monitoring_domain}" ]; then
                print_info "Detected existing monitoring domain from nginx: ${monitoring_domain}"
                found_existing_certs=true
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

        if [ "$all_domains_found" = true ]; then
            echo ""
            print_success "Using existing certificates and domains"
            skip_ssl_generation="y"
            echo ""
            wait_for_enter
            return
        fi
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
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
}

# Generate environment file
generate_env_file() {
    print_step "GENERATING CONFIGURATION"

    # Generate secure passwords and secrets
    postgres_password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    local jwt_secret=$(openssl rand -base64 32)
    local better_auth_secret=$(openssl rand -base64 32)
    local download_token_secret=$(openssl rand -base64 32)
    local encryption_key=$(openssl rand -base64 32)

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
# Note: NEXT_PUBLIC_API_URL is baked into the Docker image at build time as "/api"
# nginx proxies panel.domain.com/api/* to the API container
# This variable is only used for local development or custom builds
NEXT_PUBLIC_API_URL=/api
FRONTEND_URL=https://${panel_domain}

# Monitoring (if enabled)
EOF

    if [ "$install_monitoring" = "y" ]; then
        cat >> "${ENV_FILE}" << EOF
MONITORING_DOMAIN=${monitoring_domain}
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/")
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
version: '3.8'

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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
        print_task "Obtaining SSL certificate for ${panel_domain}"
        if certbot certonly --standalone -d "${panel_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
            print_task_done "Obtaining SSL certificate for ${panel_domain}"
        else
            print_warning "Failed to obtain SSL certificate for ${panel_domain}"
        fi
    fi

    # Get API SSL if needed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        print_task "Obtaining SSL certificate for ${api_domain}"
        if certbot certonly --standalone -d "${api_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
            print_task_done "Obtaining SSL certificate for ${api_domain}"
        else
            print_warning "Failed to obtain SSL certificate for ${api_domain}"
        fi
    fi

    # Get Monitoring SSL if needed
    if [ "$install_monitoring" = "y" ]; then
        print_task "Obtaining SSL certificate for ${monitoring_domain}"
        if certbot certonly --standalone -d "${monitoring_domain}" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1; then
            print_task_done "Obtaining SSL certificate for ${monitoring_domain}"
        else
            print_warning "Failed to obtain SSL certificate for ${monitoring_domain}"
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
    if [ -f "${DOCKER_COMPOSE_FILE}" ]; then
        print_task "Stopping existing containers (preserving data volumes)"
        if docker compose ps -q 2>/dev/null | grep -q .; then
            # Use 'down' without -v flag to preserve volumes (database data, etc.)
            docker compose down > /dev/null 2>&1 || true
            print_task_done "Stopping existing containers (preserving data volumes)"
            print_info "Database and persistent data preserved"
        else
            echo -e "\r  ${MUTED}[ ]${NC} ${MUTED}No existing containers to stop${NC}    "
        fi
        echo ""
    fi

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
    if ! docker compose up -d > /tmp/docker-compose.log 2>&1; then
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
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "api" ]]; then
        if ! monitor_container_startup "stellarstack-api" "API"; then
            print_warning "API had issues starting. Check logs with: docker logs stellarstack-api"
            echo ""

            if ask_yes_no "Continue anyway?" "n"; then
                echo ""
            else
                exit 1
            fi
        fi
    fi

    # Monitor Panel if installed
    if [[ "$installation_type" == "panel_and_api" || "$installation_type" == "panel" ]]; then
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

    echo ""
    echo -e "${MUTED}  ────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "${PRIMARY}  USEFUL COMMANDS:${NC}"
    echo ""
    echo -e "    ${SECONDARY}cd ${INSTALL_DIR}${NC}"
    echo -e "    ${SECONDARY}docker compose ps${NC}              ${MUTED}# Check container status${NC}"
    echo -e "    ${SECONDARY}docker compose logs -f${NC}          ${MUTED}# View logs${NC}"
    echo -e "    ${SECONDARY}docker compose restart${NC}          ${MUTED}# Restart all services${NC}"
    echo -e "    ${SECONDARY}docker compose pull && docker compose up -d${NC} ${MUTED}# Update to latest${NC}"
    echo ""
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
    echo -e "${SECONDARY}  Thank you for installing StellarStack!${NC}"
    echo -e "${MUTED}  Documentation: https://docs.stellarstack.app${NC}"
    echo ""
}

# Main function
main() {
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
    collect_domain_config

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

    # Show completion message
    show_complete
}

# Run
main
