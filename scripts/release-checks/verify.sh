#!/usr/bin/env bash
# Host entrypoint: installs packages ONLY inside disposable Docker containers.
set -euo pipefail
mode="$1"; candidate=$(realpath "$2"); baseline=$(realpath "$3"); results=$(realpath -m "$4")
[[ "$mode" == candidate || "$mode" == published ]]
mkdir -p "$results"
version=$(dpkg-deb -f "$candidate" Version)
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
for package in "$candidate" "$baseline"; do
  test "$(dpkg-deb -f "$package" Package)" = pulsete
  test "$(dpkg-deb -f "$package" Architecture)" = amd64
done
dpkg --compare-versions "$(dpkg-deb -f "$baseline" Version)" lt "$version"
expected=$(sha256sum "$candidate" | awk '{print $1}')
sha256sum "$candidate" "$baseline" > "$results/packages.sha256"
docker build -t pulsete-release-check -f scripts/release-checks/Dockerfile .
checks=(fresh upgrade)
if [[ "$mode" == published ]]; then checks=(published); fi
for check in "${checks[@]}"; do
  docker run --rm --shm-size=256m \
    --mount "type=bind,src=$candidate,dst=/packages/candidate.deb,readonly" \
    --mount "type=bind,src=$baseline,dst=/packages/baseline.deb,readonly" \
    --mount "type=bind,src=$results,dst=/results" \
    pulsete-release-check "$check" "$version" "$expected"
done
