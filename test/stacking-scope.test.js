// Regression test for the sidebar-stacking CSS scope.
//
// Bug: the grid-template-rows rule targeted the bare grid class
// (.ticket-panes-grid-layout), which also matches the NEW-ticket
// "-standard-layout" grid. That grid never gets data-zd-pane tags (tagging
// only runs on "-custom-layout" grids), so the forced 2-row template collapsed
// the un-placed panes and broke the new-ticket page. The row rule must only
// apply to a grid that actually contains a tagged notes pane.
//
// Run:  node test/stacking-scope.test.js

const path = require('path');

const noop = () => {};
global.window = { addEventListener: noop };
global.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }),
    documentElement: {}, head: {}, body: {}
};
global.MutationObserver = class { observe() {} disconnect() {} };
global.chrome = { storage: { sync: { get: noop }, onChanged: { addListener: noop } }, runtime: {} };

require(path.join(__dirname, '..', 'extension', 'customizer-apply.js'));

const api = global.window.ZDCustomizerApply;
let ok = true;
function assert(cond, msg) { if (!cond) { ok = false; console.error('  FAIL:', msg); } else { console.log('  ok:', msg); } }

for (const mode of ['right', 'left']) {
    const css = api.buildStackCSS(mode);
    // Find the line carrying the row template.
    const rowLine = css.split('\n').find((l) => l.includes('grid-template-rows'));
    assert(!!rowLine, `[${mode}] emits a grid-template-rows rule`);
    assert(rowLine.includes(':has([data-zd-pane="notes"])'),
        `[${mode}] row rule is gated on a tagged notes pane (won't hit standard-layout grids)`);
    // The selector must NOT be the bare grid class with no gate.
    assert(!/\.ticket-panes-grid-layout\s*\{\s*grid-template-rows/.test(css),
        `[${mode}] row rule is not applied to the bare grid class`);
}

console.log(ok ? '\nPASS: stacking row rule is properly scoped' : '\nFAIL: see errors above');
process.exit(ok ? 0 : 1);
