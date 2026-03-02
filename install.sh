#!/usr/bin/env bash
# Orq Agent Designer Installer
# Usage: curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
#        curl -sL ... | bash -s -- --reconfigure   (change tier/API key/MCP)
# Or: chmod +x install.sh && ./install.sh [--reconfigure]
set -euo pipefail

GITHUB_OWNER="NCrutzen"
GITHUB_REPO="orqai-agent-pipeline"
GITHUB_BRANCH="main"
RECONFIGURE=false
if [[ "${1:-}" == "--reconfigure" ]]; then RECONFIGURE=true; fi

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
    if [ "$LOCAL_VERSION" = "$REMOTE_VERSION" ] && [ "$RECONFIGURE" = false ]; then
      echo -e "${GREEN}Already up to date (v${LOCAL_VERSION})${NC}"
      echo -e "  To change tier or API key, run with ${BOLD}--reconfigure${NC}"
      exit 0
    fi
    if [ "$RECONFIGURE" = true ]; then
      echo -e "Reconfiguring v${LOCAL_VERSION}..."
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

# Copy commands to ~/.claude/commands/orq-agent/ for slash command discovery
COMMANDS_DIR="$HOME/.claude/commands/orq-agent"
mkdir -p "$COMMANDS_DIR"
if [ -d "$EXTRACTED_DIR/orq-agent/commands" ]; then
  cp "$EXTRACTED_DIR/orq-agent/commands/"*.md "$COMMANDS_DIR/"
  echo "Commands registered to $COMMANDS_DIR"
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

# --- V2.0 Capability Setup ---

# Config file location
CONFIG_DIR="$INSTALL_DIR/.orq-agent"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Detect existing config for re-install/upgrade handling
EXISTING_TIER=""
EXISTING_OVERRIDES="{}"
if [ -f "$CONFIG_FILE" ]; then
  EXISTING_TIER=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8')).tier)}catch(e){}" 2>/dev/null || echo "")
  EXISTING_OVERRIDES=$(node -e "try{const c=JSON.parse(require('fs').readFileSync('$CONFIG_FILE','utf8'));console.log(JSON.stringify(c.model_overrides||{}))}catch(e){console.log('{}')}" 2>/dev/null || echo "{}")
fi

# --- Tier Selection (INST-01) ---
echo ""
echo -e "${BOLD}Select your capability tier:${NC}"
echo ""
echo "  ┌──────────┬─────────────────────────────────────────┐"
echo "  │ Tier     │ What You Get                            │"
echo "  ├──────────┼─────────────────────────────────────────┤"
echo "  │ core     │ /orq-agent (spec generation only)       │"
echo "  │ deploy   │ + /orq-agent:deploy (push to Orq.ai)    │"
echo "  │ test     │ + /orq-agent:test (automated testing)   │"
echo "  │ full     │ + /orq-agent:iterate (prompt iteration)  │"
echo "  └──────────┴─────────────────────────────────────────┘"
echo ""
echo "  Each tier includes all capabilities of lower tiers."
echo ""

if [ -n "$EXISTING_TIER" ]; then
  echo -e "  Current tier: ${BOLD}${EXISTING_TIER}${NC}"
  read -p "  Select tier [core/deploy/test/full] (enter to keep $EXISTING_TIER): " SELECTED_TIER </dev/tty
  if [ -z "$SELECTED_TIER" ]; then
    SELECTED_TIER="$EXISTING_TIER"
  fi
else
  read -p "  Select tier [core/deploy/test/full]: " SELECTED_TIER </dev/tty
fi

# Validate and normalize
case "$SELECTED_TIER" in
  core|deploy|test|full) ;;
  *) echo -e "  ${YELLOW}Invalid tier. Defaulting to core.${NC}"; SELECTED_TIER="core" ;;
esac

echo -e "  ${GREEN}Tier selected: ${SELECTED_TIER}${NC}"

# --- API Key Validation (INST-02) ---
MCP_REGISTERED=false

if [ "$SELECTED_TIER" != "core" ]; then
  echo ""

  # Check if API key already exists in environment
  if [ -n "${ORQ_API_KEY:-}" ]; then
    echo -e "  Existing Orq.ai API key detected."
    read -p "  Keep existing key? [Y/n]: " KEEP_KEY </dev/tty
    if [ "$KEEP_KEY" = "n" ] || [ "$KEEP_KEY" = "N" ]; then
      read -sp "  Enter your Orq.ai API key: " ORQ_API_KEY </dev/tty
      echo ""
    fi
  else
    read -sp "  Enter your Orq.ai API key: " ORQ_API_KEY </dev/tty
    echo ""
  fi

  # Validate against list models endpoint
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $ORQ_API_KEY" \
    "https://api.orq.ai/v2/models" 2>/dev/null) || HTTP_CODE="000"

  if [ "$HTTP_CODE" != "200" ]; then
    echo -e "  ${RED}API key validation failed (HTTP $HTTP_CODE).${NC}"
    echo -e "  Check your key and try again."
    exit 1
  fi
  echo -e "  ${GREEN}API key validated successfully.${NC}"

  # Write to shell profile (idempotent)
  SHELL_PROFILE="$HOME/.zshrc"
  if [ ! -f "$SHELL_PROFILE" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
  fi

  if grep -q "export ORQ_API_KEY=" "$SHELL_PROFILE" 2>/dev/null; then
    # Update existing entry in-place
    sed -i.bak "s|export ORQ_API_KEY=.*|export ORQ_API_KEY=\"$ORQ_API_KEY\"|" "$SHELL_PROFILE"
    rm -f "${SHELL_PROFILE}.bak"
    echo -e "  ${GREEN}API key updated in ${SHELL_PROFILE}${NC}"
  else
    # Append new entry
    echo "" >> "$SHELL_PROFILE"
    echo "# Orq.ai API Key (added by orq-agent installer)" >> "$SHELL_PROFILE"
    echo "export ORQ_API_KEY=\"$ORQ_API_KEY\"" >> "$SHELL_PROFILE"
    echo -e "  ${GREEN}API key added to ${SHELL_PROFILE}${NC}"
  fi

  # Export for current session
  export ORQ_API_KEY

  # --- MCP Server Registration (INST-03) ---
  ORQAI_MCP_URL="${ORQAI_MCP_URL:-https://my.orq.ai/v2/mcp}"

  echo ""
  echo "  Registering Orq.ai MCP server..."
  if claude mcp add --transport http --scope user orqai-mcp \
    "$ORQAI_MCP_URL" \
    --header "Authorization: Bearer $ORQ_API_KEY" 2>/dev/null; then
    echo -e "  ${GREEN}Orq.ai MCP server registered.${NC}"
    MCP_REGISTERED=true
  else
    echo -e "  ${YELLOW}WARNING: MCP registration failed. Deploy commands will use API fallback.${NC}"
    MCP_REGISTERED=false
  fi
fi

# --- Config File Creation ---
mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ] && [ "$EXISTING_OVERRIDES" != "{}" ]; then
  # Re-install: preserve user's model_overrides
  MODEL_OVERRIDES="$EXISTING_OVERRIDES"
else
  MODEL_OVERRIDES="{}"
fi

node -e "
const config = {
  tier: '$SELECTED_TIER',
  model_profile: 'quality',
  model_overrides: $MODEL_OVERRIDES,
  orq_api_key: '${ORQ_API_KEY:-}',
  installed_at: new Date().toISOString(),
  orqai_mcp_registered: $MCP_REGISTERED
};
require('fs').writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
"

echo ""
echo -e "  ${GREEN}Config saved to ${CONFIG_FILE}${NC}"

# --- Success + Quick-start guide ---
INSTALLED_VERSION=$(tr -d '[:space:]' < "$INSTALL_DIR/VERSION")

echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}  Orq Agent Designer v${INSTALLED_VERSION} installed!${NC}"
echo -e "${GREEN}  Tier: ${SELECTED_TIER}${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo -e "  ${BOLD}Quick start:${NC}"
echo -e "    ${BOLD}/orq-agent${NC} \"Build a customer support triage system\""

if [ "$SELECTED_TIER" = "deploy" ] || [ "$SELECTED_TIER" = "test" ] || [ "$SELECTED_TIER" = "full" ]; then
  echo -e "    ${BOLD}/orq-agent:deploy${NC} (push specs to Orq.ai)"
fi
if [ "$SELECTED_TIER" = "test" ] || [ "$SELECTED_TIER" = "full" ]; then
  echo -e "    ${BOLD}/orq-agent:test${NC} (automated testing)"
fi
if [ "$SELECTED_TIER" = "full" ]; then
  echo -e "    ${BOLD}/orq-agent:iterate${NC} (prompt iteration)"
fi

echo -e "    ${BOLD}/orq-agent:help${NC}"
echo -e "    ${BOLD}/orq-agent:update${NC}"
echo ""

if [ "$SELECTED_TIER" != "core" ]; then
  echo -e "  API key stored in shell profile. MCP server: ${MCP_REGISTERED}"
  echo -e "  ${YELLOW}Restart your terminal or run: source ${SHELL_PROFILE}${NC}"
  echo ""
fi

echo -e "  ${YELLOW}IMPORTANT: Restart Claude Code to activate commands.${NC}"
echo -e "  Then run these commands inside ${BOLD}Claude Code${NC} to get started."
echo ""
