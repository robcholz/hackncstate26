#!/usr/bin/env bash
set -euo pipefail

npm run format
npm run build
npm run test
npm run test:coverage
npm run lint
