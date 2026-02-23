#!/bin/bash
# Record PaySpawn + Dexter x402 demo
# Usage: ./record.sh

set -e
cd "$(dirname "$0")"

CAST_FILE="payspawn-dexter-demo.cast"
GIF_FILE="payspawn-dexter-demo.gif"
COLS=108
ROWS=50

echo "🎬 Starting PaySpawn + Dexter x402 demo recording..."
echo "   Output: $CAST_FILE → $GIF_FILE"
echo "   Press Ctrl+D or wait for demo to finish."
echo ""

# Record — auto-ends when demo.sh exits
asciinema rec "$CAST_FILE" \
  --cols $COLS \
  --rows $ROWS \
  --overwrite \
  --command "bash demo.sh"

echo ""
echo "✅ Recording saved: $CAST_FILE"
echo "🎞️  Converting to GIF..."

# Convert with agg — monokai for contrast
agg "$CAST_FILE" "$GIF_FILE" \
  --cols $COLS \
  --rows $ROWS \
  --font-size 13 \
  --line-height 1.4 \
  --theme monokai

echo ""
echo "✅ GIF exported: $GIF_FILE"
echo ""
echo "📁 Files:"
ls -lh "$CAST_FILE" "$GIF_FILE" 2>/dev/null || true
echo ""

# Copy to iCloud Brain
BRAIN="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Adam's Brain"
mkdir -p "$BRAIN/brain/recordings"
DATE=$(date +%Y-%m-%d)
cp "$GIF_FILE"  "$BRAIN/brain/recordings/payspawn-dexter-x402-${DATE}.gif"  2>/dev/null || true
cp "$CAST_FILE" "$BRAIN/brain/recordings/payspawn-dexter-x402-${DATE}.cast" 2>/dev/null || true
echo "☁️  Copied to iCloud: Adam's Brain/brain/recordings/payspawn-dexter-x402-${DATE}.gif"
echo ""
echo "Share: demos/dexter/$GIF_FILE"
