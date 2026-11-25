# Features

What a user can do in BankApp, screen by screen. The README has the short list and the usage guide.

## Accounts

- Several bank accounts, each with a type (checking, savings, investment), a bank name and a balance.
- Accounts can be reordered and set as default.
- Savings accounts change only through transfers, never through manual entry or CSV import.
- Transfers between two accounts create the matching operation on each side.

## Transactions

- Manual entry and editing; date, tiers (the payee), details, amount, category, type and reconciliation flag.
- Search with accent-insensitive matching; filters by date, category and type; paging: 100 per page by default, up to 500.
- Bulk actions: categorize, delete a selection, delete a month, reconcile.
- Trash: deleted operations stay recoverable for 30 days.
- A locked opening balance cannot be edited or deleted.

## Import and export

- CSV import (`;`-separated, columns `Date`, `Tiers`, `Amount`, optional details), up to 50 MB per file.
  **Each line becomes an operation. Importing the same file twice creates duplicates: there is no check yet.**
- CSV and PDF export of a filtered list.

## Categories and rules

- Custom categories with colours.
- Categorization rules: a tiers pattern and an optional details pattern (several alternatives separated by `|`).
  Rules can be applied to existing operations as a preview first.

## Scheduled operations

- Recurring operations: frequency (monthly, quarterly, biannual, annual), day of month, weekend shift, end date or
  number of occurrences.
- Generation of the next month's operations, manually or automatically on the trigger day.
- Holidays are taken into account for business-day shifts (Easter and its Monday, Ascension, Pentecost Monday).
- A monthly projection view shows the expected balance.

## Budgets

- Monthly budget per category, with the amount spent against it.

## Statistics

- Spending and income by category and over time, with charts.

## Backups and restore

- Any user can snapshot their account data and restore it later (safety snapshots are created before a restore).
- A restore goes either into the current account (replacing the chosen data) or into a new account.
- Admins can create, list, download, restore and delete full database backups. The dialog lists every level
  (daily, weekly, monthly, manual, before a server restore) and states the policy applied to each.
- Full-database restores are admin only.

## Security

- Password sign-in, with an optional second factor (authenticator app, recovery codes, trusted device for 20 days).
- Automatic lock after 15 minutes; the password unlocks the screen.
- Admin area: user list, rename, password and second-factor resets, account deletion.
- Every backup is encrypted at rest.

## Interface

- French and English, switchable in the app.
- Light and dark themes, with an optional schedule for the dark theme.
- Version and build information in the "À propos" dialog.
