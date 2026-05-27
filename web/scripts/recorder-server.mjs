#!/usr/bin/env node
/**
 * AutomationAI Web Recorder — local recorder server.
 *
 * Run from packages/core/web:
 *   node scripts/recorder-server.mjs
 *   node scripts/recorder-server.mjs --port 9222
 *
 * Opens a recorder UI in your browser + a headed Chrome window you can navigate freely.
 * Reuses the same capture logic as the server-side recorder (iframes, shadow DOM, new tabs).
 */

import { chromium, firefox, webkit } from "playwright";
import http from "node:http";
import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(process.cwd(), "pageobjects");
const args = process.argv.slice(2);
const PORT = parseInt(args.find((_, i) => args[i - 1] === "--port") ?? "9111", 10);

// ── State ──────────────────────────────────────────────────────────────────

let pwBrowser = null;
let pwContext = null;
let activePage = null;           // tracks latest focused page, handles new tabs & popups
const savedPages = new Map();    // className → { className, modulePath, content, elementCount }

// ── DOM capture — exact same logic as capture-dom.mjs ─────────────────────
// collectNodesInFrame runs inside the browser via page.evaluate().
// It does NOT recurse into iframes — Playwright enumerates frames from Node.js
// which bypasses same-origin restrictions for cross-origin frames.

function collectNodesInFrame() {
  const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
  const INTERACTIVE_ROLES = new Set([
    "button", "link", "textbox", "searchbox", "checkbox",
    "radio", "combobox", "switch", "tab", "menuitem",
  ]);
  const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LABEL", "SPAN", "LI", "TD", "TH", "CAPTION", "FIGCAPTION", "LEGEND", "DT", "DD"]);

  function isRendered(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    if (style.pointerEvents === "none" && style.position !== "fixed") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function ownText(el) {
    // Text directly in this element (not from child elements)
    let t = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) t += node.textContent;
    }
    return t.trim().replace(/\s+/g, " ");
  }

  function shortText(el) {
    const label = el.getAttribute("aria-label");
    if (label?.trim().length > 0 && label.length < 120) return label.trim();
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

  function insideInteractive(el) {
    return !!el.closest("a,button,input,select,textarea,[role='button'],[role='link'],[role='menuitem']");
  }

  function shadowHostSelector(el) {
    if (el.id?.length > 0) return "#" + el.id;
    return el.tagName.toLowerCase();
  }

  const collected = [];

  function captureInteractive(el, shadowHost) {
    if (!isRendered(el) || !isInteractive(el)) return;
    collected.push({
      nodeKind:    "interactive",
      tagName:     el.tagName.toLowerCase(),
      testId:      el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? undefined,
      elementId:   el.id?.length > 0 ? el.id : undefined,
      name:        el.getAttribute("name") ?? undefined,
      ariaLabel:   el.getAttribute("aria-label") ?? undefined,
      placeholder: el.placeholder || undefined,
      text:        shortText(el),
      role:        implicitRole(el) ?? undefined,
      inputType:   el.tagName === "INPUT" ? (el.getAttribute("type") ?? undefined) : undefined,
      shadowHost:  shadowHost ?? undefined,
    });
  }

  function captureText(el, shadowHost) {
    if (!TEXT_TAGS.has(el.tagName)) return;
    if (!isRendered(el)) return;
    if (insideInteractive(el)) return;  // skip text inside buttons/links

    // Skip labels that are associated with or wrap a form control — they duplicate the input
    if (el.tagName === "LABEL") {
      if (el.htmlFor || el.getAttribute("for")) return;
      if (el.querySelector("input,select,textarea")) return;
    }

    // Use full innerText for headings/paragraphs, own text for inline elements
    const isInline = ["SPAN", "LABEL"].includes(el.tagName);
    const raw = isInline
      ? ownText(el)
      : (el.innerText ?? el.textContent ?? "").trim().replace(/\s+/g, " ");
    if (!raw || raw.length < 2 || raw.length > 200) return;
    collected.push({
      nodeKind:   "text",
      tagName:    el.tagName.toLowerCase(),
      testId:     el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? undefined,
      elementId:  el.id?.length > 0 ? el.id : undefined,
      text:       raw,
      shadowHost: shadowHost ?? undefined,
    });
  }

  function walk(el, shadowHost) {
    captureInteractive(el, shadowHost);
    captureText(el, shadowHost);
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) walk(child, shadowHostSelector(el));
    }
    if (el.tagName !== "IFRAME") {
      for (const child of el.children) walk(child, shadowHost);
    }
  }

  if (document.body) walk(document.body, undefined);
  return collected;
}

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

// Capture all nodes from the page + all frames (iframes, cross-origin included)
async function captureAllNodes(pg) {
  const allNodes = [];

  async function processFrame(frame, frameCssSelector) {
    try {
      const nodes = await frame.evaluate(collectNodesInFrame);
      for (const node of nodes) allNodes.push({ ...node, frame: frameCssSelector });
    } catch { /* frame may have navigated away */ }
  }

  await processFrame(pg.mainFrame(), undefined);

  for (const frame of pg.frames()) {
    if (frame === pg.mainFrame()) continue;
    const selector = await getFrameSelector(frame);
    await processFrame(frame, selector);
  }

  return allNodes;
}

// ── Element parsing → locator records ─────────────────────────────────────

function wordTruncate(text, maxChars) {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf(" ", maxChars);
  return cut > 0 ? text.slice(0, cut) : text.slice(0, maxChars);
}

function parseNodes(nodes) {
  const usedKeys = new Set();
  const out = [];

  // Build a set of text values already represented by interactive elements
  // so we can skip duplicate text nodes (e.g. a <label>Email</label> next to an aria-label="Email" input)
  const interactiveTexts = new Set(
    nodes
      .filter(n => n.nodeKind !== "text")
      .flatMap(n => [n.ariaLabel, n.placeholder, n.text].filter(Boolean).map(s => s.trim().toLowerCase()))
  );

  for (const n of nodes) {
    let strategy, value, role;

    if (n.nodeKind === "text") {
      // Text/display elements: testId → id → text content (truncated)
      if (n.testId) {
        strategy = "testId"; value = n.testId;
      } else if (n.elementId && !/^\d/.test(n.elementId)) {
        strategy = "css"; value = `#${n.elementId}`;
      } else if (n.text?.length > 0) {
        // Skip if this text is already represented by a nearby interactive element
        if (interactiveTexts.has(n.text.trim().toLowerCase())) continue;
        // Truncate at word boundary so the locator value never ends mid-word
        strategy = "text"; value = wordTruncate(n.text, 50);
      } else continue;

      // Key: first 4 words only — never slice mid-word
      const textForKey = n.elementId ?? n.text ?? n.tagName;
      const shortKey = textForKey.split(/\s+/).slice(0, 4).join(" ");
      const base = toCamel(shortKey || n.tagName);
      let key = base;
      let i = 2;
      while (usedKeys.has(key)) key = `${base}${i++}`;
      usedKeys.add(key);

      out.push({
        key, strategy, value,
        role:       null,
        actionKind: "text",
        frame:      n.frame ?? null,
        shadowHost: n.shadowHost ?? null,
        display:    n.text ?? value,
        tagName:    n.tagName,
      });
      continue;
    }

    // Priority: testId → id → name → aria-label → placeholder → role/text
    if (n.testId) {
      strategy = "testId"; value = n.testId;
    } else if (n.elementId && !/^\d/.test(n.elementId)) {
      strategy = "css"; value = `#${n.elementId}`;
    } else if (n.name) {
      strategy = "css"; value = `[name="${n.name}"]`;
    } else if (n.ariaLabel) {
      strategy = "label"; value = n.ariaLabel;
    } else if (n.placeholder) {
      strategy = "placeholder"; value = n.placeholder;
    } else if ((n.tagName === "button" || n.role === "button") && n.text?.length <= 60) {
      strategy = "role"; value = n.text; role = "button";
    } else if ((n.tagName === "a" || n.role === "link") && n.text?.length <= 60) {
      strategy = "role"; value = n.text; role = "link";
    } else if (n.text?.length > 0 && n.text.length <= 80) {
      strategy = "text"; value = n.text;
    } else continue;

    const t = (n.inputType ?? "").toLowerCase();
    let actionKind = "generic";
    if (n.tagName === "input" && t === "checkbox")                                              actionKind = "checkbox";
    else if (n.tagName === "input" && ["text","email","password","search","tel","url","number",""].includes(t)) actionKind = "textbox";
    else if (n.tagName === "textarea")  actionKind = "textbox";
    else if (n.tagName === "select")    actionKind = "combobox";
    else if (role === "link"  || n.tagName === "a")      actionKind = "link";
    else if (role === "button"|| n.tagName === "button") actionKind = "button";

    // Try each candidate — skip ones that produce an empty/useless camelCase result
    function usableKey(s) {
      if (!s) return null;
      const k = toCamel(s.split(/\s+/).slice(0, 4).join(" "));
      return (k && k !== "element") ? k : null;
    }
    const base = usableKey(n.name)
      ?? usableKey(n.ariaLabel)
      ?? usableKey(n.text)
      ?? (n.testId    ? keyFromId(n.testId)    : null)
      ?? (n.elementId ? keyFromId(n.elementId) : null)
      ?? toCamel(n.tagName);
    let key = base;
    let i = 2;
    while (usedKeys.has(key)) key = `${base}${i++}`;
    usedKeys.add(key);

    out.push({
      key, strategy, value,
      role:       role ?? null,
      actionKind,
      frame:      n.frame ?? null,
      shadowHost: n.shadowHost ?? null,
      display:    n.ariaLabel ?? n.placeholder ?? n.text ?? value,
    });
  }
  return out;
}

// ── TypeScript generation ──────────────────────────────────────────────────

const WEB_ACTIONS_IMPORT_BLOCK = `import {
  checkWhenVisible,
  clearWhenVisible,
  clickOpensNewPage,
  clickWhenVisible,
  closePage,
  doubleClickWhenVisible,
  expectChecked,
  expectContainsText,
  expectCount,
  expectCountGreaterThan,
  expectDisabled,
  expectEnabled,
  expectFocused,
  expectHidden,
  expectSelected,
  expectText,
  expectUnchecked,
  expectValue,
  expectVisible,
  fill,
  fillWhenVisible,
  getTextWhenVisible,
  goBack,
  hoverWhenVisible,
  longPressWhenVisible,
  navigateTo,
  scrollIntoView,
  scrollIntoViewWhenVisible,
  selectOptionWhenVisible,
  takeScreenshot,
  typeTextWhenVisible,
  uncheckWhenVisible,
  waitForHidden,
  waitForNewPage,
  waitForVisible,
  waitMs,
  webLocator,
} from "../support/web-actions";`;

function resolveActionKind(el) {
  // actionKind comes directly from DOM capture — trust it as-is.
  // Map generic/unknown → button/link via role when available.
  if (el.actionKind !== "generic") return el.actionKind;
  const role = (el.role ?? "").toLowerCase();
  if (role === "link")   return "link";
  if (role === "button") return "button";
  return "generic";
}

function assertionMethods(className, key, kind) {
  const C = key[0].toUpperCase() + key.slice(1);
  const L = `webLocator(this.page, ${className}.L.${key})`;
  const out = [];

  // visible / hidden — every element
  out.push(
    `  async expect${C}Visible(timeoutMs = 30_000): Promise<void> {`,
    `    await expectVisible(${L}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${C}Hidden(timeoutMs = 30_000): Promise<void> {`,
    `    await expectHidden(${L}, timeoutMs);`,
    `  }`,
    ``,
  );

  // enabled / disabled — interactive elements only (not links or static text)
  if (kind !== "link" && kind !== "text") {
    out.push(
      `  async expect${C}Enabled(timeoutMs = 30_000): Promise<void> {`,
      `    await expectEnabled(${L}, timeoutMs);`,
      `  }`,
      ``,
      `  async expect${C}Disabled(timeoutMs = 30_000): Promise<void> {`,
      `    await expectDisabled(${L}, timeoutMs);`,
      `  }`,
      ``,
    );
  }

  // text / containsText — buttons, links, generic, and static text elements
  if (["button", "link", "generic", "text"].includes(kind)) {
    out.push(
      `  async expect${C}Text(expected: string, timeoutMs = 30_000): Promise<void> {`,
      `    await expectText(${L}, expected, timeoutMs);`,
      `  }`,
      ``,
      `  async expect${C}ContainsText(substring: string, timeoutMs = 30_000): Promise<void> {`,
      `    await expectContainsText(${L}, substring, timeoutMs);`,
      `  }`,
      ``,
    );
  }

  // value — form inputs that hold a value (textbox, combobox)
  if (["textbox", "combobox"].includes(kind)) {
    out.push(
      `  async expect${C}Value(expected: string, timeoutMs = 30_000): Promise<void> {`,
      `    await expectValue(${L}, expected, timeoutMs);`,
      `  }`,
      ``,
    );
  }

  // focused — textbox and combobox only
  if (["textbox", "combobox"].includes(kind)) {
    out.push(
      `  async expect${C}Focused(timeoutMs = 30_000): Promise<void> {`,
      `    await expectFocused(${L}, timeoutMs);`,
      `  }`,
      ``,
    );
  }

  // checked / unchecked — checkbox and radio only
  if (["checkbox", "radio"].includes(kind)) {
    out.push(
      `  async expect${C}Checked(timeoutMs = 30_000): Promise<void> {`,
      `    await expectChecked(${L}, timeoutMs);`,
      `  }`,
      ``,
      `  async expect${C}Unchecked(timeoutMs = 30_000): Promise<void> {`,
      `    await expectUnchecked(${L}, timeoutMs);`,
      `  }`,
      ``,
    );
  }

  // scrollIntoView — every element
  out.push(
    `  async scroll${C}IntoView(): Promise<void> {`,
    `    await scrollIntoViewWhenVisible(${L});`,
    `  }`,
    ``,
  );

  return out;
}

function methodLinesForElement(className, el) {
  const C = key => key[0].toUpperCase() + key.slice(1);
  const L = key => `webLocator(this.page, ${className}.L.${key})`;
  const cap = C(el.key);
  const loc = L(el.key);
  const lines = [];
  const kind = resolveActionKind(el);

  switch (kind) {
    case "text":
      lines.push(
        `  async getInnerText${cap}(): Promise<string> {`,
        `    return getTextWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
    case "textbox":
      lines.push(
        `  async fill${cap}(value: string): Promise<void> {`,
        `    await fillWhenVisible(${loc}, value);`,
        `  }`,
        ``,
        `  async clear${cap}(): Promise<void> {`,
        `    await clearWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async typeText${cap}(value: string): Promise<void> {`,
        `    await typeTextWhenVisible(${loc}, value);`,
        `  }`,
        ``,
      );
      break;
    case "checkbox":
      lines.push(
        `  async check${cap}(): Promise<void> {`,
        `    await checkWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async uncheck${cap}(): Promise<void> {`,
        `    await uncheckWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
    case "combobox":
      lines.push(
        `  async select${cap}(value: string): Promise<void> {`,
        `    await selectOptionWhenVisible(${loc}, value);`,
        `  }`,
        ``,
      );
      break;
    case "radio":
      lines.push(
        `  async select${cap}(): Promise<void> {`,
        `    await clickWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
    default:
      lines.push(
        `  async click${cap}(): Promise<void> {`,
        `    await clickWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async doubleClick${cap}(): Promise<void> {`,
        `    await doubleClickWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
  }

  lines.push(...assertionMethods(className, el.key, kind));
  return lines;
}

function maybeAddFlowMethods(lines, className) {
  const src = lines.join("\n");
  const hasFillUser  = /async fill(?:UserName|Username)\s*\(/.test(src);
  const hasFillPass  = /async fillPassword\s*\(/.test(src);
  const hasClickLogin = /async click(?:Login|LoginButton|SignIn)\s*\(/.test(src);
  if (hasFillUser && hasFillPass && hasClickLogin && !/async performLogin\s*\(/.test(src)) {
    const fillUser   = /async fillUserName\s*\(/.test(src) ? "fillUserName" : "fillUsername";
    const loginClick = /async clickSignIn\s*\(/.test(src) ? "clickSignIn" : /async clickLoginButton\s*\(/.test(src) ? "clickLoginButton" : "clickLogin";
    lines.push(
      `  async performLogin(username: string, password: string): Promise<void> {`,
      `    await this.${fillUser}(username);`,
      `    await this.fillPassword(password);`,
      `    await this.${loginClick}();`,
      `  }`,
      ``,
    );
  }
  if (/async clickLogout\s*\(/.test(src) && !/async performLogout\s*\(/.test(src)) {
    lines.push(
      `  async performLogout(): Promise<void> {`,
      `    await this.clickLogout();`,
      `  }`,
      ``,
    );
  }
}

function generateTs(className, elements) {
  if (!elements.length) return null;
  const esc = s => (s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  const lLines = elements.map(({ key, strategy, value, role, actionKind, frame, shadowHost }) => {
    const parts = [`strategy: '${strategy}' as const`, `value: '${esc(value)}'`];
    if (role)       parts.push(`role: '${esc(role)}'`);
    if (frame)      parts.push(`frame: '${esc(frame)}'`);
    if (shadowHost) parts.push(`shadowHost: '${esc(shadowHost)}'`);
    parts.push(`actionKind: '${actionKind}' as const`);
    return `    ${key}: { ${parts.join(", ")} },`;
  });

  const methodLines = elements.flatMap(el => methodLinesForElement(className, el));
  maybeAddFlowMethods(methodLines, className);

  return [
    `import type { Page } from "@playwright/test";`,
    WEB_ACTIONS_IMPORT_BLOCK,
    ``,
    `export class ${className} {`,
    `  private static readonly L = {`,
    ...lLines,
    `  } as const;`,
    ``,
    `  constructor(private readonly page: Page) {}`,
    ``,
    ...methodLines,
    `}`,
    ``,
  ].join("\n");
}

// ── ZIP builder (pure Node, no deps) ──────────────────────────────────────

function buildZip(files) {
  function crc32(buf) {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.from(f.content, "utf8");
    const crc  = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0,6);
    local.writeUInt16LE(0,8); local.writeUInt16LE(0,10); local.writeUInt16LE(0,12);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(name.length,26); local.writeUInt16LE(0,28); name.copy(local,30);
    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0,8); cd.writeUInt16LE(0,10); cd.writeUInt16LE(0,12); cd.writeUInt16LE(0,14);
    cd.writeUInt32LE(crc,16); cd.writeUInt32LE(data.length,20); cd.writeUInt32LE(data.length,24);
    cd.writeUInt16LE(name.length,28); cd.writeUInt16LE(0,30); cd.writeUInt16LE(0,32);
    cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36); cd.writeUInt32LE(0,38); cd.writeUInt32LE(offset,42);
    name.copy(cd,46);
    parts.push(local, data); central.push(cd);
    offset += local.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6);
  eocd.writeUInt16LE(files.length,8); eocd.writeUInt16LE(files.length,10);
  eocd.writeUInt32LE(cdBuf.length,12); eocd.writeUInt32LE(offset,16); eocd.writeUInt16LE(0,20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toCamel(s) {
  return (s ?? "").replace(/[^a-zA-Z0-9\s]/g, " ").trim()
    .split(/\s+/).filter(Boolean)
    .map((w, i) => i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1))
    .join("").replace(/^[0-9]+/, "") || "element";
}

// Derive a readable key from a testId / element-id string
// e.g. "signup-form-username-field" → "signupFormUsername"
//      "login-password-input"       → "loginPassword"
//      "submit-btn"                 → "submit"
function keyFromId(id) {
  const STRIP_SUFFIXES = /[-_]?(input|field|btn|button|link|text|area|wrap|wrapper|container|box|el|elem|element)$/i;
  const s = (id ?? "").replace(STRIP_SUFFIXES, "");
  // Convert kebab/snake to camelCase
  const parts = s.split(/[-_\s]+/).filter(Boolean);
  return parts.map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}
function toPascal(s) {
  return (s ?? "").replace(/[^a-zA-Z0-9\s]/g, " ").trim()
    .split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join("") || "Page";
}
function jsonRes(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", c => (d += c));
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { reject(new Error("Bad JSON")); } });
    req.on("error", reject);
  });
}

// ── UI ─────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>AutomationAI Recorder</title>
<style>
/* ── Theme ── */
:root{
  --bg:#ffffff;
  --bg2:#f6f8fa;
  --bg3:#eef0f3;
  --border:#d0d7de;
  --text:#1f2328;
  --text2:#656d76;
  --text3:#9198a1;
  --green:#1a7f37;
  --green-bg:#dafbe1;
  --green-border:#aceebb;
  --red:#cf222e;
  --red-bg:#ffebe9;
  --amber:#9a6700;
  --amber-bg:#fff8c5;
  --shadow:rgba(140,149,159,0.15);
  --code-bg:#f6f8fa;
  --code-text:#24292f;
}

*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;line-height:1.6;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden;transition:background .2s,color .2s}

/* header */
.hdr{background:var(--bg2);border-bottom:1px solid var(--border);height:56px;display:flex;align-items:center;gap:16px;padding:0 24px;flex-shrink:0;box-shadow:0 1px 3px var(--shadow)}
.logo{font-size:15px;font-weight:700;color:var(--text);white-space:nowrap;display:flex;align-items:center;gap:8px;flex-shrink:0}
.logo-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.logo-sub{color:var(--text2);font-weight:400;font-size:13px}
.url-row{display:flex;flex:1;max-width:680px;gap:8px}
.url-in{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 12px;font-size:14px;font-family:inherit;outline:none;transition:border-color .15s}
.url-in:focus{border-color:var(--green)}
.url-in::placeholder{color:var(--text3)}

/* buttons */
.btn{border:1px solid transparent;border-radius:6px;padding:7px 16px;font-size:13px;font-weight:500;font-family:inherit;cursor:pointer;transition:all .15s;white-space:nowrap;line-height:1.4}
.btn:disabled{opacity:.4;cursor:not-allowed}
.b-green{background:var(--green-bg);border-color:var(--green-border);color:var(--green)}
.b-green:not(:disabled):hover{filter:brightness(1.1)}
.b-ghost{background:transparent;border-color:var(--border);color:var(--text2)}
.b-ghost:not(:disabled):hover{background:var(--bg3);color:var(--text)}
.b-primary{background:var(--green);border-color:var(--green);color:#fff;font-weight:600}
.b-primary:not(:disabled):hover{filter:brightness(1.08)}
.b-sm{padding:5px 11px;font-size:12px}
.btn-full{width:100%;margin-bottom:6px;text-align:center;display:block}

/* status bar */
.statusbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:6px 24px;font-size:12.5px;display:flex;align-items:center;gap:8px;flex-shrink:0}
.dot{width:7px;height:7px;border-radius:50%;background:var(--text3);flex-shrink:0;transition:background .3s}
.dot.live{background:var(--green)}.dot.spin{background:var(--amber);animation:blink 1s infinite}
.st-txt{color:var(--text2);flex:1;font-size:12.5px}
.badge-state{border-radius:4px;border:1px solid;padding:2px 10px;font-size:12px;font-weight:500}
.st-idle{border-color:var(--border);background:var(--bg3);color:var(--text2)}
.st-conn{border-color:var(--amber-bg);background:var(--amber-bg);color:var(--amber)}
.st-ok{border-color:var(--green-border);background:var(--green-bg);color:var(--green)}
.st-err{border-color:rgba(220,38,38,.3);background:var(--red-bg);color:var(--red)}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}

/* layout */
.body{display:flex;flex:1;overflow:hidden}
.left{width:268px;flex-shrink:0;background:var(--bg2);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
.lsec{padding:16px;border-bottom:1px solid var(--border)}
.lsec.flex1{flex:1;display:flex;flex-direction:column;overflow:hidden;border-bottom:none;min-height:0}
.sec-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}
.field{margin-bottom:10px}
.field label{display:block;font-size:12.5px;color:var(--text2);margin-bottom:5px}
.field input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:7px 10px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s}
.field input:focus{border-color:var(--green)}
.field input::placeholder{color:var(--text3)}
.dl-row{display:flex;gap:6px;margin-bottom:12px}

/* saved list */
.saved-scroll{flex:1;overflow-y:auto;min-height:0}
.saved-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:6px;background:transparent;border:1px solid transparent;margin-bottom:3px;font-size:13px;cursor:pointer;transition:all .12s}
.saved-row:hover{background:var(--bg3);border-color:var(--border)}
.saved-row.active{background:var(--green-bg);border-color:var(--green-border)}
.saved-icon{width:22px;height:22px;border-radius:4px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;color:var(--text3);font-weight:700;font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;border:1px solid var(--border)}
.saved-row.active .saved-icon{background:var(--green-bg);border-color:var(--green-border);color:var(--green)}
.saved-name{flex:1;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.saved-cnt{color:var(--text3);font-size:11px;white-space:nowrap;background:var(--bg3);border-radius:10px;padding:1px 7px;border:1px solid var(--border)}
.saved-del{background:none;border:none;color:var(--red);cursor:pointer;font-size:12px;padding:2px 4px;opacity:.4;border-radius:3px;transition:all .12s}
.saved-del:hover{opacity:1;background:var(--red-bg)}
.no-saved{text-align:center;padding:24px 10px;font-size:13px;color:var(--text3);line-height:1.8}

/* right panel */
.right{flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg)}
.right-hdr{padding:12px 20px;border-bottom:1px solid var(--border);background:var(--bg2);display:flex;align-items:center;gap:10px;flex-shrink:0}
.right-title{font-size:14px;font-weight:600;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.el-badge{background:var(--green-bg);color:var(--green);border:1px solid var(--green-border);border-radius:4px;padding:1px 8px;font-size:11.5px;font-weight:600}
.right-body{flex:1;overflow-y:auto}

/* element table */
.url-info{padding:8px 16px;font-size:12px;color:var(--text3);border-bottom:1px solid var(--border);font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace}
.el-table{width:100%;border-collapse:collapse;font-size:13px}
.el-table thead tr{border-bottom:1px solid var(--border)}
.el-table th{padding:9px 14px;text-align:left;color:var(--text3);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;background:var(--bg2)}
.el-table td{padding:7px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
.el-table tbody tr:hover td{background:var(--bg3)}
.key-in{background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:3px 7px;font-size:12.5px;font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;width:100%;min-width:90px;outline:none;transition:border-color .15s}
.key-in:focus{border-color:var(--green)}
.kind-chip{border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace}
.k-textbox{background:rgba(59,130,246,.12);color:#3b82f6}
.k-button{background:rgba(34,197,94,.1);color:#16a34a}
.k-link{background:rgba(245,158,11,.1);color:#d97706}
.k-combobox{background:rgba(139,92,246,.12);color:#7c3aed}
.k-checkbox{background:rgba(236,72,153,.1);color:#db2777}
.k-radio{background:rgba(249,115,22,.1);color:#ea580c}
.k-generic{background:rgba(107,114,128,.1);color:#6b7280}
.k-text{background:rgba(234,179,8,.1);color:#a16207}

.strat-txt{color:var(--text3);font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;font-size:12px}
.val-txt{color:var(--text2);font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.frame-txt{color:var(--text3);font-size:11.5px}

/* code view */
.code-wrap{padding:16px 20px}
.code-block{background:var(--bg2);border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 1px 4px var(--shadow)}
.code-block-hdr{padding:8px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--bg3)}
.code-lang{font-size:11px;color:var(--text3);font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.code-copy{background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text2);font-size:11.5px;padding:3px 10px;cursor:pointer;font-family:inherit;transition:all .15s}
.code-copy:hover{background:var(--green-bg);border-color:var(--green-border);color:var(--green)}
.code-body{padding:14px 16px;overflow-x:auto;font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.7;color:var(--code-text);white-space:pre;background:var(--code-bg)}

/* syntax tokens */
.tok-kw{color:#7c3aed}.tok-cls{color:#0550ae}.tok-fn{color:#0550ae}.tok-str{color:#116329}.tok-num{color:#953800}.tok-cmt{color:#9198a1;font-style:italic}.tok-op{color:#0550ae}

/* placeholder */
.placeholder{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;padding:60px 40px;text-align:center;height:100%}
.placeholder .ico{font-size:48px;opacity:.1;color:var(--text)}
.placeholder p{color:var(--text3);font-size:14px;line-height:1.7}
.placeholder strong{color:var(--green)}

/* scrollbar */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:var(--text3)}

/* element toolbar */
.el-toolbar{border-bottom:1px solid var(--border);background:var(--bg2)}
.kf-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 14px;border-bottom:1px solid var(--border)}
.filter-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;margin-right:2px;flex-shrink:0}
.kf-chips{display:flex;flex-wrap:wrap;gap:5px;flex:1}
.kf-chip{border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600;font-family:"SFMono-Regular",Menlo,Monaco,Consolas,monospace;cursor:pointer;border:1.5px solid transparent;transition:all .15s;display:inline-flex;align-items:center;gap:4px;opacity:1}
.kf-chip.partial{opacity:.65;filter:saturate(.6)}
.kf-chip.kf-off{opacity:.3;filter:saturate(0)}
.kf-chip .chip-cnt{font-size:10.5px;background:rgba(0,0,0,.13);border-radius:8px;padding:0 5px;min-width:18px;text-align:center;line-height:1.5}
.sel-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:7px 14px}
.el-toolbar-btns{display:flex;gap:6px;flex-wrap:wrap}
.sel-count{font-size:12.5px;color:var(--text2);white-space:nowrap}
.sel-count strong{color:var(--text)}
.row-cb{width:32px;text-align:center}
.el-row-off td{opacity:.35}
.el-row-off .key-in{pointer-events:none}

/* toast */
.toast{position:fixed;bottom:20px;right:20px;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;opacity:0;transform:translateY(6px);transition:all .2s;pointer-events:none;z-index:999;box-shadow:0 4px 12px var(--shadow)}
.toast.show{opacity:1;transform:translateY(0)}
.t-ok{background:var(--bg2);color:var(--text);border:1px solid var(--border)}
.t-err{background:var(--red-bg);color:var(--red);border:1px solid rgba(220,38,38,.3)}
</style>
</head>
<body>
<div class="hdr">
  <div class="logo">
    <div class="logo-icon"><svg viewBox="0 0 41 45" xmlns="http://www.w3.org/2000/svg" width="28" height="28" aria-label="Quarks"><path fill="#41B76C" d="M17.4036142,0.757616643 C19.1528748,-0.252538881 21.3090508,-0.252538881 23.0583113,0.757616643 L37.634577,9.17308848 C39.3838376,10.183244 40.4619256,12.0500277 40.4619256,14.0703388 L40.4619256,30.9012825 C40.4619256,32.9215935 39.3838376,34.7883772 37.634577,35.7985327 L23.0583113,44.2140046 C21.3090508,45.2241601 19.1528748,45.2241601 17.4036142,44.2140046 L2.82734855,35.7985327 C1.07808797,34.7883772 0,32.9215935 0,30.9012825 L0,14.0703388 C0,12.0500277 1.07808797,10.183244 2.82734855,9.17308848 Z M20.2309628,8.23222406 C12.3589505,8.23222406 5.97737623,14.6137984 5.97737623,22.4858106 C5.97737623,30.3578229 12.3589505,36.7393972 20.2309628,36.7393972 C28.102975,36.7393972 34.4845493,30.3578229 34.4845493,22.4858106 C34.4845493,14.6137984 28.102975,8.23222406 20.2309628,8.23222406 Z M22.0260098,17.8831154 C22.0260098,17.3260693 22.6285707,16.9782552 23.110891,17.2567782 L31.5209283,22.1119104 C32.0032487,22.3904335 32.0032487,23.0867411 31.5209283,23.3652641 L23.110891,28.2203963 C22.6285707,28.4989193 22.0260098,28.1511052 22.0260098,27.5940591 L22.0260098,17.8831154 Z M17.7563195,17.2566424 C18.2386399,16.9781193 18.8412007,17.3266128 18.8412007,17.8829796 L18.8412007,27.5939232 C18.8412007,28.1509693 18.2386399,28.4987834 17.7563195,28.2202604 L9.34628226,23.3651282 C8.86396187,23.0866052 8.86396187,22.3902976 9.34628226,22.1124539 L17.7563195,17.2566424 Z"/></svg></div>
    AutomationAI
    <span class="logo-sub">Recorder</span>
  </div>
  <div class="url-row">
    <input id="urlIn" class="url-in" type="url" placeholder="https://your-app.com" autocomplete="off"/>
    <button class="btn b-green" id="openBtn">Open browser</button>
    <button class="btn b-ghost" id="closeBtn" style="display:none">Close browser</button>
  </div>
</div>
<div class="statusbar">
  <div class="dot" id="dot"></div>
  <span class="st-txt" id="stTxt">Enter a URL and click Open browser to start recording.</span>
  <span class="badge-state st-idle" id="stateBadge">Not connected</span>
</div>
<div class="body">
  <div class="left">
    <div class="lsec">
      <div class="sec-label">Capture</div>
      <div class="field">
        <label>Page name</label>
        <input id="nameIn" type="text" placeholder="e.g. LoginPage"/>
      </div>
      <button class="btn b-green btn-full" id="captureBtn" disabled>Capture current page</button>
      <button class="btn b-primary btn-full" id="saveBtn" disabled>Save page object</button>
    </div>
    <div class="lsec flex1">
      <div class="sec-label">Saved pages</div>
      <div class="dl-row">
        <button class="btn b-ghost b-sm" id="dlZip" disabled style="flex:1">&#x2193; .ts ZIP</button>
        <button class="btn b-ghost b-sm" id="dlJson" disabled style="flex:1">&#x2193; Download JSON</button>
      </div>
      <div class="saved-scroll" id="savedList">
        <div class="no-saved">No pages saved yet.<br>Capture and save a page<br>to see it here.</div>
      </div>
    </div>
  </div>
  <div class="right">
    <div class="right-hdr">
      <span class="right-title" id="rTitle">Captured elements</span>
      <span class="el-badge" id="badge" style="display:none"></span>
    </div>
    <div class="right-body" id="rBody">
      <div class="placeholder">
        <div class="ico">&#9711;</div>
        <p>Open a browser and navigate to a page,<br>then click <strong>Capture current page</strong>.<br><br>Click a saved page on the left to view its code.</p>
      </div>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
let captured=[];
let activePageName=null;
const $=id=>document.getElementById(id);
const urlIn=$('urlIn'),openBtn=$('openBtn'),closeBtn=$('closeBtn'),
      captureBtn=$('captureBtn'),saveBtn=$('saveBtn'),
      dlZip=$('dlZip'),dlJson=$('dlJson'),nameIn=$('nameIn'),
      savedList=$('savedList'),rBody=$('rBody'),rTitle=$('rTitle'),
      badge=$('badge'),dot=$('dot'),stTxt=$('stTxt'),
      stateBadge=$('stateBadge'),toast=$('toast');

function setState(label,cls){stateBadge.textContent=label;stateBadge.className='badge-state '+cls;}
function setStatus(t,dotCls){stTxt.textContent=t;dot.className='dot'+(dotCls?' '+dotCls:'');}
function showToast(m,type){
  toast.textContent=m;
  toast.className='toast show '+(type==='err'?'t-err':'t-ok');
  clearTimeout(toast._t);toast._t=setTimeout(()=>toast.className='toast',3400);
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function pascal(s){return s.replace(/[^a-zA-Z0-9 ]/g,' ').trim().split(/\\s+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join('');}
function suggestName(title,url){
  // 1. Try the last meaningful URL path segment first \u2014 most reliable for SPAs
  try{
    const segs=new URL(url).pathname.split('/').filter(s=>s&&!/^(index|home|main|app|#)$/i.test(s));
    const seg=segs[segs.length-1]||'';
    const n=pascal(seg.replace(/[^a-zA-Z0-9]/g,' '));
    if(n.length>=2)return n.endsWith('Page')?n:n+'Page';
  }catch{}
  // 2. Fall back to the page-specific part of the title (text before the first | or \u2014 separator)
  const parts=(title||'').split(/\s*[\|\u2013\u2014\u00b7\u2022]\s*/);
  const pageTitle=(parts.length>1?parts[0]:title||'').trim();
  const t=pascal(pageTitle.replace(/[^a-zA-Z0-9 ]/g,' ')).slice(0,40);
  if(t.length>=2)return t.endsWith('Page')?t:t+'Page';
  return '';
}

const KIND_CLASS={textbox:'k-textbox',button:'k-button',link:'k-link',combobox:'k-combobox',checkbox:'k-checkbox',radio:'k-radio',generic:'k-generic',text:'k-text'};

function highlightTs(code){
  return esc(code)
    .replace(/(\\\/\\\/[^\\n]*)/g,'<span class="tok-cmt">$1</span>')
    .replace(/\\b(import|export|from|class|extends|private|static|readonly|const|let|var|async|await|return|new|this|as)\\b/g,'<span class="tok-kw">$1</span>')
    .replace(/\\b(Promise|void|string|number|boolean|Page)\\b/g,'<span class="tok-cls">$1</span>')
    .replace(/'([^'<]*)'/g,'<span class="tok-str">$&</span>')
    .replace(/\\b(\\d[\\d_]*)\\b/g,'<span class="tok-num">$1</span>');
}

function renderCode(className,content){
  rTitle.textContent=className+'.ts';
  badge.style.display='none';
  rBody.innerHTML='<div class="code-wrap"><div class="code-block">'
    +'<div class="code-block-hdr"><span class="code-lang">TypeScript</span>'
    +'<button class="code-copy" id="copyBtn">Copy</button></div>'
    +'<div class="code-body">'+highlightTs(content)+'</div>'
    +'</div></div>';
  $('copyBtn').addEventListener('click',()=>{
    navigator.clipboard.writeText(content).then(()=>showToast('Copied to clipboard')).catch(()=>showToast('Copy failed','err'));
  });
}

function renderTable(elements,url,frameCount){
  if(!elements.length)return '<div class="placeholder"><div class="ico">&#9711;</div><p>No interactive elements found.<br>Navigate to a page with forms or buttons.</p></div>';
  const hdr=url?'<div class="url-info">'+esc(url)+(frameCount>1?' &nbsp;&middot;&nbsp; '+frameCount+' frames':'')+'</div>':'';
  // Build kind → indices map for filter chips
  const kindMap={};
  elements.forEach((el,i)=>{const k=el.actionKind||'generic';(kindMap[k]=kindMap[k]||[]).push(i);});
  const chipHtml=Object.entries(kindMap).map(([kind,indices])=>{
    const cc=KIND_CLASS[kind]||'k-generic';
    return '<button class="kf-chip '+cc+'" data-kind="'+kind+'">'+kind+' <span class="chip-cnt">'+indices.length+'/'+indices.length+'</span></button>';
  }).join('');
  const toolbar='<div class="el-toolbar">'
    +'<div class="kf-row"><span class="filter-label">Kind</span><div class="kf-chips" id="kfChips">'+chipHtml+'</div></div>'
    +'<div class="sel-row">'
    +'<span class="sel-count" id="selCount"><strong>'+elements.length+'</strong> of <strong>'+elements.length+'</strong> selected</span>'
    +'<div class="el-toolbar-btns">'
    +'<button class="btn b-ghost b-sm" id="selAll">Select all</button>'
    +'<button class="btn b-ghost b-sm" id="deselAll">Deselect all</button>'
    +'</div></div></div>';
  const rows=elements.map((el,i)=>{
    const cc=KIND_CLASS[el.actionKind]||'k-generic';
    const sub=[el.frame?'&#x2393; '+esc(el.frame):null,el.shadowHost?'&#x25A1; '+esc(el.shadowHost):null].filter(Boolean).join(' ');
    return '<tr id="elrow-'+i+'">'
      +'<td class="row-cb"><input type="checkbox" class="row-check" data-i="'+i+'" checked/></td>'
      +'<td><input class="key-in" data-i="'+i+'" value="'+esc(el.key)+'"/></td>'
      +'<td><span class="kind-chip '+cc+'">'+esc(el.actionKind)+'</span></td>'
      +'<td class="strat-txt">'+esc(el.strategy)+'</td>'
      +'<td class="val-txt" title="'+esc(el.value)+'">'+esc((el.value||'').slice(0,52))+'</td>'
      +'<td class="frame-txt">'+(sub||'')+'</td>'
      +'</tr>';
  }).join('');
  return hdr+toolbar+'<table class="el-table"><thead><tr><th class="row-cb"></th><th>Key</th><th>Kind</th><th>Strategy</th><th>Value</th><th>Frame/Shadow</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

let lastUrl='';
let nameUserEdited=false;
nameIn.addEventListener('input',()=>{nameUserEdited=!!nameIn.value.trim();});

function applySuggestion(title,url){
  const s=suggestName(title,url);
  if(!s)return;
  if(!nameUserEdited){
    nameIn.value=s;           // fill the field
  }
  nameIn.placeholder=s;       // always show as hint
}

async function poll(){
  try{
    const d=await fetch('/api/status').then(r=>r.json());
    if(d.running){
      setStatus('Browser open \u2014 '+(d.url||''),'live');
      setState('Connected','st-ok');
      captureBtn.disabled=false;openBtn.style.display='none';closeBtn.style.display='';
      if(d.url!==lastUrl){
        lastUrl=d.url||'';
        nameUserEdited=false;   // new page \u2014 reset manual-edit flag
        nameIn.value='';        // clear old value so suggestion shows fresh
        applySuggestion(d.title||'',d.url||'');
      }
    }else{
      setStatus('No browser open. Enter a URL and click Open browser.','');
      setState('Not connected','st-idle');
      captureBtn.disabled=true;openBtn.style.display='';closeBtn.style.display='none';
      lastUrl='';nameUserEdited=false;nameIn.placeholder='e.g. LoginPage';
    }
  }catch{}
}
setInterval(poll,1800);poll();

openBtn.addEventListener('click',async()=>{
  const url=urlIn.value.trim();if(!url){showToast('Enter a URL','err');return;}
  openBtn.disabled=true;openBtn.textContent='Opening\u2026';
  setStatus('Launching browser\u2026','spin');setState('Opening\u2026','st-conn');
  try{
    const d=await fetch('/api/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})}).then(r=>r.json().then(b=>({ok:r.ok,...b})));
    if(!d.ok)throw new Error(d.error||'Failed');
    showToast('Browser opened');lastUrl=d.url||'';
  }catch(e){showToast(e.message,'err');setStatus('Error: '+e.message,'');setState('Error','st-err');}
  finally{openBtn.disabled=false;openBtn.textContent='Open browser';}
});
urlIn.addEventListener('keydown',e=>{if(e.key==='Enter')openBtn.click();});

closeBtn.addEventListener('click',async()=>{
  closeBtn.disabled=true;closeBtn.textContent='Closing\u2026';
  try{await fetch('/api/close',{method:'POST'});showToast('Browser closed');}
  catch(e){showToast(e.message,'err');}
  finally{closeBtn.disabled=false;closeBtn.textContent='Close browser';poll();}
});

captureBtn.addEventListener('click',async()=>{
  captureBtn.disabled=true;saveBtn.disabled=true;captured=[];badge.style.display='none';
  captureBtn.textContent='Capturing\u2026';setState('Capturing\u2026','st-conn');
  activePageName=null;refreshSavedHighlight();
  rBody.innerHTML='<div class="placeholder"><div class="ico">&#9711;</div><p>Reading all frames\u2026</p></div>';
  try{
    const d=await fetch('/api/capture',{method:'POST'}).then(r=>r.json().then(b=>({ok:r.ok,...b})));
    if(!d.ok)throw new Error(d.error||'Capture failed');
    captured=d.elements||[];
    if(!captured.length){rBody.innerHTML=renderTable([]);showToast('No elements found','err');setState('Connected','st-ok');return;}
    // All elements selected by default
    captured.forEach(el=>{el.selected=true;});
    badge.textContent=captured.length;badge.style.display='';
    rTitle.textContent='Captured \u2014 '+(d.title||d.url||'');
    rBody.innerHTML=renderTable(captured,d.url,d.frameCount);

    function updateSelCount(){
      const sel=captured.filter(el=>el.selected).length;
      const countEl=document.getElementById('selCount');
      if(countEl)countEl.innerHTML='<strong>'+sel+'</strong> of <strong>'+captured.length+'</strong> selected';
      saveBtn.disabled=sel===0;
    }

    function setRowSelected(i,on){
      captured[i].selected=on;
      const row=document.getElementById('elrow-'+i);
      if(row)row.classList.toggle('el-row-off',!on);
      const cb=rBody.querySelector('.row-check[data-i="'+i+'"]');
      if(cb)cb.checked=on;
    }

    function updateChips(){
      rBody.querySelectorAll('.kf-chip').forEach(chip=>{
        const kind=chip.dataset.kind;
        const kindEls=captured.filter(el=>(el.actionKind||'generic')===kind);
        const selN=kindEls.filter(el=>el.selected).length;
        const allOn=selN===kindEls.length;
        const noneOn=selN===0;
        chip.classList.toggle('kf-off',noneOn);
        chip.classList.toggle('partial',!allOn&&!noneOn);
        const cnt=chip.querySelector('.chip-cnt');
        if(cnt)cnt.textContent=selN+'/'+kindEls.length;
      });
    }

    // Key edits
    rBody.querySelectorAll('.key-in').forEach(inp=>{
      inp.addEventListener('change',e=>{const i=+e.target.dataset.i;if(captured[i])captured[i].key=e.target.value.trim()||captured[i].key;});
    });

    // Row checkboxes
    rBody.querySelectorAll('.row-check').forEach(cb=>{
      cb.addEventListener('change',e=>{setRowSelected(+e.target.dataset.i,e.target.checked);updateSelCount();updateChips();});
    });

    // Kind filter chips — click toggles entire kind on/off
    rBody.querySelectorAll('.kf-chip').forEach(chip=>{
      chip.addEventListener('click',()=>{
        const kind=chip.dataset.kind;
        const kindEls=captured.filter(el=>(el.actionKind||'generic')===kind);
        const allOn=kindEls.every(el=>el.selected);
        captured.forEach((el,i)=>{if((el.actionKind||'generic')===kind)setRowSelected(i,!allOn);});
        updateSelCount();updateChips();
      });
    });

    // Select all
    const selAllBtn=document.getElementById('selAll');
    if(selAllBtn)selAllBtn.addEventListener('click',()=>{captured.forEach((_,i)=>setRowSelected(i,true));updateSelCount();updateChips();});

    // Deselect all
    const deselAllBtn=document.getElementById('deselAll');
    if(deselAllBtn)deselAllBtn.addEventListener('click',()=>{captured.forEach((_,i)=>setRowSelected(i,false));updateSelCount();updateChips();});

    applySuggestion(d.title||'',d.url||'');
    saveBtn.disabled=false;setState('Connected','st-ok');
    showToast(captured.length+' elements ('+d.frameCount+' frames)');
  }catch(e){
    rBody.innerHTML='<div class="placeholder"><div class="ico">&#9711;</div><p>'+esc(e.message)+'</p></div>';
    showToast(e.message,'err');setState('Error','st-err');
  }finally{captureBtn.disabled=false;captureBtn.textContent='Capture current page';}
});

saveBtn.addEventListener('click',async()=>{
  const name=nameIn.value.trim();if(!name){showToast('Enter a page name','err');return;}
  if(!captured.length){showToast('Capture a page first','err');return;}
  const toSave=captured.filter(el=>el.selected);
  if(!toSave.length){showToast('Select at least one element before saving','err');return;}
  saveBtn.disabled=true;saveBtn.textContent='Saving\u2026';
  try{
    const cn=pascal(name);
    const d=await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({className:cn,elements:toSave})}).then(r=>r.json().then(b=>({ok:r.ok,...b})));
    if(!d.ok)throw new Error(d.error||'Save failed');
    showToast(d.className+'.ts saved');
    captured=[];badge.style.display='none';
    nameIn.value='';nameUserEdited=false;saveBtn.disabled=true;
    await refreshSaved();
    showPageContent(cn);
  }catch(e){showToast(e.message,'err');saveBtn.disabled=false;}
  finally{saveBtn.textContent='Save page object';}
});

async function showPageContent(className){
  activePageName=className;
  refreshSavedHighlight();
  try{
    const d=await fetch('/api/pages/'+encodeURIComponent(className)).then(r=>r.json());
    if(!d.content){showToast('Content not found','err');return;}
    renderCode(className,d.content);
  }catch(e){showToast(e.message,'err');}
}

function refreshSavedHighlight(){
  savedList.querySelectorAll('.saved-row').forEach(row=>{
    row.classList.toggle('active',row.dataset.name===activePageName);
    row.querySelector('.saved-icon').textContent=row.dataset.name===activePageName?'\u2022':'ts';
  });
}

async function refreshSaved(){
  const d=await fetch('/api/pages').then(r=>r.json());const pages=d.pages||[];
  dlZip.disabled=dlJson.disabled=!pages.length;
  if(!pages.length){savedList.innerHTML='<div class="no-saved">No pages saved yet.<br>Capture and save a page<br>to see it here.</div>';return;}
  savedList.innerHTML=pages.map(p=>
    '<div class="saved-row" data-name="'+esc(p.className)+'">'
    +'<div class="saved-icon">ts</div>'
    +'<span class="saved-name" title="'+esc(p.className)+'">'+esc(p.className)+'</span>'
    +'<span class="saved-cnt">'+p.elementCount+'</span>'
    +'<button class="saved-del" data-n="'+esc(p.className)+'" title="Delete">&#x2715;</button>'
    +'</div>'
  ).join('');
  savedList.querySelectorAll('.saved-row').forEach(row=>{
    row.addEventListener('click',e=>{if(e.target.classList.contains('saved-del'))return;showPageContent(row.dataset.name);});
  });
  savedList.querySelectorAll('.saved-del').forEach(b=>{
    b.addEventListener('click',async e=>{
      e.stopPropagation();
      await fetch('/api/pages/'+encodeURIComponent(b.dataset.n),{method:'DELETE'});
      if(activePageName===b.dataset.n){
        activePageName=null;
        rTitle.textContent='Captured elements';
        rBody.innerHTML='<div class="placeholder"><div class="ico">&#9711;</div><p>Select a saved page to view its code.</p></div>';
      }
      await refreshSaved();
    });
  });
  refreshSavedHighlight();
}
dlZip.addEventListener('click',()=>{window.location.href='/api/download/zip';});
dlJson.addEventListener('click',()=>{window.location.href='/api/download/json';});
refreshSaved();
</script>
</body>
</html>`;


// ── HTTP request handler ───────────────────────────────────────────────────

async function handle(req, res) {
  const { pathname } = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const method = req.method;

  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML); return;
  }

  if (pathname === "/api/status" && method === "GET") {
    const running = activePage !== null && !activePage.isClosed();
    const url   = running ? activePage.url()                     : null;
    const title = running ? await activePage.title().catch(()=>"") : null;
    jsonRes(res, 200, { running, url, title }); return;
  }

  if (pathname === "/api/open" && method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    if (!body.url) { jsonRes(res, 400, { error: "url required" }); return; }
    try {
      if (!pwBrowser?.isConnected()) {
        console.log("  Launching browser…");
        try   { pwBrowser = await chromium.launch({ headless: false, channel: "chrome" }); console.log("  System Chrome"); }
        catch { pwBrowser = await chromium.launch({ headless: false }); console.log("  Bundled Chromium"); }
        pwContext = await pwBrowser.newContext();

        // Track active page across new tabs and popups — same logic as capture-dom.mjs
        pwContext.on("page", newPage => {
          activePage = newPage;
          newPage.waitForLoadState("domcontentloaded").catch(() => {});
          newPage.on("close", () => {
            const pages = pwContext.pages();
            if (pages.length > 0) activePage = pages[pages.length - 1];
          });
        });
      }

      if (!activePage || activePage.isClosed()) {
        activePage = await pwContext.newPage();
      }

      const rawUrl = String(body.url ?? "").trim();
      // Fix common typos: https//... → https://...  or  missing protocol
      const fixedUrl = rawUrl.match(/^https?:\/\//i)
        ? rawUrl
        : rawUrl.match(/^https?:\/[^/]/i)
          ? rawUrl.replace(/^(https?):\/([^/])/i, "$1://$2")
          : rawUrl.match(/^\/\//)
            ? `https:${rawUrl}`
            : `https://${rawUrl.replace(/^\/+/, "")}`;
      console.log("  Navigating to:", fixedUrl);
      await activePage.goto(fixedUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("  Nav:", e.message));
      jsonRes(res, 200, { ok: true, url: activePage.url() });
    } catch (e) {
      console.error("  Launch error:", e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === "/api/close" && method === "POST") {
    try { if (pwBrowser?.isConnected()) await pwBrowser.close(); } catch {}
    pwBrowser = null; pwContext = null; activePage = null;
    jsonRes(res, 200, { ok: true }); return;
  }

  if (pathname === "/api/capture" && method === "POST") {
    if (!activePage || activePage.isClosed()) {
      jsonRes(res, 400, { error: "Browser not open. Click Open Browser first." }); return;
    }
    try {
      await activePage.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      const nodes = await captureAllNodes(activePage);
      const elements = parseNodes(nodes);
      const frameCount = new Set(nodes.map(n => n.frame ?? "__main__")).size;
      console.log(`  Captured ${nodes.length} nodes → ${elements.length} elements across ${frameCount} frame(s) from ${activePage.url()}`);
      jsonRes(res, 200, { elements, url: activePage.url(), title: await activePage.title().catch(()=>""), frameCount });
    } catch (e) {
      console.error("  Capture error:", e.message);
      jsonRes(res, 500, { error: e.message });
    }
    return;
  }

  if (pathname === "/api/save" && method === "POST") {
    const body = await readBody(req).catch(() => ({}));
    if (!body.className || !Array.isArray(body.elements)) { jsonRes(res, 400, { error: "className and elements required" }); return; }
    const className = toPascal(body.className);
    const content = generateTs(className, body.elements);
    if (!content) { jsonRes(res, 400, { error: "No elements to save" }); return; }
    await mkdir(OUTPUT_DIR, { recursive: true });
    await writeFile(path.join(OUTPUT_DIR, `${className}.ts`), content, "utf8");
    savedPages.set(className, { className, modulePath: `pageobjects/${className}.ts`, content, elementCount: body.elements.length });
    console.log(`  Saved ${className}.ts (${body.elements.length} elements)`);
    jsonRes(res, 201, { className, elementCount: body.elements.length }); return;
  }

  if (pathname === "/api/pages" && method === "GET") {
    jsonRes(res, 200, { pages: [...savedPages.values()].map(({ className, modulePath, elementCount }) => ({ className, modulePath, elementCount })) }); return;
  }

  const delM = pathname.match(/^\/api\/pages\/(.+)$/);
  if (delM && method === "GET") {
    const name = decodeURIComponent(delM[1]);
    const page = savedPages.get(name);
    if (!page) { jsonRes(res, 404, { error: "Not found" }); return; }
    jsonRes(res, 200, { className: page.className, content: page.content, elementCount: page.elementCount });
    return;
  }
  if (delM && method === "DELETE") { savedPages.delete(decodeURIComponent(delM[1])); jsonRes(res, 200, { ok: true }); return; }

  if (pathname === "/api/download/zip" && method === "GET") {
    if (!savedPages.size) { jsonRes(res, 400, { error: "No pages saved" }); return; }
    const zip = buildZip([...savedPages.values()].map(({ className, content }) => ({ name: `pageobjects/${className}.ts`, content })));
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="page-objects-${Date.now()}.zip"`, "Content-Length": zip.length });
    res.end(zip); return;
  }

  if (pathname === "/api/download/json" && method === "GET") {
    if (!savedPages.size) { jsonRes(res, 400, { error: "No pages saved" }); return; }
    const bundle = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), pageObjects: [...savedPages.values()].map(({ className, modulePath, content }) => ({ className, modulePath, content })) }, null, 2);
    res.writeHead(200, { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="page-objects-${Date.now()}.json"` });
    res.end(bundle); return;
  }

  res.writeHead(404); res.end("Not found");
}

// ── Start ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  try { await handle(req, res); }
  catch (e) { if (!res.headersSent) jsonRes(res, 500, { error: e.message }); }
});

function startServer(port, attempt = 0) {
  server.listen(port, "0.0.0.0", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`\n \x1b[1m\x1b[36mAutomationAI Web Recorder\x1b[0m`);
    console.log(` UI  → \x1b[32m\x1b[4m${url}\x1b[0m`);
    console.log(` Out → ./pageobjects/\n`);
    const cmd = process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  });

  server.on("error", e => {
    if (e.code === "EADDRINUSE" && attempt < 10) {
      const next = port + 1;
      console.log(` Port ${port} in use, trying ${next}…`);
      server.removeAllListeners("error");
      server.close(() => startServer(next, attempt + 1));
    } else if (e.code === "EADDRINUSE") {
      console.error(`\x1b[31m Could not find a free port after 10 attempts. Specify one with --port\x1b[0m`);
      process.exit(1);
    } else {
      console.error(e.message);
      process.exit(1);
    }
  });
}

startServer(PORT);

process.on("SIGINT", async () => {
  console.log("\n Shutting down…");
  if (pwBrowser) await pwBrowser.close().catch(() => {});
  server.close(); process.exit(0);
});
