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

## Database Schema

- `storage-bootstrap-schema.ts` is the fixed version-30 starting schema, also
  used by historical table-rebuild migrations. Do not update it for new features.
- Add schema changes to `storage-migration-list.ts` with a new version. New
  databases start at version 30 and run the same later migrations as existing
  databases. Existing databases keep their pre-upgrade backup behavior.
- `storage-schema-repair.ts` preserves compatibility with incomplete schemas
  accepted by older releases and restores missing search/index artifacts. It
  runs only for existing databases and must not become a second feature-upgrade
  path or replay data migrations.
