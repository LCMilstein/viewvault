#!/bin/zsh
set -euo pipefail
SRC="${1:?Usage: gen_app_icons.sh /path/to/1024.png}"
DEST="/Users/leemilstein/Documents/CineSync/cinesyncios/ios/WatchlistApp/Images.xcassets/AppIcon.appiconset"
mkdir -p "$DEST"
function mk() { sips -s format png -Z "$2" "$SRC" --out "$DEST/$1" >/dev/null; }

# iPhone
mk "Icon-App-20x20@2x.png" 40
mk "Icon-App-20x20@3x.png" 60
mk "Icon-App-29x29@2x.png" 58
mk "Icon-App-29x29@3x.png" 87
mk "Icon-App-40x40@2x.png" 80
mk "Icon-App-40x40@3x.png" 120
mk "Icon-App-60x60@2x.png" 120
mk "Icon-App-60x60@3x.png" 180

# iPad
mk "Icon-App-20x20~ipad.png" 20
mk "Icon-App-20x20@2x~ipad.png" 40
mk "Icon-App-29x29~ipad.png" 29
mk "Icon-App-29x29@2x~ipad.png" 58
mk "Icon-App-40x40~ipad.png" 40
mk "Icon-App-40x40@2x~ipad.png" 80
mk "Icon-App-76x76~ipad.png" 76
mk "Icon-App-76x76@2x~ipad.png" 152
mk "Icon-App-83.5x83.5@2x~ipad.png" 167

# Marketing 1024
cp "$SRC" "$DEST/Icon-App-1024x1024@1x.png"

# Contents.json
cat > "$DEST/Contents.json" <<'JSON'
{
  "images" : [
    { "size": "20x20", "idiom": "iphone", "filename": "Icon-App-20x20@2x.png", "scale": "2x" },
    { "size": "20x20", "idiom": "iphone", "filename": "Icon-App-20x20@3x.png", "scale": "3x" },
    { "size": "29x29", "idiom": "iphone", "filename": "Icon-App-29x29@2x.png", "scale": "2x" },
    { "size": "29x29", "idiom": "iphone", "filename": "Icon-App-29x29@3x.png", "scale": "3x" },
    { "size": "40x40", "idiom": "iphone", "filename": "Icon-App-40x40@2x.png", "scale": "2x" },
    { "size": "40x40", "idiom": "iphone", "filename": "Icon-App-40x40@3x.png", "scale": "3x" },
    { "size": "60x60", "idiom": "iphone", "filename": "Icon-App-60x60@2x.png", "scale": "2x" },
    { "size": "60x60", "idiom": "iphone", "filename": "Icon-App-60x60@3x.png", "scale": "3x" },

    { "size": "20x20", "idiom": "ipad", "filename": "Icon-App-20x20~ipad.png", "scale": "1x" },
    { "size": "20x20", "idiom": "ipad", "filename": "Icon-App-20x20@2x~ipad.png", "scale": "2x" },
    { "size": "29x29", "idiom": "ipad", "filename": "Icon-App-29x29~ipad.png", "scale": "1x" },
    { "size": "29x29", "idiom": "ipad", "filename": "Icon-App-29x29@2x~ipad.png", "scale": "2x" },
    { "size": "40x40", "idiom": "ipad", "filename": "Icon-App-40x40~ipad.png", "scale": "1x" },
    { "size": "40x40", "idiom": "ipad", "filename": "Icon-App-40x40@2x~ipad.png", "scale": "2x" },
    { "size": "76x76", "idiom": "ipad", "filename": "Icon-App-76x76~ipad.png", "scale": "1x" },
    { "size": "76x76", "idiom": "ipad", "filename": "Icon-App-76x76@2x~ipad.png", "scale": "2x" },
    { "size": "83.5x83.5", "idiom": "ipad", "filename": "Icon-App-83.5x83.5@2x~ipad.png", "scale": "2x" },

    { "size": "1024x1024", "idiom": "ios-marketing", "filename": "Icon-App-1024x1024@1x.png", "scale": "1x" }
  ],
  "info" : { "version" : 1, "author" : "xcode" }
}
JSON

echo "App icons and Contents.json written to: $DEST"
