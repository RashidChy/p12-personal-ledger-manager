#!/usr/bin/env bash
# Publishes the production build to the gh-pages branch (GitHub Pages source).
#
# Usage:  npm run deploy:pages
#
# The branch holds only the contents of dist/, so the published site is exactly
# what `npm run build` produced. Existing gh-pages history is preserved.
set -euo pipefail

REMOTE="${DEPLOY_REMOTE:-origin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

npm run build

WORK="$(mktemp -d)"
SITE="$WORK/site"
trap 'rm -rf "$WORK"' EXIT

REMOTE_URL="$(git remote get-url "$REMOTE")"
if git ls-remote --exit-code --heads "$REMOTE_URL" refs/heads/gh-pages >/dev/null 2>&1; then
  git clone -q --branch gh-pages --single-branch "$REMOTE_URL" "$SITE"
  git -C "$SITE" rm -r -q --ignore-unmatch .
else
  mkdir -p "$SITE"
  git -C "$SITE" init -q -b gh-pages
  git -C "$SITE" remote add origin "$REMOTE_URL"
fi

cp -R dist/. "$SITE/"
touch "$SITE/.nojekyll"   # keep GitHub Pages from filtering the asset folders

git -C "$SITE" add -A
if git -C "$SITE" diff --cached --quiet; then
  echo "The production build is already published; nothing to deploy."
  exit 0
fi

git -C "$SITE" config user.name "$(git config user.name || printf '%s' 'BinaryBros')"
git -C "$SITE" config user.email "$(git config user.email || printf '%s' 'team@localhost')"
git -C "$SITE" commit -q -m "deploy: production build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git -C "$SITE" push -q origin gh-pages

echo "Published dist/ to the gh-pages branch of $REMOTE without rewriting its history."
