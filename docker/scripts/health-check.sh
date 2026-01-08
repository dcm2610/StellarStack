#!/bin/bash

# ============================================
# StellarStack Health Check
# ============================================
# Verifies that all StellarStack services are running and healthy
#
# Usage: ./health-check.sh
#
# Exit codes:
#   0 - All services healthy
#   1 - One or more services unhealthy

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine docker-compose command
if command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    StellarStack Health Check                     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Check if services are running
echo -e "${BLUE}=== Container Status ===${NC}"
$DOCKER_COMPOSE ps
echo ""

# Initialize health status
all_healthy=true

# Check PostgreSQL
echo -e "${BLUE}=== PostgreSQL Database ===${NC}"
if $DOCKER_COMPOSE exec -T postgres pg_isready -U stellar > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
else
    echo -e "${RED}✗ PostgreSQL is not ready${NC}"
    all_healthy=false
fi
echo ""

# Check API health endpoint
echo -e "${BLUE}=== API Service ===${NC}"
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    response=$(curl -s http://localhost:3001/health)
    echo -e "${GREEN}✓ API is healthy${NC}"
    echo "  Response: $response"
else
    echo -e "${RED}✗ API health check failed${NC}"
    echo "  Make sure the API service is running and port 3001 is accessible"
    all_healthy=false
fi
echo ""

# Check Web service
echo -e "${BLUE}=== Web Service ===${NC}"
if curl -f -s -o /dev/null http://localhost:3000 2>&1; then
    echo -e "${GREEN}✓ Web is responding${NC}"
else
    echo -e "${RED}✗ Web service check failed${NC}"
    echo "  Make sure the Web service is running and port 3000 is accessible"
    all_healthy=false
fi
echo ""

# Check nginx
echo -e "${BLUE}=== nginx Reverse Proxy ===${NC}"
if curl -f -s -o /dev/null http://localhost:80 2>&1; then
    echo -e "${GREEN}✓ nginx is responding on port 80${NC}"
else
    echo -e "${YELLOW}⚠ nginx is not responding on port 80${NC}"
    echo "  This is expected if SSL certificates haven't been obtained yet"
fi

if curl -f -s -k -o /dev/null https://localhost:443 2>&1; then
    echo -e "${GREEN}✓ nginx is responding on port 443 (HTTPS)${NC}"
else
    echo -e "${YELLOW}⚠ nginx is not responding on port 443 (HTTPS)${NC}"
    echo "  Make sure SSL certificates are installed"
fi
echo ""

# Check SSL certificates
echo -e "${BLUE}=== SSL Certificates ===${NC}"
if [ -f "/etc/letsencrypt/live/*/fullchain.pem" ]; then
    echo -e "${GREEN}✓ SSL certificates found${NC}"

    # Check certificate expiry
    for cert in /etc/letsencrypt/live/*/fullchain.pem; do
        if [ -f "$cert" ]; then
            domain=$(basename $(dirname "$cert"))
            expiry=$(openssl x509 -enddate -noout -in "$cert" 2>/dev/null | cut -d= -f2)
            if [ -n "$expiry" ]; then
                echo "  $domain expires: $expiry"
            fi
        fi
    done
else
    # Check if running in docker
    cert_check=$($DOCKER_COMPOSE exec -T certbot ls /etc/letsencrypt/live/ 2>/dev/null | wc -l)
    if [ "$cert_check" -gt 0 ]; then
        echo -e "${GREEN}✓ SSL certificates found in certbot container${NC}"
    else
        echo -e "${YELLOW}⚠ No SSL certificates found${NC}"
        echo "  Run setup.sh to obtain SSL certificates"
    fi
fi
echo ""

# Check disk usage
echo -e "${BLUE}=== Disk Usage ===${NC}"
if command -v df >/dev/null 2>&1; then
    disk_usage=$(df -h . | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -lt 80 ]; then
        echo -e "${GREEN}✓ Disk usage: ${disk_usage}%${NC}"
    elif [ "$disk_usage" -lt 90 ]; then
        echo -e "${YELLOW}⚠ Disk usage: ${disk_usage}%${NC}"
    else
        echo -e "${RED}✗ Disk usage: ${disk_usage}% (critically high)${NC}"
        all_healthy=false
    fi
fi
echo ""

# Check Docker volumes
echo -e "${BLUE}=== Docker Volumes ===${NC}"
volumes=$($DOCKER_COMPOSE volume ls -q 2>/dev/null | wc -l)
echo "  $volumes volume(s) in use"
echo ""

# Final summary
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}║    All Critical Services Healthy ✓               ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}║    Some Services Are Unhealthy ✗                 ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  1. Check logs: $DOCKER_COMPOSE logs"
    echo "  2. Restart services: $DOCKER_COMPOSE restart"
    echo "  3. View service status: $DOCKER_COMPOSE ps"
    echo "  4. Check .env configuration"
    exit 1
fi
