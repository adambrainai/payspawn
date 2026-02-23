#!/bin/bash
# PaySpawn × OpenAgentMarket — Clean Demo Script
# Designed for terminal recording with asciinema
# Run via: ./record.sh

set -e

ORANGE='\033[38;5;208m'
WHITE='\033[1;37m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'
BOLD='\033[1m'

pause() { sleep "${1:-1.5}"; }

clear
echo ""
echo -e "${ORANGE}${BOLD}  ██████╗  █████╗ ██╗   ██╗███████╗██████╗  █████╗ ██╗    ██╗███╗   ██╗${RESET}"
echo -e "${ORANGE}${BOLD}  ██╔══██╗██╔══██╗╚██╗ ██╔╝██╔════╝██╔══██╗██╔══██╗██║    ██║████╗  ██║${RESET}"
echo -e "${ORANGE}${BOLD}  ██████╔╝███████║ ╚████╔╝ ███████╗██████╔╝███████║██║ █╗ ██║██╔██╗ ██║${RESET}"
echo -e "${ORANGE}${BOLD}  ██╔═══╝ ██╔══██║  ╚██╔╝  ╚════██║██╔═══╝ ██╔══██║██║███╗██║██║╚██╗██║${RESET}"
echo -e "${ORANGE}${BOLD}  ██║     ██║  ██║   ██║   ███████║██║     ██║  ██║╚███╔███╔╝██║ ╚████║${RESET}"
echo -e "${ORANGE}${BOLD}  ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚══╝╚══╝ ╚═╝  ╚═══╝${RESET}"
echo ""
echo -e "${DIM}  Agent-to-agent payments. On-chain limits. Math doesn't negotiate.${RESET}"
echo ""
pause 2

echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo -e "${ORANGE}  THE SETUP${RESET}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  @applefather_eth showed this vision:"
echo ""
echo -e "  ${DIM}\"The Aave Agent builds the unsigned tx, never touches Grok's keys.\"${RESET}"
echo -e "  ${DIM} — 72 likes, 11 retweets. Great vision.${RESET}"
echo ""
pause 2
echo -e "  ${YELLOW}But one thing was missing from the demo:${RESET}"
echo ""
echo -e "  ${WHITE}→ WHO signed that tx? What wallet?${RESET}"
echo -e "  ${WHITE}→ WHAT stopped the agent from spending more than it should?${RESET}"
echo -e "  ${WHITE}→ HOW does the Aave Agent know the payment is real?${RESET}"
echo ""
pause 2.5
echo -e "  ${ORANGE}We completed it. Here's the proof.${RESET}"
echo ""
pause 2

echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo -e "${ORANGE}  CREDENTIAL${RESET} (Echo, V5.3)${RESET}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  ${DIM}Decoding Echo's PaySpawn V5.3 credential...${RESET}"
pause 1

python3 - << 'PYEOF'
import base64, json
cred = "eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0="
d = json.loads(base64.b64decode(cred))
p = d['permission']
print(f"  account:   {p['account']}")
print(f"  spender:   {p['spender']}  ← V5.3")
print(f"  allowance: ${int(p['allowance'])/1e6:.2f} USDC / day")
print(f"  fee:       $0.005 per tx (enforced by contract)")
print(f"  maxPerTx:  unlimited")
print(f"  allowedTo: any address")
PYEOF

pause 2

echo ""
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo -e "${ORANGE}  STEP 1${RESET} — HIRE LIVE AAVE AGENT VIA XMTP${RESET}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  ${DIM}Agent XMTP: 0x789217581390b9Fb0480765c1b5Ba7a6C3C34d71${RESET}"
echo -e "  ${DIM}Task:       aave_best_yield${RESET}"
echo -e "  ${DIM}Price:      free (Aave Agent is open source)${RESET}"
echo ""

# Run hirer against live Aave agent (free, no payment needed)
PAYSPAWN_CREDENTIAL="eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=" \
PAYSPAWN_API="https://payspawn.ai/api" \
npx tsx hire-live-agent.ts aave 2>&1 | grep -v "^\[" | grep -v "^$" | sed 's/^/  /'

pause 1.5

echo ""
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo -e "${ORANGE}  STEP 2${RESET} — FULL PAYMENT FLOW (V5.3, \$0.005 FEE, ON-CHAIN)${RESET}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  ${DIM}Now showing the payment flow. Worker demands \$0.005.${RESET}"
echo -e "  ${DIM}PaySpawn V5.3 credential pays it. V5.3 contract enforces the fee.${RESET}"
echo -e "  ${DIM}Worker verifies the receipt cryptographically before executing.${RESET}"
echo ""
pause 1.5

# Kill any old worker, start fresh
pkill -f "tsx worker.ts" 2>/dev/null || true
sleep 1

WORKER_MNEMONIC="client peasant language subway cushion hint plunge elbow cigar identify true addict" \
  npx tsx worker.ts &
WORKER_PID=$!
sleep 20

echo -e "  ${GREEN}✅ Worker running at 0x3A91c04958A7e02e778334D02F0a7DA5aD562850${RESET}"
echo ""
pause 1

WORKER_ADDRESS="0x3A91c04958A7e02e778334D02F0a7DA5aD562850" \
PAYSPAWN_CREDENTIAL="eyJzaWduYXR1cmUiOiJFT0EiLCJwZXJtaXNzaW9uIjp7ImFjY291bnQiOiIweDRlQjFiOERkNmVjY0JFNGZFNTljMGMyNWVhQWNGNjU2NEI1ZTA0ODIiLCJzcGVuZGVyIjoiMHhhYThlNjgxNWIwRThhMzAwNkRFZTBjMzE3MUNmOUNBMTY1ZmQ4NjJlIiwidG9rZW4iOiIweDgzMzU4OWZDRDZlRGI2RTA4ZjRjN0MzMkQ0ZjcxYjU0YmRBMDI5MTMiLCJhbGxvd2FuY2UiOiIxMDAwMDAwMCIsInBlcmlvZCI6ODY0MDAsInN0YXJ0IjoxNzcxODYzNDA5LCJlbmQiOjE4MDMzOTk0NjksInNhbHQiOiI3ODYzODU4ODE5MjMwNDAwMDAiLCJtYXhQZXJUeCI6IjAiLCJhbGxvd2VkVG8iOltdLCJtYXhUeFBlckhvdXIiOjAsInBhcmVudEhhc2giOiIweDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAifX0=" \
PAYSPAWN_API="https://payspawn.ai/api" \
  npx tsx hirer.ts 2>&1 | grep -v "^\[" | sed 's/^/  /'

kill $WORKER_PID 2>/dev/null || true

echo ""
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo -e "${ORANGE}  THE ANSWER${RESET}"
echo -e "${WHITE}─────────────────────────────────────────────────────────────────────${RESET}"
echo ""
echo -e "  applefather showed the vision."
echo -e "  ${ORANGE}We completed it.${RESET}"
echo ""
echo -e "  ${DIM}The unsigned tx above gets signed with a PaySpawn credential.${RESET}"
echo -e "  ${DIM}The spending limit is enforced by a smart contract.${RESET}"
echo -e "  ${DIM}The receipt is verified cryptographically — not just a txHash.${RESET}"
echo ""
echo -e "  ${WHITE}payspawn.ai  ·  @payspawn  ·  V5.3 on Base${RESET}"
echo ""
pause 3
