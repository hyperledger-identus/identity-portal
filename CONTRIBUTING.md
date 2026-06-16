# Contributing

Thank you for contributing to Identity Portal.

## Development Workflow

1. Create a topic branch from `main`.
2. Keep changes small and reviewable.
3. Run the checks before opening a pull request:

   ```sh
   npm run lint
   npm run typecheck
   npm run build
   ```

4. Sign every commit with DCO:

   ```sh
   git commit -s
   ```

5. Prefer draft pull requests for early design or architecture feedback.

## Architecture Guidelines

- Keep SSI workflow logic in framework-agnostic TypeScript packages.
- Keep service adapters separate from UI code.
- Keep the React application thin and focused on composition.
- Do not introduce UI component kits. Use Tailwind CSS and small project-owned
  components.
- Default to offline-first behavior. Cloud Agent integration must remain
  optional and driven by configuration.

## Commit Requirements

All commits must be signed off with the Developer Certificate of Origin:

```text
Signed-off-by: Your Name <your.email@example.com>
```

Maintainers may also require GPG-signed commits for protected branches.
