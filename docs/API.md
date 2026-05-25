# API Reference

Complete export reference for both packages in this repo.

---

## `@jagadeeshqtsolv/core`

Install: `npm install @jagadeeshqtsolv/core`

Import: `import { ... } from "@jagadeeshqtsolv/core"`

---

### Constants — size limits

| Constant | Value | Used for |
|----------|-------|---------|
| `REQUIREMENT_MAX_CHARS` | 48 000 | Max requirement body length |
| `PROJECT_NAME_MAX` | 120 | Max project name length |
| `ENV_NAME_MAX` | 80 | Max environment name length |
| `ENV_SLUG_MAX` | 64 | Max environment slug length |
| `CONFIG_JSON_MAX` | 16 000 | Max environment config JSON |
| `PAGE_OBJECT_PATH_MAX` | 200 | Max page object module path |
| `PAGE_OBJECT_CONTENT_MAX` | 120 000 | Max page object file content |
| `METHOD_SUMMARY_MAX` | 4 000 | Max page object method summary |
| `EXECUTION_CONFIG_JSON_MAX` | 8 000 | Max execution config JSON |

---

### Zod schemas — Auth & organisations

| Schema | Fields | Used by |
|--------|--------|---------|
| `registerBodySchema` | `inviteToken`, `email`, `password`, `name?` | `POST /api/auth/register` |
| `loginBodySchema` | `email`, `password` | `POST /api/auth/login` |
| `createInviteBodySchema` | `email`, `role` | `POST /api/admin/organizations/:id/invites` |
| `assignMemberBodySchema` | `email`, `role` | `POST /api/admin/organizations/:id/members` |
| `createOrganizationBodySchema` | `name` | `POST /api/organizations` |
| `setOrganizationDisabledBodySchema` | `disabled` | `PATCH /api/admin/organizations/:id` |
| `organizationMemberRoleSchema` | `"owner" \| "member"` | role validation |

---

### Zod schemas — Projects

| Schema | Fields | Used by |
|--------|--------|---------|
| `createProjectBodySchema` | `name`, `organizationId`, `platformType` | `POST /api/projects` |
| `updateProjectAISettingsBodySchema` | `provider`, `apiKey?`, `model?` | `PATCH /api/projects/:id/ai-settings` |
| `updateProjectGitConfigBodySchema` | `gitRemoteUrl?`, `gitBaseBranch?` | `PATCH /api/projects/:id/git-config` |
| `updateUserGitConfigBodySchema` | `gitBranch?`, `gitAuthorName?`, `gitAuthorEmail?`, `gitToken?` | `PATCH /api/projects/:id/git-config/user` |
| `updateProjectCiConfigBodySchema` | `gitCiToken?`, `gitWorkflowFile?` | `PATCH /api/projects/:id/git-config` |
| `updateJiraConfigBodySchema` | `baseUrl?`, `email?`, `apiToken?`, `defaultJql?` | `PATCH /api/projects/:id/jira-config` |
| `fetchJiraStoriesBodySchema` | `jql`, `maxResults?` | `POST /api/projects/:id/jira-config/fetch-stories` |

---

### Zod schemas — Requirements, plans & code generation

| Schema | Fields | Used by |
|--------|--------|---------|
| `createRequirementBodySchema` | `projectId`, `title?`, `content` | `POST /api/requirements` |
| `updateRequirementBodySchema` | `title?`, `content` | `PATCH /api/requirements/:id` |
| `generatePlanBodySchema` | `requirementId` | `POST /api/generate/plan` |
| `generateCodeBodySchema` | `testPlanId`, `testCaseId?`, `environmentId?`, `overwriteExistingPageObjects` | `POST /api/generate/playwright` |
| `createTestPlanBodySchema` | `suiteName`, `requirementId?`, `requirementTitle?`, `requirementContent?` | `POST /api/projects/:id/test-plans` |
| `updateTestCaseBodySchema` | `testCase` | `PATCH /api/projects/:id/test-plans/:planId/cases/:caseId` |
| `createTestCaseBodySchema` | `testCase` | `POST /api/projects/:id/test-plans/:planId/cases` |
| `healTestRunBodySchema` | `problemDescription?` | `POST /api/projects/:id/test-runs/:runId/heal` |

---

### Zod schemas — Environments & page objects

| Schema | Fields | Used by |
|--------|--------|---------|
| `createEnvironmentBodySchema` | `projectId`, `name`, `slug`, `description?`, `configJson?` | `POST /api/projects/:id/environments` |
| `updateEnvironmentBodySchema` | `name?`, `description?`, `configJson?` | `PATCH /api/projects/:id/environments/:envId` |
| `createPageObjectBodySchema` | `projectId`, `className`, `modulePath`, `content`, `methodSummary?` | `POST /api/projects/:id/page-objects` |
| `updatePageObjectBodySchema` | `className?`, `content?`, `methodSummary?`, `elementsJson?` | `PATCH /api/projects/:id/page-objects/:poId` |

---

### Zod schemas — Execution & test runs

| Schema | Fields | Used by |
|--------|--------|---------|
| `runTestsBodySchema` | `specPaths[]`, `environmentId?`, `grep?`, `provider?` | `POST /api/projects/:id/test-runs` |
| `updateExecutionConfigBodySchema` | `config`, `saucelabsAccessKey?`, `browserstackAccessKey?`, `lambdatestAccessKey?` | `PATCH /api/projects/:id/execution-config` |
| `triggerPipelineBodySchema` | `specPaths[]`, `environmentId?`, `grep?` | `POST /api/projects/:id/git-config/trigger` |
| `pipelineCallbackBodySchema` | `status`, `output?`, `exitCode?`, `pipelineUrl?` | `POST /api/projects/:id/pipeline-callback` |
| `executionConfigSchema` | `provider`, `saucelabs?`, `browserstack?`, `lambdatest?`, `custom?` | config validation |
| `sauceLabsExecutionSchema` | `username`, `accessKey?`, `region`, `deviceName?`, … | SauceLabs config |
| `browserStackExecutionSchema` | `username`, `accessKey?`, `deviceName?`, `browser?`, `os?`, … | BrowserStack config |
| `lambdaTestExecutionSchema` | `username`, `accessKey?`, `deviceName?`, `appUrl?`, … | LambdaTest config |
| `customExecutionSchema` | `hubUrl`, `capabilitiesJson` | Custom Appium hub |

---

### Zod schemas — Locators & elements

| Schema | Enum / Fields | Used for |
|--------|--------------|---------|
| `mobileLocatorStrategySchema` | `"testId" \| "label" \| "text" \| "role" \| "placeholder"` | Mobile locator strategy |
| `webLocatorStrategySchema` | adds `"css"` to the mobile set | Web locator strategy |
| `screenElementSchema` | `key`, `strategy`, `value`, `role?` | Mobile page element definition |
| `webPageElementSchema` | `key`, `strategy`, `value`, `role?`, `frame?`, `shadowHost?`, `index?`, `actionKind` | Web page element definition |
| `webPageElementActionKindSchema` | `"button" \| "link" \| "textbox" \| "checkbox" \| "radio" \| "combobox" \| "generic"` | Web element interaction type |
| `saveScreenFromDeviceBodySchema` | `projectId`, `screenName`, `environmentId?`, `elements[]`, `overwriteExisting` | Save mobile screen |
| `saveWebPageFromBrowserBodySchema` | `projectId`, `pageName`, `environmentId?`, `elements[]`, `overwriteExisting` | Save web page |

---

### TypeScript types (inferred from schemas)

| Type | Inferred from |
|------|--------------|
| `TestPlan` | `testPlanSchema` |
| `TestCase` | `testCaseSchema` |
| `TestStep` | `testStepSchema` |
| `TestStepAction` | `TEST_STEP_ACTIONS` tuple |
| `TestCasePlatform` | `testCasePlatformSchema` |
| `TestStepActionPlatform` | `"mobile" \| "web"` |
| `ScreenElement` | `screenElementSchema` |
| `WebPageElement` | `webPageElementSchema` |
| `WebPageElementActionKind` | `webPageElementActionKindSchema` |
| `ExecutionConfig` | `executionConfigSchema` |
| `ExecutionProvider` | `executionProviderSchema` |
| `CiProvider` | `"github" \| "gitlab" \| "bitbucket"` |
| `ProjectPlatformType` | `projectPlatformTypeSchema` |

---

### Test step actions — `TEST_STEP_ACTIONS`

44 canonical actions shared between mobile (Mobilewright) and web (Playwright).

#### Interactions
`tap` · `doubleTap` · `longPress` · `hover` · `fill` · `clear` · `typeText` · `check` · `uncheck` · `selectOption` · `tapAt`

#### Assertions
`assertVisible` · `assertHidden` · `assertText` · `assertContainsText` · `assertValue` · `assertEnabled` · `assertDisabled` · `assertChecked` · `assertUnchecked` · `assertSelected` · `assertFocused` · `assertCount` · `assertCountGreaterThan`

#### Gestures & navigation
`scrollIntoView` · `swipe` · `pullToRefresh` · `gesture` · `back` · `pressButton`

#### App & device (mobile only)
`screenshot` · `launchApp` · `terminateApp` · `setOrientation`

#### Timing & links
`wait` · `waitForVisible` · `waitForHidden` · `openDeepLink` · `openUrl`

#### Browser (web only)
`switchToFrame` · `switchToMainFrame` · `switchToNewTab` · `closeTab`

---

### Helper functions

| Function | Signature | Returns |
|----------|-----------|---------|
| `projectPlatformLabel` | `(platform: ProjectPlatformType) => string` | `"Web (Playwright)"` or `"Mobile (Mobilewright)"` |
| `detectCiProvider` | `(remoteUrl: string) => CiProvider \| null` | Detects GitHub / GitLab / Bitbucket from remote URL |
| `ciProviderLabel` | `(provider: CiProvider) => string` | `"GitHub Actions"` etc. |
| `executionProviderLabel` | `(provider: ExecutionProvider) => string` | `"BrowserStack"` etc. |
| `isTestStepAction` | `(value: string) => value is TestStepAction` | Type guard |
| `labelForTestStepAction` | `(action: string) => string` | Human-readable label |
| `labelForTestStepActionForPlatform` | `(action, platform) => string` | Platform-specific label (e.g. "Tap" → "Click" for web) |
| `testStepActionGroupsForPlatform` | `(platform) => ReadonlyArray<{label, actions}>` | Grouped actions for step editor |
| `testStepActionsForSelectForPlatform` | `(currentAction, platform) => string[]` | Options for a step action `<select>` |

---

## `@jagadeeshqtsolv/web-support`

Install: `npm install @jagadeeshqtsolv/web-support`

This package ships TypeScript source directly (no compile step). Exports are split by sub-path so you only import what you need.

---

### `@jagadeeshqtsolv/web-support/fixtures`

Re-exports Playwright's `test` and `expect` — all test files import from here so the platform can extend them in future without changing every spec.

```typescript
import { test, expect } from "@jagadeeshqtsolv/web-support/fixtures";
```

| Export | Type | Description |
|--------|------|-------------|
| `test` | `PlaywrightTestFn` | Playwright base `test` function |
| `expect` | `PlaywrightExpect` | Playwright `expect` |

---

### `@jagadeeshqtsolv/web-support/web-locate`

Unified element locator that resolves a `WebLocatorSpec` to a Playwright `Locator`.

```typescript
import { webLocator } from "@jagadeeshqtsolv/web-support/web-locate";

const locator = webLocator(page, {
  strategy: "label",
  value: "Email address",
});
```

| Export | Signature | Description |
|--------|-----------|-------------|
| `webLocator` | `(page: Page, spec: WebLocatorSpec) => Locator` | Resolves a spec to a Playwright Locator, handling iframes, shadow DOM, and index pinning |
| `WebLocatorSpec` | type | `{ strategy, value, role?, frame?, shadowHost?, index? }` |
| `WebLocatorStrategy` | type | `"testId" \| "label" \| "placeholder" \| "role" \| "text" \| "css"` |

#### Strategies

| Strategy | Playwright equivalent | Best used when |
|----------|-----------------------|----------------|
| `testId` | `getByTestId(value)` | Element has `data-testid` |
| `label` | `getByLabel(value, exact)` | Form field with accessible label |
| `placeholder` | `getByPlaceholder(value, exact)` | Input with placeholder text |
| `role` | `getByRole(role, { name: value })` | Buttons, links, ARIA roles |
| `text` | `getByText(value, exact)` | Unique visible text |
| `css` | `locator(value)` | Stable CSS selector / id |

#### Special options

| Option | Effect |
|--------|--------|
| `frame` | CSS selector for an `<iframe>` — scopes locator with `frameLocator` |
| `shadowHost` | CSS selector for a shadow host — chained before inner locator (open shadow roots) |
| `index` | 0-based match index — pins to `nth(index)` when multiple elements match |

---

### `@jagadeeshqtsolv/web-support/web-actions`

Robust interaction and assertion helpers built on top of `webLocator`. All functions scroll the element into view before acting and fall back gracefully on blocked pointer events.

```typescript
import {
  clickWhenVisible,
  fillWhenVisible,
  expectVisible,
} from "@jagadeeshqtsolv/web-support/web-actions";
```

#### Interaction functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `clickWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Waits for visibility, scrolls into view, clicks in-viewport match; falls back to programmatic click |
| `doubleClickWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Double-click with visibility + scroll guard |
| `longPressWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Click-and-hold for 800 ms |
| `hoverWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Hover with scroll guard |
| `fillWhenVisible` / `fill` | `(locator, value, timeoutMs?) => Promise<void>` | Clears and fills an input |
| `clearWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Clears an input field |
| `typeTextWhenVisible` | `(locator, value, timeoutMs?) => Promise<void>` | Types character-by-character (`pressSequentially`) |
| `checkWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Checks a checkbox (skips if already checked; handles label intercept) |
| `uncheckWhenVisible` | `(locator, timeoutMs?) => Promise<void>` | Unchecks a checkbox |
| `selectOptionWhenVisible` | `(locator, value, timeoutMs?) => Promise<void>` | Selects a `<select>` option by value |
| `scrollIntoView` | `(locator, timeoutMs?) => Promise<void>` | Scrolls to the first in-viewport match |
| `goBack` | `(page, timeoutMs?) => Promise<void>` | Browser back navigation |
| `navigateTo` | `(page, url, timeoutMs?) => Promise<void>` | `page.goto` waiting for `domcontentloaded` |
| `takeScreenshot` | `(page, filePath?) => Promise<Buffer>` | Full-page screenshot |
| `waitMs` | `(ms: number) => Promise<void>` | Explicit sleep |

#### Tab / popup functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `waitForNewPage` | `(page, timeoutMs?) => Promise<Page>` | Waits for a popup/new tab |
| `clickOpensNewPage` | `(page, locator, timeoutMs?) => Promise<Page>` | Clicks a link that opens a new tab; returns the new `Page` |
| `closePage` | `(tab: Page) => Promise<void>` | Closes a tab |

#### Assertion functions

| Function | Signature | Playwright equivalent |
|----------|-----------|----------------------|
| `expectVisible` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeVisible()` |
| `expectHidden` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).not.toBeVisible()` |
| `expectText` | `(locator, text, timeoutMs?) => Promise<void>` | `expect(locator).toHaveText(text)` |
| `expectContainsText` | `(locator, text, timeoutMs?) => Promise<void>` | `expect(locator).toContainText(text)` |
| `expectValue` | `(locator, value, timeoutMs?) => Promise<void>` | `expect(locator).toHaveValue(value)` |
| `expectEnabled` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeEnabled()` |
| `expectDisabled` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeDisabled()` |
| `expectChecked` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeChecked()` |
| `expectUnchecked` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).not.toBeChecked()` |
| `expectFocused` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeFocused()` |
| `expectCount` | `(locator, count, timeoutMs?) => Promise<void>` | `expect(locator).toHaveCount(count)` |
| `expectCountGreaterThan` | `(locator, min, timeoutMs?) => Promise<void>` | `expect.poll(() => locator.count()).toBeGreaterThan(min)` |
| `expectSelected` | `(locator, value, timeoutMs?) => Promise<void>` | `expect(locator).toHaveValue(value)` |
| `waitForVisible` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).toBeVisible()` |
| `waitForHidden` | `(locator, timeoutMs?) => Promise<void>` | `expect(locator).not.toBeVisible()` |

> All functions default to `timeoutMs = 30 000` (30 s). Pass a lower value for faster-failing assertions.

---

### `@jagadeeshqtsolv/web-support/data-utils`

Faker-based random data generators. Every method is a function call so each test gets a fresh value.

```typescript
import { dataUtils } from "@jagadeeshqtsolv/web-support/data-utils";
```

#### Person
| Method | Returns | Example |
|--------|---------|---------|
| `fullName()` | `string` | `"John Smith"` |
| `firstName()` | `string` | `"John"` |
| `lastName()` | `string` | `"Smith"` |
| `namePrefix()` | `string` | `"Mr"` |
| `nameSuffix()` | `string` | `"Jr."` |
| `gender()` | `string` | `"male"` |
| `jobTitle()` | `string` | `"Senior Engineer"` |
| `jobDepartment()` | `string` | `"Engineering"` |
| `bio()` | `string` | Short bio sentence |

#### Contact
| Method | Signature | Example |
|--------|-----------|---------|
| `email()` | `() => string` | `"john.smith@example.com"` |
| `workEmail(firstName?, lastName?, company?)` | `(...) => string` | `"john.smith@acme.com"` |
| `phone()` | `() => string` | `"+1-555-123-4567"` |
| `username()` | `() => string` | `"john_smith42"` |
| `password(length?)` | `(length?: number) => string` | `"aB3$xyz..."` |
| `url()` | `() => string` | `"https://example.com"` |
| `ipv4()` | `() => string` | `"192.168.1.1"` |

#### Address
| Method | Example |
|--------|---------|
| `streetAddress()` | `"123 Main St"` |
| `city()` | `"New York"` |
| `state()` | `"California"` |
| `stateCode()` | `"CA"` |
| `country()` | `"United States"` |
| `countryCode()` | `"US"` |
| `zipCode()` | `"90210"` |
| `fullAddress()` | Full multi-line address |
| `latitude()` | `number` |
| `longitude()` | `number` |

#### Commerce
| Method | Example |
|--------|---------|
| `productName()` | `"Ergonomic Chair"` |
| `productDescription()` | Short description |
| `price(min?, max?, decimals?)` | `"29.99"` |
| `sku()` | `"ABC-1234"` |
| `department()` | `"Electronics"` |
| `couponCode()` | `"SAVE10"` |

#### Text & dates
| Method | Example |
|--------|---------|
| `word()` | `"table"` |
| `words(count?)` | `"quick brown fox"` |
| `sentence(words?)` | Full sentence |
| `paragraph(sentences?)` | Multiple sentences |
| `slug()` | `"quick-brown-fox"` |
| `uuid()` | `"550e8400-e29b-..."` |
| `number(min?, max?)` | `number` |
| `boolean()` | `boolean` |
| `pastDate()` | `Date` |
| `futureDate()` | `Date` |
| `recentDate(days?)` | `Date` |
| `dateString()` | `"2024-05-15"` |
| `timeString()` | `"14:30:00"` |

#### Company & finance
| Method | Example |
|--------|---------|
| `companyName()` | `"Acme Corp"` |
| `companySuffix()` | `"LLC"` |
| `catchPhrase()` | Marketing line |
| `creditCardNumber()` | Test card number |
| `creditCardType()` | `"Visa"` |
| `currencyCode()` | `"USD"` |
| `amount(min?, max?, decimals?)` | `"1500.00"` |

#### Colors & files
| Method | Example |
|--------|---------|
| `hexColor()` | `"#A3B4C5"` |
| `rgbColor()` | `"rgb(163, 180, 197)"` |
| `colorName()` | `"MediumSlateBlue"` |
| `fileName(ext?)` | `"document.pdf"` |
| `fileExtension(type?)` | `"jpg"` |
| `mimeType()` | `"image/jpeg"` |
| `filePath()` | `"/home/user/file.txt"` |

---

### `capture-dom.mjs` (internal script)

Spawned by the AutomationAI platform's browser recorder API. Not intended for direct use in tests.

```
node node_modules/@jagadeeshqtsolv/web-support/scripts/capture-dom.mjs start
```

Listens for a `.signal` file, captures `page.content()` into a JSON snapshot, and writes it to disk for the platform to parse into Page Objects.
