#!/bin/bash
set -e

cd "$(dirname "$0")/.."

APP_NAME="Stack"
ARCH="aarch64"
VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version" 2>/dev/null || grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
DMG_NAME="${APP_NAME}_${VERSION}_${ARCH}.dmg"
APP_PATH="src-tauri/target/release/bundle/macos/${APP_NAME}.app"
OUTPUT_DIR="src-tauri/target/release/bundle/dmg"
STAGING_DIR="/tmp/dmg-staging-${APP_NAME}"

if ! command -v create-dmg &> /dev/null; then
  echo "Error: create-dmg not found. Install it with: brew install create-dmg"
  exit 1
fi

echo "Building ${APP_NAME} v${VERSION}..."
npm run tauri build -- --bundles app

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/$DMG_NAME"
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

cp -r "$APP_PATH" "$STAGING_DIR/"
cp "dmg-assets/Install Instructions.txt" "$STAGING_DIR/"

create-dmg \
  --volname "$APP_NAME" \
  --background "src-tauri/icons/dmg-bg-gray-dots.png" \
  --window-pos 200 120 \
  --window-size 660 400 \
  --icon-size 100 \
  --icon "${APP_NAME}.app" 180 170 \
  --hide-extension "${APP_NAME}.app" \
  --app-drop-link 480 170 \
  --icon "Install Instructions.txt" 330 310 \
  "$OUTPUT_DIR/$DMG_NAME" \
  "$STAGING_DIR"

rm -rf "$STAGING_DIR"

echo "Done: $OUTPUT_DIR/$DMG_NAME"
