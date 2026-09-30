# Agent Instructions

## CI Checks

Before completing a task, make sure that all local checks pass successfully:

- [ ] **Build packages:** `vp run -r build` (runs `vp pack` in each package, including `publint` and `@arethetypeswrong/core` checks)
- [ ] **Format, lint & type-check:** `vp check`
- [ ] **Run tests:** `vp test`
