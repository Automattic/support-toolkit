// Load smoke test for the content-script modules.
//
// `node --check` only validates syntax; it cannot catch a top-level
// ReferenceError (e.g. exporting an identifier that was deleted), which aborts
// a module's IIFE so its `window.ZD*` global is never set. This harness stubs
// the browser globals and actually executes each module, then asserts the
// expected globals exist.
//
// Run:  node test/load-smoke.js
//
// Add modules to FILES / EXPECTED_GLOBALS as the extension grows.

const path = require('path');

const EXT_DIR = path.join(__dirname, '..', 'extension');
const FILES = ['zendesk-selectors.js', 'customizer-apply.js', 'zd-styling.js', 'site-tools-menu.js'];
const EXPECTED_GLOBALS = ['ZDZendeskSelectors', 'ZDCustomizerApply', 'ZDStyling', 'ZDSiteToolsMenu'];

const noop = () => {};
const elStub = () => ({
    style: {}, textContent: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, addEventListener: noop, setAttribute: noop,
    getAttribute: () => null, querySelector: () => null, querySelectorAll: () => [],
    remove: noop, contains: () => false
});

global.window = { addEventListener: noop, requestAnimationFrame: noop };
global.requestAnimationFrame = noop;
global.document = Object.assign(elStub(), {
    documentElement: elStub(), head: elStub(), body: elStub(),
    createElement: elStub, getElementById: () => null, addEventListener: noop
});
global.getComputedStyle = () => ({ getPropertyValue: () => '', fontFamily: '', fontSize: '' });
global.CSS = { supports: () => true };
global.MutationObserver = class { observe() {} disconnect() {} };
global.Event = class { constructor(type) { this.type = type; } };
global.Node = { ELEMENT_NODE: 1 };
global.chrome = {
    storage: { sync: { get: noop, set: noop }, local: { get: noop, set: noop }, onChanged: { addListener: noop } },
    runtime: { getManifest: () => ({ version: 'test' }) }
};

let ok = true;
for (const f of FILES) {
    try { require(path.join(EXT_DIR, f)); console.log('  loaded OK:', f); }
    catch (e) { ok = false; console.error('  THREW:', f, '->', e.message); }
}
for (const g of EXPECTED_GLOBALS) {
    if (!global.window[g]) { ok = false; console.error('  MISSING GLOBAL:', g); }
}

console.log(ok ? '\nPASS: all modules load and expose their globals' : '\nFAIL: see errors above');
process.exit(ok ? 0 : 1);
