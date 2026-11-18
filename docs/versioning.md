# Versioning

The application version lives in the root file `VERSION` (SemVer `MAJOR.MINOR.PATCH`). The backend
reads it at startup and shows it in the "À propos" dialog (`GET /api/about`).

## When to change which number

- **PATCH** (1.0.0 → 1.0.1): bug fixes, no new feature, no change to data or API behaviour that a user
  would notice as a feature.
- **MINOR** (1.0.0 → 1.1.0): new feature, new screen or option, backward-compatible API or data change.
- **MAJOR** (1.0.0 → 2.0.0): incompatible change: data migration a user must act on, removed feature or
  API, change of the supported platform (e.g. a new major of PostgreSQL or Node).

## Process

1. Put every change in `CHANGELOG.md` under `## [Unreleased]`, in the sections Added / Changed / Fixed /
   Removed, in the same commit as the change.
2. Release: `scripts/bump-version.sh patch|minor|major`. It updates `VERSION`, moves the Unreleased
   entries under a dated heading and creates an empty Unreleased section.
3. Commit the result as `Release X.Y.Z`, tag it `vX.Y.Z` and push.
4. On a server, set `GIT_COMMIT` to the deployed commit before `docker compose up --build`, so the
   "À propos" dialog shows the exact build.
