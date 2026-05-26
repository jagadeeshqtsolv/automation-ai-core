import { chromium, firefox, webkit } from "playwright";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "start";
const sessionPath = "environments/.recorder-session.json";
const signalPath = "environments/.recorder-capture.signal";
const stopPath = "environments/.recorder-stop.signal";
const pidPath = "environments/.recorder.pid";
const eventsPath = "environments/.recorder-events.json";

function appendEvent(type, url) {
  try {
    let arr = [];
    if (existsSync(eventsPath)) {
      try { arr = JSON.parse(readFileSync(eventsPath, "utf8")); } catch {}
    }
    if (!Array.isArray(arr)) arr = [];
    arr.push({ type, url: url ?? undefined, at: new Date().toISOString() });
    writeFileSync(eventsPath, JSON.stringify(arr));
  } catch {}
}

const session = JSON.parse(readFileSync(sessionPath, "utf8"));
const baseURL = session.baseURL ?? "https://example.com";
const startPath = session.startPath ?? "/";
const browserName = session.browser ?? "chromium";
const headless = session.headless === true;

const launchers = { chromium, firefox, webkit };
const launcher = launchers[browserName] ?? chromium;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs inside the browser — collects interactive nodes in a single frame.
 * Does NOT walk into iframes (Playwright enumerates frames from Node.js,
 * which bypasses same-origin restrictions for cross-origin frames).
 */
function collectNodesInFrame() {
  const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
  const INTERACTIVE_ROLES = new Set([
    "button", "link", "textbox", "searchbox", "checkbox",
    "radio", "combobox", "switch", "tab", "menuitem",
  ]);

  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    // Must overlap the current viewport — excludes off-screen headers, footers, carousels
    return rect.top < vh && rect.bottom > 0 && rect.left < vw && rect.right > 0;
  }

  function shortText(el) {
    const label = el.getAttribute("aria-label");
    if (label && label.trim().length > 0 && label.length < 120) return label.trim();
    const text = (el.innerText ?? el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text.length > 0 && text.length < 120) return text;
    return undefined;
  }

  function implicitRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === "BUTTON") return "button";
    if (tag === "A") return "link";
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    if (tag === "SELECT") return "combobox";
    if (tag === "TEXTAREA") return "textbox";
    return undefined;
  }

  function isInteractive(el) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    const role = implicitRole(el);
    return role !== undefined && INTERACTIVE_ROLES.has(role);
  }

  function shadowHostSelector(el) {
    if (el.id && el.id.length > 0) return "#" + el.id;
    return el.tagName.toLowerCase();
  }

  const collected = [];

  function captureInteractive(el, shadowHost) {
    if (!isVisible(el) || !isInteractive(el)) return;
    const tagName = el.tagName.toLowerCase();
    const role = implicitRole(el);
    const testId = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? undefined;
    const elementId = el.id && el.id.length > 0 ? el.id : undefined;
    const name = el.getAttribute("name") ?? undefined;
    const ariaLabel = el.getAttribute("aria-label") ?? undefined;
    const placeholder = el.placeholder || undefined;
    const text = shortText(el);
    const inputType = el.tagName === "INPUT" ? el.getAttribute("type") ?? undefined : undefined;
    collected.push({
      tagName,
      testId: testId ?? undefined,
      elementId: elementId ?? undefined,
      name: name ?? undefined,
      ariaLabel: ariaLabel ?? undefined,
      placeholder: placeholder ?? undefined,
      text: text ?? undefined,
      role: role ?? undefined,
      inputType: inputType ?? undefined,
      shadowHost: shadowHost ?? undefined,
      isVisible: true,
    });
  }

  function walk(el, shadowHost) {
    captureInteractive(el, shadowHost);
    // Walk open shadow roots (LWC, Web Components, Salesforce Lightning)
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) {
        walk(child, shadowHostSelector(el));
      }
    }
    // Skip iframes — Playwright enumerates frames from Node.js
    if (el.tagName !== "IFRAME") {
      for (const child of el.children) {
        walk(child, shadowHost);
      }
    }
  }

  const body = document.body;
  if (!body) return [];
  walk(body, undefined);
  return collected;
}

/**
 * Build a CSS selector string that uniquely identifies a Playwright Frame
 * within its parent frame. Used as the `frame` property in locators.
 */
async function getFrameSelector(frame) {
  try {
    const el = await frame.frameElement();
    const id = await el.getAttribute("id");
    if (id) return `iframe#${id}`;
    const name = await el.getAttribute("name");
    if (name) return `iframe[name="${name.replace(/"/g, '\\"')}"]`;
    const title = await el.getAttribute("title");
    if (title) return `iframe[title="${title.replace(/"/g, '\\"')}"]`;
    const src = await el.getAttribute("src");
    if (src) {
      // Use a short stable part of the src (avoid full dynamic URLs)
      try {
        const url = new URL(src);
        const stable = url.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
        if (stable) return `iframe[src*="${stable}"]`;
      } catch {}
    }
    return "iframe";
  } catch {
    return "iframe";
  }
}

/**
 * Collect all interactive nodes from the page and all its frames,
 * including cross-origin iframes (Playwright runs outside the browser
 * sandbox so it bypasses same-origin restrictions).
 */
async function captureAllNodes(activePage) {
  const allNodes = [];

  // Helper to process one Playwright Frame
  async function processFrame(frame, frameCssSelector) {
    try {
      const nodes = await frame.evaluate(collectNodesInFrame);
      for (const node of nodes) {
        allNodes.push({ ...node, frame: frameCssSelector });
      }
    } catch {
      // Frame may have navigated away mid-capture — skip silently
    }
  }

  // Main frame (no frame selector needed)
  await processFrame(activePage.mainFrame(), undefined);

  // All child frames — accessible via Playwright regardless of origin
  for (const frame of activePage.frames()) {
    if (frame === activePage.mainFrame()) continue;
    const selector = await getFrameSelector(frame);
    await processFrame(frame, selector);
  }

  return allNodes;
}

async function writeSnapshot(activePage) {
  const nodes = await captureAllNodes(activePage);
  const payload = {
    capturedAt: new Date().toISOString(),
    url: activePage.url(),
    baseURL,
    nodes,
  };
  writeFileSync("environments/latest-dom-snapshot.json", JSON.stringify(payload, null, 2));
  return payload;
}

const browser = await launcher.launch({ headless });
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
await page.goto(startPath);

// Track the most recently focused page so captures work after navigation to a new tab
let activePage = page;
context.on("page", (newPage) => {
  activePage = newPage;
  newPage.waitForLoadState("domcontentloaded").then(() => {
    appendEvent("newTab", newPage.url());
  }).catch(() => {
    try { appendEvent("newTab", newPage.url()); } catch {}
  });
  newPage.on("close", () => {
    try { appendEvent("closeTab", newPage.url()); } catch {}
    const pages = context.pages();
    if (pages.length > 0) activePage = pages[pages.length - 1];
  });
});
page.on("popup", (popup) => { activePage = popup; });

if (mode === "start") {
  writeFileSync(pidPath, String(process.pid));
  for (const p of [signalPath, stopPath, eventsPath]) {
    if (existsSync(p)) {
      try { unlinkSync(p); } catch {}
    }
  }

  console.error(
    "[recorder] Browser is open — navigate freely (including new tabs), then click Capture in the app.",
  );

  while (!existsSync(stopPath)) {
    if (existsSync(signalPath)) {
      try { unlinkSync(signalPath); } catch {}
      const payload = await writeSnapshot(activePage);
      console.log(JSON.stringify(payload));
      console.error(
        `[recorder] Captured ${payload.nodes.length} nodes from ${activePage.url()}. Navigate and capture again, or close from the app.`,
      );
    }
    await sleep(350);
  }

  try { unlinkSync(stopPath); } catch {}
  try { unlinkSync(pidPath); } catch {}
  await browser.close();
  process.exit(0);
}

// Legacy one-shot mode
console.error("[recorder] Browser opened. Waiting for capture signal…");
const deadline = Date.now() + 30 * 60 * 1000;
let payload = null;
while (Date.now() < deadline) {
  if (existsSync(signalPath)) {
    try { unlinkSync(signalPath); } catch {}
    payload = await writeSnapshot(activePage);
    break;
  }
  await sleep(350);
}
if (payload === null) {
  console.error("[recorder] Timed out waiting for capture signal.");
  await browser.close();
  process.exit(1);
}
console.log(JSON.stringify(payload));
await browser.close();
