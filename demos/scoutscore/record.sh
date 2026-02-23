#!/bin/bash
# PaySpawn + ScoutScore Demo — Recorder
# Outputs: .cast → .gif → .mp4 (X-ready)
set -e
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"

NAME="payspawn-scoutscore-demo"
CAST="$NAME.cast"
GIF="$NAME.gif"
MP4="$NAME.mp4"
COLS=100
ROWS=36
THEME="dracula"
FONT_SIZE=18
SPEED=1.3

echo "🎬 Recording PaySpawn + ScoutScore demo..."
echo "   → $CAST → $GIF → $MP4"
echo ""

# ── Record ────────────────────────────────────────────────────────────────────
asciinema rec "$CAST" \
  --cols $COLS \
  --rows $ROWS \
  --overwrite \
  --command "cd $ROOT && npx ts-node \
    --project apps/web/tsconfig.json \
    --compiler-options '{\"module\":\"commonjs\",\"esModuleInterop\":true}' \
    demos/scoutscore/hirer.ts"

echo ""
echo "✅ Recorded: $CAST  ($(wc -l < "$CAST") frames)"

# ── GIF ───────────────────────────────────────────────────────────────────────
echo "🎨 Rendering GIF ($THEME, ${FONT_SIZE}px, ${SPEED}x speed)..."
agg "$CAST" "$GIF" \
  --cols $COLS \
  --rows $ROWS \
  --theme $THEME \
  --font-size $FONT_SIZE \
  --speed $SPEED \
  --last-frame-duration 4

echo "✅ GIF: $GIF  ($(du -sh "$GIF" | cut -f1))"

# ── MP4 (X-native, sharper in feed) ───────────────────────────────────────────
echo "🎞️  Converting to MP4..."
ffmpeg -y -i "$GIF" \
  -vf "fps=20,scale=1280:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$MP4" 2>/dev/null

echo "✅ MP4: $MP4  ($(du -sh "$MP4" | cut -f1)) — ready for X upload"
echo ""
ls -lh "$CAST" "$GIF" "$MP4" 2>/dev/null
echo ""

# ── iCloud Backup ─────────────────────────────────────────────────────────────
BRAIN="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Adam's Brain"
mkdir -p "$BRAIN/brain/recordings"
DATE=$(date +%Y-%m-%d)
cp "$MP4"  "$BRAIN/brain/recordings/payspawn-scoutscore-${DATE}.mp4"  2>/dev/null && \
cp "$GIF"  "$BRAIN/brain/recordings/payspawn-scoutscore-${DATE}.gif"  2>/dev/null && \
cp "$CAST" "$BRAIN/brain/recordings/payspawn-scoutscore-${DATE}.cast" 2>/dev/null && \
echo "☁️  Backed up to iCloud Brain"
echo ""
echo "📤 Upload to X: demos/scoutscore/$MP4"
