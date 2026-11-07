#!/usr/bin/env bash
set -euo pipefail
mkdir -p baseline
tag=$(gh release view --repo "$GITHUB_REPOSITORY" --json tagName --jq .tagName)
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
gh release download "$tag" --repo "$GITHUB_REPOSITORY" --pattern "pulsete_${tag#v}_amd64.deb" --dir baseline
mv "baseline/pulsete_${tag#v}_amd64.deb" baseline/baseline.deb
test "$(dpkg-deb -f baseline/baseline.deb Version)" = "${tag#v}"
printf '%s\n' "$tag" > baseline/tag.txt
