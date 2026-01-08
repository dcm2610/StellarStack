#!/bin/bash

# ============================================
# StellarStack Secret Generator
# ============================================
# Generates cryptographically secure secrets for StellarStack deployment
#
# Usage: ./generate-secrets.sh
#
# Output format:
#   ENV_VAR_NAME=generated_value
#
# You can append the output to your .env file or use it to regenerate secrets

set -e

echo "# StellarStack Generated Secrets"
echo "# Generated on: $(date)"
echo ""

# Generate BETTER_AUTH_SECRET (64 character base64 string)
echo "# Authentication secret for session signing"
echo "# Length: 64 characters (base64)"
BETTER_AUTH_SECRET=$(openssl rand -base64 64 | tr -d "=+/\n" | cut -c1-64)
echo "BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET"
echo ""

# Generate DOWNLOAD_TOKEN_SECRET (32 character base64 string)
echo "# Token secret for file downloads"
echo "# Length: 32 characters (base64)"
DOWNLOAD_TOKEN_SECRET=$(openssl rand -base64 32 | tr -d "=+/\n" | cut -c1-32)
echo "DOWNLOAD_TOKEN_SECRET=$DOWNLOAD_TOKEN_SECRET"
echo ""

# Generate ENCRYPTION_KEY (32 bytes in hex format = 64 hex characters)
echo "# Encryption key for AES-256"
echo "# Length: 32 bytes (64 hex characters)"
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
echo ""

# Generate POSTGRES_PASSWORD (32 character base64 string)
echo "# PostgreSQL database password"
echo "# Length: 32 characters (base64)"
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/\n" | cut -c1-32)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo ""

echo "# Copy the values above and update your .env file"
echo "# Make sure to restart services after updating secrets"
