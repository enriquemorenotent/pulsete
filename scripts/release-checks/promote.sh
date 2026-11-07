#!/usr/bin/env bash
set -euo pipefail
[[ "$CANDIDATE_RUN_ID" =~ ^[0-9]+$ ]]
[[ "$EXPECTED_SHA256" =~ ^[0-9a-f]{64}$ ]]

gh api "repos/$GH_REPO/actions/runs/$CANDIDATE_RUN_ID" > run.json
jq -e '.conclusion == "success" and .status == "completed"
  and .event == "workflow_dispatch" and .head_branch == "main"
  and .path == ".github/workflows/desktop-release.yml"' run.json
commit="$(jq -r '.head_sha' run.json)"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]]
gh api "repos/$GH_REPO/contents/package.json?ref=$commit" \
  --jq '.content' | base64 --decode > package.json
version="$(jq -r '.version' package.json)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]

gh run download "$CANDIDATE_RUN_ID" \
  --name pulsete-linux-amd64-deb --dir candidate
gh run download "$CANDIDATE_RUN_ID" \
  --name release-verification --dir verification
# shellcheck disable=SC2016
jq -e --arg commit "$commit" --arg sha256 "$EXPECTED_SHA256" \
  '.commit == $commit and .sha256 == $sha256 and
   .fresh == "passed" and .upgrade == "passed"' verification/verification.json
test "$(cat verification/fresh.exit)" = 0
test "$(cat verification/upgrade.exit)" = 0
baseline=$(jq -r .baseline verification/verification.json)
test "$(gh release view --json tagName --jq .tagName)" = "$baseline"
test "$(sha256sum candidate/baseline/baseline.deb | awk '{print $1}')" = \
  "$(jq -r .baseline_sha256 verification/verification.json)"
mapfile -t packages < <(find candidate/release -maxdepth 1 -type f -name '*.deb')
test "${#packages[@]}" -eq 1
package="${packages[0]}"
test "$(basename "$package")" = "pulsete_${version}_amd64.deb"
test "$(sha256sum "$package" | awk '{ print $1 }')" = "$EXPECTED_SHA256"
test "$(dpkg-deb -f "$package" Package)" = pulsete
test "$(dpkg-deb -f "$package" Version)" = "$version"
test "$(dpkg-deb -f "$package" Architecture)" = amd64

# Also reject an existing release record (including drafts without a tag).
gh api --paginate "repos/$GH_REPO/releases" --jq '.[].tag_name' > releases.txt
if grep -Fxq "v$version" releases.txt; then exit 1; fi
# Refuse to replace an existing release or move an existing tag.
gh api "repos/$GH_REPO/git/matching-refs/tags/v$version" > refs.json
jq -e --arg ref "refs/tags/v$version" \
  'all(.[]; .ref != $ref)' refs.json
# shellcheck disable=SC2016 # Markdown backticks are literal.
printf 'Tested Ubuntu amd64 package from commit `%s`.\n\nSHA-256: `%s`\n' \
  "$commit" "$EXPECTED_SHA256" > notes.md
echo "tag=v$version" >> "$GITHUB_OUTPUT"
echo "sha256=$EXPECTED_SHA256" >> "$GITHUB_OUTPUT"
# The workflow token prevents the newly created tag from triggering a rebuild.
gh release create "v$version" "$package" --target "$commit" \
  --title "Pulsete $version" --notes-file notes.md --latest
