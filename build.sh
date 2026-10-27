#!/bin/sh
# 分割ソースを1枚のHTMLに結合する
cd "$(dirname "$0")"

# --- 本体 ---
cat src/00-head.html \
    src/10-config.js \
    src/20-logic.js \
    src/30-scene.js \
    src/22-sound.js \
    src/90-boot.js \
    src/99-tail.html > mole-tease.html
cp mole-tease.html index.html   # GitHub Pages はルートの index.html を配信する

# --- 検証ページ（three.js を使わない部分だけ） ---
cat src/verify-head.html \
    src/10-config.js \
    src/20-logic.js \
    src/verify-tests.js \
    src/verify-tests-p2.js \
    src/verify-tests-p3.js \
    src/verify-sum.js \
    src/99-tail.html > verify.html

echo "built mole-tease.html + index.html ($(wc -c < mole-tease.html 2>/dev/null) bytes)"
echo "built verify.html ($(wc -c < verify.html) bytes)"
