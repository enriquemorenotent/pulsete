#!/usr/bin/env bash
set -euo pipefail
mode="$1"; version="$2"; expected="$3"
exec > >(tee "/results/$mode.log") 2>&1
trap 'printf "%s\n" "$?" > "/results/$mode.exit"' EXIT
export DISPLAY=:99
Xvfb :99 -screen 0 1280x820x24 > /tmp/xvfb.log 2>&1 &
for _attempt in $(seq 1 30); do xdpyinfo >/dev/null 2>&1 && break; sleep 1; done
apt-get update
if [[ "$mode" != fresh ]]; then
  apt-get install -y /packages/baseline.deb
  timeout 75s bash /checks/startup.sh "/results/$mode-baseline-startup.log"
  test -s /root/.config/pulsete/pulsete.sqlite
  sha256sum /root/.config/pulsete/pulsete.secret > /tmp/profile-secret.sha256
  mkdir -p /root/.config/pulsete
  printf 'preserve me\n' > /root/.config/pulsete/release-check-marker
fi
if [[ "$mode" == published ]]; then
  # Trust the key shipped in the baseline package; never fetch a replacement key.
  test -s /etc/apt/sources.list.d/pulsete.sources
  test -s /usr/share/keyrings/pulsete-archive-keyring.gpg
  cat /etc/apt/sources.list.d/pulsete.sources
  # Pages/CDN propagation can lag behind the deploy API. Fail after five minutes.
  ready=false
  for _attempt in $(seq 1 30); do
    if apt-get update -o APT::Update::Error-Mode=any &&
       [[ "$(apt-cache policy pulsete | awk '/Candidate:/ {print $2}')" == "$version" ]]; then
      ready=true; break
    fi
    sleep 10
  done
  "$ready"
  cd /tmp
  apt-get download "pulsete=$version"
  echo "$expected  pulsete_${version}_amd64.deb" | sha256sum -c -
  sha256sum "pulsete_${version}_amd64.deb" > /results/published-download.sha256
  # Normal APT upgrade, with no version pin or local package path.
  apt-get upgrade -y
else
  echo "$expected  /packages/candidate.deb" | sha256sum -c -
  apt-get install -y /packages/candidate.deb
fi
test "$(dpkg-query -W -f='${Version}' pulsete)" = "$version"
if [[ "$mode" != fresh ]]; then
  sha256sum -c /tmp/profile-secret.sha256
  grep -qx 'preserve me' /root/.config/pulsete/release-check-marker
fi
timeout 75s bash /checks/startup.sh "/results/$mode-startup.log"
python3 - <<'PYTHON'
import sqlite3
with sqlite3.connect('/root/.config/pulsete/pulsete.sqlite') as db:
    assert db.execute('PRAGMA quick_check').fetchone() == ('ok',)
PYTHON
echo "PASS: $mode $version"
