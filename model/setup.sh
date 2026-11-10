#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python_bin="${RETURN_CHECK_PYTHON:-python3.12}"
"$python_bin" -c 'import sys; assert sys.version_info[:2] == (3,12), "Use Python 3.12"'
if [[ ! -x .venv/bin/python ]]; then
  "$python_bin" -m venv .venv
fi
if [[ "$(uname -s)" == Darwin && -f requirements-macos.lock.txt ]]; then
  .venv/bin/python -m pip install -r requirements-macos.lock.txt
else
  .venv/bin/python -m pip install -r requirements.txt
fi
.venv/bin/python bootstrap.py --sample
.venv/bin/python check_env.py
