#!/bin/sh
set -e

cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "Git hooks installed."
