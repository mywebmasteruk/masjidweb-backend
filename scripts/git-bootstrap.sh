#!/usr/bin/env bash
# Initializes a git repo and creates the first commit (no remote).
# Run from the repository root. Requires a working `git` (accept Xcode license on macOS if needed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is not available. Install Git or run: sudo xcodebuild -license (macOS) then retry."
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
  echo "Initialized empty Git repository in $ROOT"
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit (already clean)."
else
  git commit -m "chore: initial commit — tenant admin dashboard"
fi

echo ""
echo "Next — publish to GitHub (pick one):"
echo "  1) gh auth login && gh repo create <NAME> --private --source=. --remote=origin --push"
echo "  2) Create an empty repo on github.com, then:"
echo "       git remote add origin https://github.com/<YOU>/<REPO>.git"
echo "       git branch -M main && git push -u origin main"
echo ""
