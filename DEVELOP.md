# DEVELOP.md

This document provides guidelines for developing in this repo. It covers setup, workflows, and processes for building, testing, and publishing.

## Tooling

1. **pnpm** - Package management
2. **tsdown** - TypeScript build tool
3. **Jest** - Testing framework
4. **Prettier** - Code formatting (with pre-commit hook via husky + lint-staged)
5. **Changesets** - Version management and publishing

## Project Configuration

- **TypeScript**: Configuration in `tsconfig.json`
- **tsdown**: Build configuration in `tsdown.config.ts`
- **Jest**: Test configuration in `jest.config.ts`

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) - version 22.22 or higher
- [pnpm](https://pnpm.io/) - version 10.29.3 or higher
- [Git](https://git-scm.com/) (LOL, if you don't have this, we have bigger problems)

## Setup

1. Clone the repository:

    ```bash
    git clone <repository-url>
    cd machina
    ```

2. Install dependencies:

    ```bash
    pnpm install
    ```

3. Build:
    ```bash
    pnpm build
    ```

## Development Workflow

### Building

```bash
pnpm build
```

This uses [tsdown](https://github.com/rolldown/tsdown) to transpile TypeScript source in `src/` to CJS + ESM output in `dist/`, along with declaration files.

### Testing

```bash
pnpm test
```

### Formatting

Prettier runs automatically on commit via a pre-commit hook (husky + lint-staged). To format manually:

```bash
pnpm prettier --write .
```

## Versioning and Publishing

The repo uses [Changesets](https://github.com/changesets/changesets) to manage versions and publish.

### Creating a Changeset

When you make changes that need to be released:

1. Create a changeset:

```bash
pnpm changeset
```

2. Follow the interactive prompts to:
    - Specify the type of change (major, minor, patch)
    - Provide a description of the changes

This creates a changeset file in the `.changeset` directory that will be used during the version and publish process. You don't commit the changeset file to the repo. You'd move on to the next step (version).

### Versioning

To update the version based on changesets:

```bash
pnpm changeset version
```

This command:

- Reads all changesets
- Updates the package version
- Generates or updates CHANGELOG.md

At this point you can commit to main if needed, however, changeset is also supposed to handle this for you in the release step.

### Publishing

To publish to npm:

```bash
pnpm changeset publish
```

This will:

1. Build via the `prepack` script
2. Publish the package to npm

### Adding a Dependency

```bash
pnpm add <dependency-name>
```

For dev dependencies:

```bash
pnpm add -D <dependency-name>
```

## Additional Resources

- [pnpm Documentation](https://pnpm.io/)
- [Changesets Documentation](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
