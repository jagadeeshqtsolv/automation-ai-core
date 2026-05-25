# automation-ai-core

Shared libraries for the Automation AI platform. This repo contains two npm packages published to GitHub Packages:

| Package | Folder | Purpose |
|---------|--------|---------|
| `@jagadeeshqtsolv/core` | `/` (root) | Zod schemas, platform types, test-step actions — consumed by the platform API and the web-support library |
| `@jagadeeshqtsolv/web-support` | `web/` | Playwright fixtures, locator helpers, action helpers, data generators, DOM capture script — consumed by per-project Playwright frameworks |

---

## Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- A **GitHub personal access token (PAT)** with `read:packages` (to install) and `write:packages` (to publish) scopes

---

## Authentication — GitHub Packages

Both packages are hosted on GitHub Packages under the `@jagadeeshqtsolv` scope. You must authenticate before installing or publishing.

### 1. Create a PAT

Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens** (or classic tokens) and generate one with:
- `read:packages` — required to install
- `write:packages` — required to publish

### 2. Log in via npm

```bash
npm login --registry=https://npm.pkg.github.com --scope=@jagadeeshqtsolv
```

Enter your GitHub username, the PAT as the password, and your email.

### 3. Or add a project-level `.npmrc`

Create (or append to) `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=YOUR_PAT_HERE
@jagadeeshqtsolv:registry=https://npm.pkg.github.com
```

---

## Project structure

```
automation-ai-core/
├── src/                         # @jagadeeshqtsolv/core source
│   ├── index.ts                 # re-exports everything
│   ├── schemas.ts               # Zod validation schemas for all API bodies
│   ├── project-platform.ts      # ProjectPlatformType enum (web | mobile)
│   └── test-step-actions.ts     # Canonical list of test step actions
├── web/                         # @jagadeeshqtsolv/web-support package
│   ├── src/
│   │   ├── fixtures.ts          # Playwright test & expect re-exports
│   │   ├── web-locate.ts        # webLocator() — unified element locator
│   │   └── web-actions.ts       # webClick(), webFill(), webAssert() etc.
│   ├── utils/
│   │   └── data-utils.ts        # dataUtils — faker-based random data generators
│   ├── scripts/
│   │   └── capture-dom.mjs      # DOM capture script for the browser recorder
│   └── package.json
├── dist/                        # compiled output (gitignored, built before publish)
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## Setup

### Install dependencies for both packages

```bash
# Root package (@jagadeeshqtsolv/core)
npm install

# Web-support package (@jagadeeshqtsolv/web-support)
cd web && npm install && cd ..
```

---

## Build

Only `@jagadeeshqtsolv/core` has a TypeScript build step. `@jagadeeshqtsolv/web-support` ships TypeScript source directly (no compile step needed).

```bash
# From the repo root
npm run build
```

This runs `tsc -p tsconfig.build.json` and writes compiled JS + type declarations to `dist/`.

---

## Publish

### Publish `@jagadeeshqtsolv/core`

```bash
# From the repo root
npm version patch   # or minor / major
npm publish
```

`prepublishOnly` runs `npm run build` automatically before publishing.

### Publish `@jagadeeshqtsolv/web-support`

```bash
cd web
npm version patch   # or minor / major
npm publish
cd ..
```

No build step — the `files` field in `web/package.json` publishes `src/`, `utils/`, and `scripts/` as-is.

---

## Using the packages in another project

### Install

Add to your project's `.npmrc`:

```
@jagadeeshqtsolv:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_PAT_HERE
```

Then install:

```bash
# Core schemas and types
npm install @jagadeeshqtsolv/core

# Playwright web support (add as a file: dep or from registry)
npm install @jagadeeshqtsolv/web-support
```

### Using `@jagadeeshqtsolv/core`

```typescript
import { createProjectBodySchema, projectPlatformTypeSchema } from "@jagadeeshqtsolv/core";

// Validate API request body
const result = createProjectBodySchema.safeParse(req.body);

// Use platform type
import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
const platform: ProjectPlatformType = "web";
```

### Using `@jagadeeshqtsolv/web-support` in Playwright tests

```typescript
// support/fixtures.ts
export * from "@jagadeeshqtsolv/web-support/fixtures";

// support/web-actions.ts
export * from "@jagadeeshqtsolv/web-support/web-actions";

// support/web-locate.ts
export * from "@jagadeeshqtsolv/web-support/web-locate";
```

#### Locating elements

```typescript
import { webLocator } from "@jagadeeshqtsolv/web-support/web-locate";

const spec = { strategy: "label", value: "Email address" };
const locator = webLocator(page, spec);
```

#### Performing actions

```typescript
import { webClick, webFill, webAssertVisible } from "@jagadeeshqtsolv/web-support/web-actions";

await webFill(page, { strategy: "label", value: "Email" }, "user@example.com");
await webClick(page, { strategy: "role", value: "button", role: "button" });
await webAssertVisible(page, { strategy: "text", value: "Dashboard" });
```

#### Generating random test data

```typescript
import { dataUtils } from "@jagadeeshqtsolv/web-support/data-utils";

const email    = dataUtils.email();
const password = dataUtils.password(16);
const name     = dataUtils.fullName();
const phone    = dataUtils.phone();
```

---

## Development workflow

1. Make changes in `src/` or `web/src/`
2. Build core if you changed `src/`: `npm run build`
3. Bump the version: `npm version patch` (in root and/or `web/`)
4. Publish: `npm publish` (in root and/or `web/`)
5. In the consuming platform repo, update the version in `package.json` and run `npm install`

---

## Package versions

| Package | Registry |
|---------|----------|
| `@jagadeeshqtsolv/core` | [GitHub Packages](https://github.com/jagadeeshqtsolv/automation-ai-core/pkgs/npm/core) |
| `@jagadeeshqtsolv/web-support` | [GitHub Packages](https://github.com/jagadeeshqtsolv/automation-ai-core/pkgs/npm/web-support) |
