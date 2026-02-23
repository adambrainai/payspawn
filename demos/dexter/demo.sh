#!/usr/bin/env bash
# PaySpawn + Dexter x402 Demo
# Runs hirer.ts against live payspawn.ai endpoint
# Record with: ./record.sh

set -e

ORANGE='\033[38;5;208m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'
GREEN='\033[32m'
WHITE='\033[97m'
CYAN='\033[36m'

DEMOS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$DEMOS_DIR/../.." && pwd)"

# ─── ASCII Header ───────────────────────────────────────────────────────────

clear
echo ""
echo -e "${ORANGE}${BOLD}"
cat << 'EOF'
   ██████╗  █████╗ ██╗   ██╗███████╗██████╗  █████╗ ██╗    ██╗███╗   ██╗
   ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗██╔══██╗██║    ██║████╗  ██║
   ██████╔╝███████║ ╚████╔╝ ███████╗██████╔╝███████║██║ █╗ ██║██╔██╗ ██║
   ██╔═══╝ ██╔══██║  ╚██╔╝  ╚════██║██╔═══╝ ██╔══██║██║███╗██║██║╚██╗██║
   ██║     ██║  ██║   ██║   ███████║██║     ██║  ██║╚███╔███╔╝██║ ╚████║
   ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═══╝
EOF
echo -e "${RESET}"
echo -e "  ${ORANGE}${BOLD}+ DEXTER x402 DEMO${RESET}  ${DIM}Any x402 API. One credential. No keys.${RESET}"
echo ""
echo -e "  ${DIM}payspawn.ai  ·  V5.3  ·  Base mainnet  ·  USDC${RESET}"
echo ""
sleep 1.5

# ─── Install check ───────────────────────────────────────────────────────────

echo -e "${ORANGE}${BOLD}[setup]${RESET} Checking dependencies..."
cd "$PROJECT_ROOT"

if ! command -v npx &> /dev/null; then
  echo "  ✗ npx not found. Install Node.js 18+."
  exit 1
fi

echo -e "  ${GREEN}✓ node $(node --version)${RESET}"
echo ""
sleep 0.5

# ─── Run demo ───────────────────────────────────────────────────────────────

npx ts-node \
  --project apps/web/tsconfig.json \
  --compiler-options '{"module":"commonjs","esModuleInterop":true}' \
  demos/dexter/hirer.ts

echo ""
echo -e "  ${DIM}── end of demo ──${RESET}"
echo ""
