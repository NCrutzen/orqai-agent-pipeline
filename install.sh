#!/usr/bin/env bash
# Orq Agent Designer Installer
# Usage: curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
# Or: chmod +x install.sh && ./install.sh
set -euo pipefail

GITHUB_OWNER="NCrutzen"
GITHUB_REPO="orqai-agent-pipeline"
GITHUB_BRANCH="main"

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# --- Header banner ---
echo ""
echo -e "${BOLD}===========================================${NC}"
echo -e "${BOLD}   Orq Agent Designer - Installer${NC}"
echo -e "${BOLD}===========================================${NC}"
echo ""

# --- Prerequisite checks ---
MISSING=0

if ! command -v node &> /dev/null; then
  echo -e "${RED}ERROR: Node.js is not installed.${NC}"
  echo -e "  Install it from: ${BOLD}https://nodejs.org/${NC}"
  echo ""
  MISSING=1
fi

if ! command -v claude &> /dev/null; then
  echo -e "${RED}ERROR: Claude Code is not installed.${NC}"
  echo -e "  Install it with: ${BOLD}npm install -g @anthropic-ai/claude-code${NC}"
  echo ""
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  echo -e "${RED}Please install the missing prerequisites above and try again.${NC}"
  exit 1
fi

echo -e "${GREEN}Prerequisites OK${NC} (Node.js, Claude Code)"

# --- Install directory ---
INSTALL_DIR="$HOME/.claude/skills/orq-agent"

# --- Version comparison ---
VERSION_URL="https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/VERSION"
REMOTE_VERSION=$(curl -sL "$VERSION_URL" 2>/dev/null | tr -d '[:space:]') || REMOTE_VERSION=""

if [ -z "$REMOTE_VERSION" ]; then
  echo -e "${YELLOW}WARNING: Could not fetch remote version. Proceeding with install...${NC}"
else
  if [ -f "$INSTALL_DIR/VERSION" ]; then
    LOCAL_VERSION=$(tr -d '[:space:]' < "$INSTALL_DIR/VERSION")
    if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ]; then
      echo -e "${GREEN}Already up to date (v${LOCAL_VERSION})${NC}"
      exit 0
    fi
    echo -e "Updating: v${LOCAL_VERSION} -> v${REMOTE_VERSION}"
  else
    echo -e "Installing: v${REMOTE_VERSION}"
  fi
fi

# --- Backup for rollback ---
if [ -d "$INSTALL_DIR" ]; then
  echo "Backing up current installation..."
  rm -rf "${INSTALL_DIR}.backup"
  cp -r "$INSTALL_DIR" "${INSTALL_DIR}.backup"
fi

# --- Download and install ---
TEMP_DIR=$(mktemp -d)

# Cleanup trap: remove temp dir; on failure, restore backup
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

ARCHIVE_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/${GITHUB_BRANCH}.tar.gz"
echo "Downloading from GitHub..."
if ! curl -sL "$ARCHIVE_URL" | tar xz -C "$TEMP_DIR"; then
  echo -e "${RED}ERROR: Failed to download archive.${NC}"
  echo -e "  Check your internet connection and try again."
  if [ -d "${INSTALL_DIR}.backup" ]; then
    echo -e "${YELLOW}Restoring previous installation...${NC}"
    rm -rf "$INSTALL_DIR"
    mv "${INSTALL_DIR}.backup" "$INSTALL_DIR"
  fi
  exit 1
fi

# Locate extracted directory (github archives extract as REPO-BRANCH/)
EXTRACTED_DIR="$TEMP_DIR/${GITHUB_REPO}-${GITHUB_BRANCH}"

if [ ! -d "$EXTRACTED_DIR" ]; then
  echo -e "${RED}ERROR: Unexpected archive structure.${NC}"
  if [ -d "${INSTALL_DIR}.backup" ]; then
    echo -e "${YELLOW}Restoring previous installation...${NC}"
    rm -rf "$INSTALL_DIR"
    mv "${INSTALL_DIR}.backup" "$INSTALL_DIR"
  fi
  exit 1
fi

# Create install directory and copy orq-agent contents
mkdir -p "$INSTALL_DIR"

# Copy orq-agent/ contents (the core skill files)
if [ -d "$EXTRACTED_DIR/orq-agent" ]; then
  cp -r "$EXTRACTED_DIR/orq-agent/"* "$INSTALL_DIR/"
else
  echo -e "${RED}ERROR: orq-agent/ directory not found in archive.${NC}"
  if [ -d "${INSTALL_DIR}.backup" ]; then
    echo -e "${YELLOW}Restoring previous installation...${NC}"
    rm -rf "$INSTALL_DIR"
    mv "${INSTALL_DIR}.backup" "$INSTALL_DIR"
  fi
  exit 1
fi

# Copy version tracking files
cp "$EXTRACTED_DIR/VERSION" "$INSTALL_DIR/VERSION"
cp "$EXTRACTED_DIR/CHANGELOG.md" "$INSTALL_DIR/CHANGELOG.md"
if [ -d "$EXTRACTED_DIR/.claude-plugin" ]; then
  mkdir -p "$INSTALL_DIR/.claude-plugin"
  cp -r "$EXTRACTED_DIR/.claude-plugin/"* "$INSTALL_DIR/.claude-plugin/"
fi

# --- Verification ---
VERIFY_FAILED=0

if [ ! -f "$INSTALL_DIR/SKILL.md" ]; then
  echo -e "${RED}Verification failed: SKILL.md not found${NC}"
  VERIFY_FAILED=1
fi

if [ ! -f "$INSTALL_DIR/commands/orq-agent.md" ]; then
  echo -e "${RED}Verification failed: commands/orq-agent.md not found${NC}"
  VERIFY_FAILED=1
fi

if [ "$VERIFY_FAILED" -eq 1 ]; then
  echo -e "${RED}Installation failed -- restoring backup${NC}"
  if [ -d "${INSTALL_DIR}.backup" ]; then
    rm -rf "$INSTALL_DIR"
    mv "${INSTALL_DIR}.backup" "$INSTALL_DIR"
    echo -e "${YELLOW}Previous version restored.${NC}"
  else
    rm -rf "$INSTALL_DIR"
    echo -e "${YELLOW}No backup to restore. Clean state.${NC}"
  fi
  exit 1
fi

# --- Clean up backup on success ---
rm -rf "${INSTALL_DIR}.backup"

# --- Success + Quick-start guide ---
INSTALLED_VERSION=$(tr -d '[:space:]' < "$INSTALL_DIR/VERSION")

echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}  Orq Agent Designer v${INSTALLED_VERSION} installed!${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo -e "  ${BOLD}Quick start:${NC}"
echo -e "    ${BOLD}/orq-agent${NC} \"Build a customer support triage system\""
echo -e "    ${BOLD}/orq-agent:help${NC}"
echo -e "    ${BOLD}/orq-agent:update${NC}"
echo ""
echo -e "  Run these commands inside ${BOLD}Claude Code${NC} to get started."
echo ""
