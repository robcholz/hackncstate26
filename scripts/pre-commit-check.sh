#!/usr/bin/env bash
set -euo pipefail

npm run format
npm run build
npm run test
npm run test:coverage
npm run lint

ruff check renderer-server
ruff format --check renderer-server
python3 renderer-server/test.py
python3 -m compileall -q renderer-server
TRACE_IGNORE_DIRS="$(python3 -c 'import os,sysconfig; print(os.pathsep.join(filter(None, [sysconfig.get_path("stdlib"), sysconfig.get_path("platstdlib")])))')"
python3 -m trace --count --summary -C renderer-server/.tracecov --ignore-dir="$TRACE_IGNORE_DIRS" renderer-server/test.py
