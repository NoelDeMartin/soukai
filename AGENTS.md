# Agent Instructions

## CI Checks

Before completing a task, make sure that all local checks pass successfully:

- [ ] **Build project:** `pnpm build`
- [ ] **Lint & format:** `pnpm lint` (runs ESLint, Prettier-ESLint, and `tsc --noEmit`)
- [ ] **Run tests:** `pnpm test:ci` (runs Vitest in CI mode)
- [ ] **Verify package structure:** `pnpm verify` (runs `publint` and `@arethetypeswrong/cli`)
