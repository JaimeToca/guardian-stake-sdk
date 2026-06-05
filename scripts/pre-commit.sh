#!/bin/sh
set -e

echo "Running format check..."
pnpm format:check

echo "Running lint..."
pnpm lint
