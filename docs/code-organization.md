# Code Organization

Pulsete should be organized around product responsibilities, not around an
arbitrary file length target.

## File Size

- Keep a workflow together when the code reads as one cohesive idea.
- Split a file when it has multiple responsibilities, not just because it is
  longer than 250 lines.
- Treat files over 250 lines as a review signal. The file may stay that size
  when the responsibility is still clear.
- Treat files over 500 lines as a hard stop. Either split the responsibility or
  make an explicit team decision that the file should remain whole.

## Tests

- Name test files after the behavior or scenario they cover.
- Do not add numbered `part-*` test shards for new coverage.
- When existing numbered shards are touched, rename or merge them into
  scenario-named test files as part of the same change when it is low risk.

## Refactoring

- Prefer one clear workflow entry point plus focused helpers over many tiny
  files that must be opened together to understand one behavior.
- Keep broad source reorganizations out of unrelated feature work.
- When a change exposes an artificial split, clean up the touched area instead
  of starting a repo-wide reshuffle.
