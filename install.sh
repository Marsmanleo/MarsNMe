#!/usr/bin/env bash
set -euo pipefail

VERSION="0.1.0"
REPO="https://github.com/Marsmanleo/MarsNMe.git"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.marsnme}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}[marsnme]${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}[marsnme]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[marsnme]${RESET} %s\n" "$*"; }
err()   { printf "${RED}[marsnme]${RESET} %s\n" "$*" >&2; }

banner() {
  echo ""
  echo -e "${BOLD}  __  __  ___  ____      ____ _     ___${RESET}"
  echo -e "${BOLD} |  \\/  |/ _ \\/ ___|    / ___| |   |_ _|${RESET}"
  echo -e "${BOLD} | |\\/| | | | \\___ \\   | |   | |    | | ${RESET}"
  echo -e "${BOLD} | |  | | |_| |___) |  | |___| |___ | | ${RESET}"
  echo -e "${BOLD} |_|  |_|\\___/|____/    \\____|_____|___|${RESET}"
  echo ""
  echo -e "  AI Persistent Memory — ${CYAN}marsnme.com${RESET}"
  echo ""
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 is required but not installed."
    if [ "$1" = "docker" ]; then
      info "Install Docker: https://docs.docker.com/get-docker/"
    fi
    exit 1
  fi
}

check_docker_compose() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    err "docker-compose v1 detected. MarsNMe requires Docker Compose v2 (plugin)."
    info "Upgrade: https://docs.docker.com/compose/install/"
    exit 1
  fi
  err "Docker Compose v2 not found."
  info "Install: https://docs.docker.com/compose/install/"
  exit 1
}

prompt_key() {
  local varname="$1"
  local prompt_text="$2"
  local is_secret="${3:-false}"
  local value

  if [ -f "${INSTALL_DIR}/.env" ] && grep -q "^${varname}=" "${INSTALL_DIR}/.env"; then
    value=$(grep "^${varname}=" "${INSTALL_DIR}/.env" | head -1 | cut -d'=' -f2-)
    if [ -n "$value" ]; then
      if [ "$is_secret" = "true" ]; then
        info "${prompt_text} (found in .env, using saved value)"
      else
        info "${prompt_text}: ${value} (found in .env)"
      fi
      eval "${varname}='${value}'"
      return 0
    fi
  fi

  if [ "$is_secret" = "true" ]; then
    printf "${CYAN}[marsnme]${RESET} ${prompt_text}: "
    read -rs value
    echo ""
  else
    printf "${CYAN}[marsnme]${RESET} ${prompt_text}: "
    read -r value
  fi

  if [ -z "$value" ]; then
    err "${varname} is required."
    exit 1
  fi
  eval "${varname}='${value}'"
}

# --- Main ---

banner

# 1. Check prerequisites
info "Checking prerequisites..."
require_cmd git
require_cmd docker
check_docker_compose
ok "Prerequisites met."

# 2. Clone or update repo
if [ -d "${INSTALL_DIR}/.git" ]; then
  info "Updating existing installation at ${INSTALL_DIR}..."
  cd "${INSTALL_DIR}"
  git fetch --quiet origin main
  git reset --hard origin/main --quiet 2>/dev/null || true
  ok "Repository updated."
else
  info "Cloning MarsNMe to ${INSTALL_DIR}..."
  mkdir -p "${INSTALL_DIR}"
  git clone --depth 1 "$REPO" "${INSTALL_DIR}"
  cd "${INSTALL_DIR}"
  ok "Repository cloned."
fi

# 3. Configure environment
info "Configuring environment..."

# Prompt for JINA_API_KEY (required)
JINA_API_KEY=""
prompt_key "JINA_API_KEY" "Enter your Jina API key (get one free at https://jina.ai/api-key/)" true

# Optional: MCP_PROFILE
MCP_PROFILE="${MCP_PROFILE:-coco}"
if [ ! -f "${INSTALL_DIR}/.env" ] || ! grep -q "^MCP_PROFILE=" "${INSTALL_DIR}/.env"; then
  printf "${CYAN}[marsnme]${RESET} Profile name [default: coco]: "
  read -r input_profile
  MCP_PROFILE="${input_profile:-coco}"
fi

# Write .env
cat > "${INSTALL_DIR}/.env" << EOF
MCP_PROFILE=${MCP_PROFILE}
JINA_API_KEY=${JINA_API_KEY}
EOF

ok "Environment configured (profile: ${MCP_PROFILE})."

# 4. Start services
info "Starting MarsNMe..."
cd "${INSTALL_DIR}"
docker compose up -d 2>&1 | while IFS= read -r line; do
  echo "  $line"
done

# 5. Wait for gateway
info "Waiting for gateway to start..."
max_wait=60
elapsed=0
while [ $elapsed -lt $max_wait ]; do
  if curl -sf http://127.0.0.1:18790/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
  elapsed=$((elapsed + 2))
done

if [ $elapsed -ge $max_wait ]; then
  warn "Gateway did not respond within ${max_wait}s."
  info "Check logs: cd ${INSTALL_DIR} && docker compose logs marsnme"
  exit 1
fi

# 6. Verify
echo ""
ok "MarsNMe is running!"
echo ""
echo -e "  ${BOLD}Endpoint:${RESET}  http://127.0.0.1:18790/mcp"
echo -e "  ${BOLD}Health:${RESET}    http://127.0.0.1:18790/health"
echo -e "  ${BOLD}Profile:${RESET}   ${MCP_PROFILE}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "  1. Connect your MCP client to ${CYAN}http://127.0.0.1:18790/mcp${RESET}"
echo "  2. See client guides: https://github.com/Marsmanleo/MarsNMe#mcp-client-connection-guide"
echo ""
echo -e "  ${BOLD}Manage:${RESET}"
echo -e "  Stop:     cd ${INSTALL_DIR} && docker compose down"
echo -e "  Logs:     cd ${INSTALL_DIR} && docker compose logs -f marsnme"
echo -e "  Update:   curl -fsSL https://marsnme.com/install.sh | bash"
echo ""
