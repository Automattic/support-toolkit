// Config bridge for the main-world Workflow Helper.
//
// workflow-helper.js runs in the page's MAIN world (it needs window.LotusReact),
// where chrome.* APIs are unavailable. This tiny isolated-world content script
// reads the feature flags from chrome.storage and hands them to the main-world
// script through the shared DOM: it writes a JSON blob onto documentElement's
// data-zd-workflow-config attribute and fires a bare 'zd-workflow-config' signal
// event. It republishes whenever the config changes, so toggles apply live.
//
// (A DOM attribute is used rather than CustomEvent detail because event detail
// is not reliably cloned across the isolated/main world boundary; the shared DOM
// node's attribute always is.)

(function () {
    'use strict';

    const CONFIG_KEY = 'ZDCounter-config';
    const ATTR = 'data-zd-workflow-config';
    const KEYS = ['wfDraftMode', 'wfMergeUncheck', 'wfStayOnTicket', 'wfMessagingDefault'];

    function publish(cfg) {
        cfg = cfg || {};
        const flags = {};
        KEYS.forEach((k) => { flags[k] = cfg[k] !== false; }); // default ON
        try {
            document.documentElement.setAttribute(ATTR, JSON.stringify(flags));
            document.dispatchEvent(new Event('zd-workflow-config'));
        } catch (e) {
            /* ignore */
        }
    }

    function refresh() {
        try {
            chrome.storage.sync.get([CONFIG_KEY], (res) => publish((res && res[CONFIG_KEY]) || {}));
        } catch (e) {
            publish({});
        }
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) {
        /* ignore */
    }

    window.ZDWorkflowHelperBridge = { refresh };
    refresh();
})();
