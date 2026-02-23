#!/bin/bash
# Record the PaySpawn demo and export to GIF
# Usage: ./record.sh

set -e
cd "$(dirname "$0")"

CAST_FILE="payspawn-demo.cast"
GIF_FILE="payspawn-demo.gif"
COLS=100
ROWS=45

echo "🎬 Starting PaySpawn terminal recording..."
echo "   Output: $CAST_FILE → $GIF_FILE"
echo "   Press Ctrl+D or wait for demo to finish."
echo ""

# Record — auto-ends when demo-clean.sh exits
asciinema rec "$CAST_FILE" \
  --cols $COLS \
  --rows $ROWS \
  --overwrite \
  --command "bash demo-clean.sh"

echo ""
echo "✅ Recording saved: $CAST_FILE"
echo "🎞️  Converting to GIF..."

# Convert with agg — PaySpawn orange theme
agg "$CAST_FILE" "$GIF_FILE" \
  --cols $COLS \
  --rows $ROWS \
  --font-size 14 \
  --line-height 1.4 \
  --theme monokai

echo ""
echo "✅ GIF exported: $GIF_FILE"
echo ""
echo "📁 Files:"
ls -lh "$CAST_FILE" "$GIF_FILE"
echo ""
echo "Share: demos/openagentmarket/$GIF_FILE"
# Copy to iCloud Brain for easy access
BRAIN="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Adam's Brain"
mkdir -p "$BRAIN/brain/recordings"
cp "$GIF_FILE"  "$BRAIN/brain/recordings/$(basename $GIF_FILE .gif)-$(date +%Y-%m-%d).gif"
cp "$CAST_FILE" "$BRAIN/brain/recordings/$(basename $CAST_FILE .cast)-$(date +%Y-%m-%d).cast"
echo "☁️  Copied to iCloud: Adam's Brain/brain/recordings/"

