#!/usr/bin/env bash
set -euo pipefail
log="$1"
# Containers have no host display or user profile. Electron requires this flag as root.
/opt/Pulsete/pulsete --no-sandbox > "$log" 2>&1 &
app_pid=$!
trap 'kill -TERM "$app_pid" 2>/dev/null || true; wait "$app_pid" || true' EXIT
for _attempt in $(seq 1 45); do
  kill -0 "$app_pid"
  # The container runs only Pulsete; inspect its loopback listener, not a fixed port.
  # shellcheck disable=SC2013 # Each line is one hexadecimal port.
  for port_hex in $(awk '$2 ~ /^0100007F:/ && $4 == "0A" {split($2,a,":"); print a[2]}' /proc/net/tcp); do
    origin="http://127.0.0.1:$((16#$port_hex))"
    if curl -fsS "$origin/" > /tmp/page.html && grep -q '<title>Pulsete</title>' /tmp/page.html; then
      asset=$(sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' /tmp/page.html | head -1)
      test -n "$asset"
      curl -fsS "$origin$asset" -o /tmp/app.js
      test -s /tmp/app.js
      xdotool search --onlyvisible --name Pulsete > /dev/null || continue
      sleep 3
      kill -0 "$app_pid"
      if grep -E 'Failed to start Pulsete|ERR_MODULE_NOT_FOUND|NODE_MODULE_VERSION|SQLITE_ERROR' "$log"; then exit 1; fi
      echo 'PASS: visible desktop window, served page and JS, process alive'
      exit 0
    fi
  done
  sleep 1
done
cat "$log"
exit 1
