# automation-ai-core

Shared libraries for the AutomationAI platform. This repo contains two npm packages published to **npmjs.com** (public, no auth required):

| Package | Folder | Purpose |
|---------|--------|---------|
| `@jagadeeshqtsolv/core` | `/` (root) | Zod schemas, platform types, test-step actions — consumed by the platform API and the web-support library |
| `@jagadeeshqtsolv/web-support` | `web/` | Playwright fixtures, locator helpers, action helpers, data generators, recorder CLI — consumed by per-project Playwright frameworks |

### Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Package diagrams, schema validation flow, webLocator decision tree, publish lifecycle |
| [docs/API.md](docs/API.md) | Full API reference — all schemas, types, functions, and web-support helpers |

---

## Prerequisites

- **Node.js** 22 or later
- **npm** 10 or later

No tokens or registry configuration needed — both packages are public on npmjs.com.

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
│   │   └── recorder-server.mjs  # Web recorder server (npx automation-ai-recorder)
│   └── package.json
├── dist/                        # compiled output (gitignored, built before publish)
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## Setup (local development)

```bash
# Clone the repo
git clone https://github.com/jagadeeshqtsolv/automation-ai-core.git
cd automation-ai-core

# Install root package deps
npm install

# Install web-support deps
cd web && npm install && cd ..
```

---

## Build

`@jagadeeshqtsolv/core` requires a TypeScript compile step. `@jagadeeshqtsolv/web-support` ships its TypeScript source directly.

```bash
# From the repo root — compiles src/ → dist/
npm run build
```

---

## Publishing a new version

> **Who does this:** Only the repo maintainer needs to publish. End users just `npm install`.

### 1. Log in to npmjs.com (first time only)

```bash
npm login
# Enter your npmjs.com username, password, and email
# Use an Automation token if 2FA is enabled on your account
```

To create an Automation token: **npmjs.com → Account → Access Tokens → Generate New Token → Automation**.

### 2. Publish `@jagadeeshqtsolv/core`

```bash
# From the repo root
npm version patch   # or: minor | major
npm publish         # prepublishOnly runs build automatically
```

### 3. Publish `@jagadeeshqtsolv/web-support`

```bash
cd web
npm version patch   # or: minor | major
npm publish
cd ..
```

### 4. Commit & push the version bumps

```bash
git add package.json web/package.json
git commit -m "chore: bump versions — core vX.Y.Z, web-support vA.B.C"
git push origin main
```

### 5. Update the platform to consume the new version

In the **automation-ai-platform** repo:

```bash
# For @jagadeeshqtsolv/core
cd apps/web
npm install @jagadeeshqtsolv/core@latest

# For @jagadeeshqtsolv/web-support (used in generated framework projects)
# bump the version string in:
# apps/web/src/lib/local-framework/web-framework-package.ts
```

---

## Using the packages

### Install (no auth needed)

```bash
npm install @jagadeeshqtsolv/core
npm install @jagadeeshqtsolv/web-support
```

### `@jagadeeshqtsolv/core` — schemas and types

```typescript
import { createProjectBodySchema, projectPlatformTypeSchema } from "@jagadeeshqtsolv/core";

// Validate an API request body
const result = createProjectBodySchema.safeParse(req.body);

// Use platform type
import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
const platform: ProjectPlatformType = "web";
```

### `@jagadeeshqtsolv/web-support` — Playwright helpers

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

const locator = webLocator(page, { strategy: "label", value: "Email address" });
```

#### Performing actions

```typescript
import { clickWhenVisible, fillWhenVisible, expectVisible } from "@jagadeeshqtsolv/web-support/web-actions";

await fillWhenVisible(locator, "user@example.com");
await clickWhenVisible(page.getByRole("button", { name: "Sign in" }));
await expectVisible(page.getByText("Dashboard"));
```

#### Generating random test data

```typescript
import { dataUtils } from "@jagadeeshqtsolv/web-support/data-utils";

const email    = dataUtils.email();
const password = dataUtils.password(16);
const name     = dataUtils.fullName();
```

### Web Recorder (standalone CLI)

```bash
# Launch the recorder in any browser — no project setup needed
npx @jagadeeshqtsolv/web-support

# Use a specific port
npx @jagadeeshqtsolv/web-support --port 9200
```

---

## Package versions

| Package | Registry |
|---------|----------|
| `@jagadeeshqtsolv/core` | [npmjs.com/package/@jagadeeshqtsolv/core](https://www.npmjs.com/package/@jagadeeshqtsolv/core) |
| `@jagadeeshqtsolv/web-support` | [npmjs.com/package/@jagadeeshqtsolv/web-support](https://www.npmjs.com/package/@jagadeeshqtsolv/web-support) |
