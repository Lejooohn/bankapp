# Contributing

Thanks for your interest in BankApp.

- Open an issue before a large change, so we can agree on the approach.
- Keep changes focused, and add tests for behaviour changes. Security fixes need a test that fails on the old code.
- Run the checks before opening a pull request:
  - `cd shared && npm test && npm run build`
  - `cd backend && npm test && npm run build`
  - `cd frontend && npm run build`
- Never commit `.env` files, keys, backups or database dumps.

By contributing, you agree that your contribution is licensed under the AGPL-3.0 (see `LICENSE`).
