/** Canonical test-plan step actions (aligned with @mobilewright/core Locator / Screen / driver APIs). */
export const TEST_STEP_ACTIONS = [
  "tap",
  "doubleTap",
  "longPress",
  "hover",
  "fill",
  "clear",
  "typeText",
  "check",
  "uncheck",
  "selectOption",
  "tapAt",
  "assertVisible",
  "assertHidden",
  "assertText",
  "assertContainsText",
  "assertValue",
  "assertEnabled",
  "assertDisabled",
  "assertChecked",
  "assertUnchecked",
  "assertSelected",
  "assertFocused",
  "assertCount",
  "assertCountGreaterThan",
  "scrollIntoView",
  "swipe",
  "pullToRefresh",
  "gesture",
  "back",
  "pressButton",
  "screenshot",
  "launchApp",
  "terminateApp",
  "setOrientation",
  "wait",
  "waitForVisible",
  "waitForHidden",
  "openDeepLink",
  "openUrl",
  "switchToFrame",
  "switchToMainFrame",
  "switchToNewTab",
  "closeTab",
] as const;

export type TestStepAction = (typeof TEST_STEP_ACTIONS)[number];

export const TEST_STEP_ACTION_LABELS: Record<TestStepAction, string> = {
  tap: "Tap",
  doubleTap: "Double tap",
  longPress: "Long press",
  hover: "Hover",
  fill: "Fill",
  clear: "Clear field",
  typeText: "Type text (focused field)",
  check: "Check",
  uncheck: "Uncheck",
  selectOption: "Select option",
  tapAt: "Tap coordinates",
  assertVisible: "Assert visible",
  assertHidden: "Assert hidden",
  assertText: "Assert text (exact)",
  assertContainsText: "Assert contains text",
  assertValue: "Assert field value",
  assertEnabled: "Assert enabled",
  assertDisabled: "Assert disabled",
  assertChecked: "Assert checked",
  assertUnchecked: "Assert unchecked",
  assertSelected: "Assert selected",
  assertFocused: "Assert focused",
  assertCount: "Assert element count",
  assertCountGreaterThan: "Assert count greater than",
  scrollIntoView: "Scroll into view",
  swipe: "Swipe",
  pullToRefresh: "Pull to refresh",
  gesture: "Custom gesture",
  back: "Navigate back",
  pressButton: "Press hardware button",
  screenshot: "Screenshot",
  launchApp: "Launch app",
  terminateApp: "Terminate app",
  setOrientation: "Set orientation",
  wait: "Wait (sleep)",
  waitForVisible: "Wait until visible",
  waitForHidden: "Wait until hidden",
  openDeepLink: "Open deep link",
  openUrl: "Open URL",
  switchToFrame: "Switch to iframe",
  switchToMainFrame: "Switch to main frame",
  switchToNewTab: "Switch to new tab",
  closeTab: "Close tab",
};

export const TEST_STEP_ACTION_GROUPS: ReadonlyArray<{
  label: string;
  actions: readonly TestStepAction[];
}> = [
  {
    label: "Interactions",
    actions: ["tap", "doubleTap", "longPress", "hover", "fill", "clear", "typeText", "check", "uncheck", "selectOption", "tapAt"],
  },
  {
    label: "Assertions",
    actions: [
      "assertVisible",
      "assertHidden",
      "assertText",
      "assertContainsText",
      "assertValue",
      "assertEnabled",
      "assertDisabled",
      "assertChecked",
      "assertUnchecked",
      "assertSelected",
      "assertFocused",
      "assertCount",
      "assertCountGreaterThan",
    ],
  },
  {
    label: "Gestures & navigation",
    actions: ["scrollIntoView", "swipe", "pullToRefresh", "gesture", "back", "pressButton"],
  },
  {
    label: "App & device",
    actions: ["screenshot", "launchApp", "terminateApp", "setOrientation"],
  },
  {
    label: "Timing & links",
    actions: ["wait", "waitForVisible", "waitForHidden", "openDeepLink", "openUrl"],
  },
];

/** Plan step actions as a pipe-separated string for LLM prompts. */
export const TEST_STEP_ACTIONS_PROMPT = TEST_STEP_ACTIONS.join(" | ");

/** Actions omitted from the web (Playwright) step editor — still valid in stored plans. */
export const MOBILE_ONLY_TEST_STEP_ACTIONS: readonly TestStepAction[] = [
  "tapAt",
  "launchApp",
  "terminateApp",
  "setOrientation",
  "pullToRefresh",
  "gesture",
  "pressButton",
  "openDeepLink",
  "swipe",
] as const;

/** Actions omitted from the mobile step editor (web/browser only). */
export const WEB_ONLY_TEST_STEP_ACTIONS: readonly TestStepAction[] = [
  "hover",
  "switchToFrame",
  "switchToMainFrame",
  "switchToNewTab",
  "closeTab",
] as const;

const MOBILE_ONLY_SET = new Set<string>(MOBILE_ONLY_TEST_STEP_ACTIONS);
const WEB_ONLY_SET = new Set<string>(WEB_ONLY_TEST_STEP_ACTIONS);

/** Step actions offered when editing web project test cases. */
export const WEB_TEST_STEP_ACTIONS = TEST_STEP_ACTIONS.filter(
  (action) => !MOBILE_ONLY_SET.has(action),
) as TestStepAction[];

/** Step actions offered when editing mobile project test cases. */
export const MOBILE_TEST_STEP_ACTIONS = TEST_STEP_ACTIONS.filter(
  (action) => !WEB_ONLY_SET.has(action),
) as TestStepAction[];

const WEB_TEST_STEP_ACTION_LABEL_OVERRIDES: Partial<Record<TestStepAction, string>> = {
  tap: "Click",
  doubleTap: "Double click",
  longPress: "Click and hold",
  check: "Check checkbox",
  uncheck: "Uncheck checkbox",
  selectOption: "Select dropdown option",
  wait: "Wait (timeout)",
  openUrl: "Navigate to URL",
  switchToFrame: "Use iframe context",
  switchToMainFrame: "Return to main document",
  switchToNewTab: "Wait for new tab",
  closeTab: "Close current tab",
  back: "Browser back",
  screenshot: "Screenshot",
};

export const WEB_TEST_STEP_ACTION_GROUPS: ReadonlyArray<{
  label: string;
  actions: readonly TestStepAction[];
}> = [
  {
    label: "Interactions",
    actions: ["tap", "doubleTap", "longPress", "hover", "fill", "clear", "typeText", "check", "uncheck", "selectOption"],
  },
  {
    label: "Assertions",
    actions: [
      "assertVisible",
      "assertHidden",
      "assertText",
      "assertContainsText",
      "assertValue",
      "assertEnabled",
      "assertDisabled",
      "assertChecked",
      "assertUnchecked",
      "assertSelected",
      "assertFocused",
      "assertCount",
      "assertCountGreaterThan",
    ],
  },
  {
    label: "Navigation & scroll",
    actions: ["scrollIntoView", "back", "openUrl"],
  },
  {
    label: "Browser",
    actions: ["screenshot", "switchToFrame", "switchToMainFrame", "switchToNewTab", "closeTab"],
  },
  {
    label: "Timing",
    actions: ["wait", "waitForVisible", "waitForHidden"],
  },
];

export type TestStepActionPlatform = "mobile" | "web";

export function isTestStepAction(value: string): value is TestStepAction {
  return (TEST_STEP_ACTIONS as readonly string[]).includes(value);
}

export function labelForTestStepAction(action: string): string {
  if (isTestStepAction(action)) {
    return TEST_STEP_ACTION_LABELS[action];
  }
  return action;
}

export function labelForTestStepActionForPlatform(
  action: string,
  platform: TestStepActionPlatform = "mobile",
): string {
  if (platform === "web" && isTestStepAction(action)) {
    return WEB_TEST_STEP_ACTION_LABEL_OVERRIDES[action] ?? TEST_STEP_ACTION_LABELS[action];
  }
  return labelForTestStepAction(action);
}

export function testStepActionGroupsForPlatform(
  platform: TestStepActionPlatform = "mobile",
): ReadonlyArray<{ label: string; actions: readonly TestStepAction[] }> {
  return platform === "web" ? WEB_TEST_STEP_ACTION_GROUPS : TEST_STEP_ACTION_GROUPS;
}

/** Options for a step editor select, preserving unknown legacy action values. */
export function testStepActionsForSelect(currentAction: string): string[] {
  if (isTestStepAction(currentAction)) {
    return [...TEST_STEP_ACTIONS];
  }
  return [...TEST_STEP_ACTIONS, currentAction];
}

export function testStepActionsForSelectForPlatform(
  currentAction: string,
  platform: TestStepActionPlatform = "mobile",
): string[] {
  const base: string[] =
    platform === "web" ? [...WEB_TEST_STEP_ACTIONS] : [...MOBILE_TEST_STEP_ACTIONS];
  if (base.includes(currentAction)) {
    return base;
  }
  return [...base, currentAction];
}
