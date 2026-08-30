#!/usr/bin/env bash
# Publishes the production build to the gh-pages branch (GitHub Pages source).
#
# Usage:  npm run deploy:pages
#
# The branch holds only the contents of dist/, so the published site is exactly
# what `npm run build` produced. History on gh-pages is intentionally replaced
# on every deploy; main keeps the real project history.
set -euo pipefail

REMOTE="${DEPLOY_REMOTE:-origin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run build

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp -r dist/. "$WORK/"
touch "$WORK/.nojekyll"   # keep GitHub Pages from filtering the asset folders

cd "$WORK"
git init -q -b gh-pages
git add -A
git commit -q -m "deploy: production build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q -f "$(git -C "$ROOT" remote get-url "$REMOTE")" gh-pages

echo "Published dist/ to the gh-pages branch of $REMOTE."
