#!/usr/bin/env bash
set -eu

ruff check renderer-server
ruff format --check renderer-server
python3 renderer-server/test.py
python3 -m compileall -q renderer-server
python3 -m trace --count --summary -C renderer-server/.tracecov --ignore-dir=/opt/homebrew:/usr/local renderer-server/test.py
