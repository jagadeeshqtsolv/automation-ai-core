# automation-ai-core — Architecture & Package Diagrams

All diagrams use [Mermaid](https://mermaid.js.org/) and render natively on GitHub.

---

## Table of contents

1. [Package overview](#1-package-overview)
2. [How packages fit into the platform](#2-how-packages-fit-into-the-platform)
3. [Schema validation flow](#3-schema-validation-flow)
4. [Web-support in a Playwright test](#4-web-support-in-a-playwright-test)
5. [webLocator resolution logic](#5-weblocator-resolution-logic)
6. [Publish & consume lifecycle](#6-publish--consume-lifecycle)

---

## 1. Package overview

This repo contains two independently published npm packages that share a single source tree.

```mermaid
graph TB
    subgraph Repo["automation-ai-core (this repo)"]
        direction TB
        subgraph CorePkg["@jagadeeshqtsolv/core  —  src/"]
            Schemas["schemas.ts\nZod schemas for every API body"]
            Platform["project-platform.ts\nProjectPlatformType  web | mobile"]
            Actions["test-step-actions.ts\n44 canonical step actions + labels + groups"]
            Index["index.ts\nre-exports everything"]
        end

        subgraph WebPkg["@jagadeeshqtsolv/web-support  —  web/"]
            Fixtures["src/fixtures.ts\nPlaywright test & expect re-exports"]
            Locate["src/web-locate.ts\nwebLocator() — unified element resolver"]
            WebAct["src/web-actions.ts\nclickWhenVisible, fillWhenVisible, expect* …"]
            DataUtils["utils/data-utils.ts\ndataUtils — faker-based generators"]
            CaptureDom["scripts/capture-dom.mjs\nDOM snapshot script for browser recorder"]
        end
    end
```

---

## 2. How packages fit into the platform

```mermaid
graph LR
    subgraph CoreRepo["automation-ai-core"]
        Core["@jagadeeshqtsolv/core"]
        WebSupport["@jagadeeshqtsolv/web-support"]
    end

    subgraph Platform["automation-ai-platform  (apps/web)"]
        API["Next.js API routes\nvalidate request bodies"]
        AIGen["AI generation engine\nbuilds LLM prompts"]
        UIForms["React forms\ntype-safe payloads"]
    end

    subgraph Framework["Per-project Playwright workspace\n(created on disk per project)"]
        SupportFiles["support/fixtures.ts\nsupport/web-actions.ts\nsupport/web-locate.ts"]
        Tests["tests/*.spec.ts\nAI-generated test files"]
        POs["pageobjects/*.ts\nPage Object classes"]
    end

    Core -->|"schemas, types, action lists"| API
    Core -->|"type-safe request bodies"| UIForms
    Core -->|"TEST_STEP_ACTIONS for prompts"| AIGen
    WebSupport -->|"peer dep — installed via npm"| SupportFiles
    SupportFiles -->|"imported by"| Tests
    SupportFiles -->|"imported by"| POs
    WebSupport -->|"capture-dom.mjs spawned by recorder API"| Platform
```

---

## 3. Schema validation flow

How a Zod schema defined here protects an API endpoint in the platform.

```mermaid
sequenceDiagram
    participant Client as Browser / CI
    participant Route as Next.js API Route
    participant Schema as @jagadeeshqtsolv/core<br/>schema
    participant Handler as Business logic
    participant DB as SQLite DB

    Client->>Route: POST /api/requirements\n{ projectId, title, content }

    Route->>Schema: createRequirementBodySchema.safeParse(body)
    alt invalid
        Schema-->>Route: { success: false, error }
        Route-->>Client: 400 — field-level error messages
    else valid
        Schema-->>Route: { success: true, data }
        Route->>Handler: validated & typed data
        Handler->>DB: prisma.requirement.create(...)
        DB-->>Handler: saved record
        Handler-->>Client: 201 — { requirement }
    end
```

---

## 4. Web-support in a Playwright test

How helpers from `@jagadeeshqtsolv/web-support` are used in a generated test.

```mermaid
flowchart TD
    A["AI generates test code\n(automation-ai-platform)"] --> B["spec written to\ntests/login.spec.ts"]

    B --> C["import { test, expect }\nfrom '../support/fixtures'"]
    B --> D["import { webLocator }\nfrom '../support/web-locate'"]
    B --> E["import { clickWhenVisible, fillWhenVisible }\nfrom '../support/web-actions'"]

    C & D & E --> F["support/fixtures.ts\nexport * from '@jagadeeshqtsolv/web-support/fixtures'"]
    C & D & E --> G["support/web-locate.ts\nexport * from '@jagadeeshqtsolv/web-support/web-locate'"]
    C & D & E --> H["support/web-actions.ts\nexport * from '@jagadeeshqtsolv/web-support/web-actions'"]

    F & G & H --> I["node_modules/@jagadeeshqtsolv/web-support\n(installed from npmjs.com)"]

    I --> J["npx playwright test\nruns the spec"]
    J --> K["Pass / Fail report"]
```

---

## 5. webLocator resolution logic

Internal decision tree inside `web-locate.ts` showing how a `WebLocatorSpec` resolves to a Playwright `Locator`.

```mermaid
flowchart TD
    A["webLocator(page, spec)"] --> B{spec.frame set?}
    B -->|Yes| C["root = page.frameLocator(frame)"]
    B -->|No| D["root = page"]
    C & D --> E{spec.shadowHost set?}
    E -->|Yes| F["root = root.locator(shadowHost)"]
    E -->|No| G["root unchanged"]
    F & G --> H{spec.strategy}

    H -->|css| I["root.locator(value)"]
    H -->|testId| J["root.getByTestId(value)"]
    H -->|label| K["root.getByLabel(value, exact)"]
    H -->|placeholder| L["root.getByPlaceholder(value, exact)"]
    H -->|text| M["root.getByText(value, exact)\n+ visibleMatches(index)"]
    H -->|role = link| N["root.locator('a', hasText)\n+ visibleMatches(index)"]
    H -->|role = button| O["root.locator('button,[role=button]', hasText)\n+ visibleMatches(index)"]
    H -->|role other| P["root.getByRole(role, name, exact)\n+ visibleMatches(index)"]

    I & J & K & L & M & N & O & P --> Q["Playwright Locator"]
```

---

## 6. Publish & consume lifecycle

How a change in this repo flows all the way to a running test.

```mermaid
flowchart LR
    A["1 — Edit source\nsrc/ or web/src/"] --> B["2 — Build\nnpm run build\n(core only — web ships TS)"]
    B --> C["3 — Bump version\nnpm version patch"]
    C --> D["4 — Publish\nnpm publish\n→ registry.npmjs.org"]

    D --> E["5 — Update platform\nbump @jagadeeshqtsolv/core\nin apps/web/package.json"]
    E --> F["6 — npm install\nplatform picks up new types\n& schemas"]

    D --> G["5b — Update framework\nbump @jagadeeshqtsolv/web-support\nin per-project package.json"]
    G --> H["6b — npm install\nin frameworks/web/projectId"]
    H --> I["7 — Run tests\nnpx playwright test\nuses updated helpers"]
```
