// Per-site "Tools" dropdown inside the Zendesk User Info app iframe.
//
// The Sites list lives INSIDE the User Info app iframe, which is cross-origin
// from a8c.zendesk.com (served from 126740.apps.zdusercontent.com). This module
// is injected into that origin via its own manifest content-script block. It
// anchors on each site row's "Blog RC" link, reads the site's blog_id and
// domain from what the app already rendered, and appends a "Tools" toggle that
// opens a small dropdown of quick links to internal a8c tools. The agent opens
// those links by clicking — standard navigation, no data leaves the page.
//
// Gated by config.siteToolsMenu; content scripts can use chrome.storage on any
// origin, so it reads the flag directly and live-refreshes on storage change.

(function () {
    'use strict';

    const CONFIG_KEY = 'ZDCounter-config';
    let enabled = true;

    // One entry per menu item. `make` receives { domain, blogId } — domain has
    // no protocol (e.g. "example.com"), blogId is a string of digits.
    const MENU_LINKS = [
        { label: 'Blog RC', make: (s) => 'https://mc.a8c.com/tools/reportcard/blog/?blog_id=' + s.blogId },
        { label: 'Domain RC', make: (s) => 'https://mc.a8c.com/tools/reportcard/domain/?domain=' + s.domain },
        { label: 'JP Debugger', make: (s) => 'https://jptools.wordpress.com/debug/?url=https://' + s.domain },
        { label: 'Site Profiles', make: (s) => 'https://mc.a8c.com/site-profiles/?q=https://' + s.domain },
        { label: 'robots.txt', make: (s) => 'https://' + s.domain + '/robots.txt' },
        { label: 'hosting-provider', make: (s) => 'https://' + s.domain + '/.well-known/hosting-provider' },
        { label: 'CLI', make: (s) => 'https://' + s.domain + '/_cli' },
        { label: 'Site Health', make: (s) => 'https://' + s.domain + '/wp-admin/site-health.php' },
        { label: 'Rewind DB', make: (s) => 'https://mc.a8c.com/rewind/debugger.php?site=' + s.blogId }
    ];

    const TOGGLE_CLASS = 'zdstm-toggle';
    const MENU_CLASS = 'zdstm-menu';

    function injectStyles() {
        if (document.getElementById('zdstm-styles')) return;
        const style = document.createElement('style');
        style.id = 'zdstm-styles';
        style.textContent =
            '.' + TOGGLE_CLASS + '{cursor:pointer;white-space:nowrap;}' +
            '.' + MENU_CLASS + '{position:fixed;z-index:99999;background:rgba(255,255,255,.94);' +
            'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(15,23,42,.08);' +
            'border-radius:12px;box-shadow:0 1px 2px rgba(2,6,23,.06),0 16px 40px rgba(2,6,23,.18);' +
            'padding:0 0 5px;min-width:150px;overflow:hidden;' +
            'font:12px/1.4 system-ui,-apple-system,sans-serif;animation:zdstm-in .14s ease-out;}' +
            '.' + MENU_CLASS + '::before{content:"";display:block;height:3px;margin-bottom:4px;' +
            'background:linear-gradient(90deg,#3858e9,#7a5af8);}' +
            '@keyframes zdstm-in{from{opacity:0;transform:translateY(-3px) scale(.98);}to{opacity:1;transform:none;}}' +
            '@media (prefers-reduced-motion:reduce){.' + MENU_CLASS + '{animation:none;}}' +
            '.' + MENU_CLASS + ' a{display:block;padding:6px 14px;color:#3d4350;font-weight:500;text-decoration:none;white-space:nowrap;' +
            'transition:background .12s ease,color .12s ease;}' +
            '.' + MENU_CLASS + ' a:hover{background:#f4f6ff;color:#3858e9;text-decoration:none;}' +
            '.' + MENU_CLASS + ' a:focus-visible{outline:none;background:#eef1ff;color:#3858e9;}';
        document.head.appendChild(style);
    }

    function closeMenus() {
        document.querySelectorAll('.' + MENU_CLASS).forEach((menu) => menu.remove());
    }

    // The "Blog RC" anchor sits in its own little wrapper; the row with ALL the
    // links is the first ancestor holding several anchors. Depth-limited.
    function linksRowFor(blogRcLink) {
        let node = blogRcLink.parentElement;
        for (let depth = 0; node && depth < 4; depth++) {
            if (node.querySelectorAll('a').length >= 3) return node;
            node = node.parentElement;
        }
        return blogRcLink.parentElement;
    }

    // Extract this site row's identifiers from what the app already rendered.
    function siteInfoFor(blogRcLink, row) {
        let blogId = null;
        try {
            blogId = new URL(blogRcLink.href).searchParams.get('blog_id');
        } catch (error) {
            /* fall through */
        }

        let domain = null;
        // 1) The WP-Admin link points at the site itself — its host IS the site
        //    domain (including *.wordpress.com free-site domains; only rule out
        //    internal tool hosts).
        const anchors = row.querySelectorAll('a[href]');
        for (let i = 0; i < anchors.length && !domain; i++) {
            if ((anchors[i].textContent || '').trim() === 'WP-Admin') {
                try {
                    const host = new URL(anchors[i].href).hostname;
                    if (host && host.indexOf('.') !== -1 && !/(^|\.)a8c\.com$/.test(host) && !/(^|\.)zendesk\.com$/.test(host) && !/zdusercontent\.com$/.test(host)) {
                        domain = host;
                    }
                } catch (error) {
                    /* ignore */
                }
            }
        }
        // 2) Fallback: the domain printed right before the "Primary Domain" badge.
        if (!domain) {
            const block = row.parentElement;
            if (block) {
                const leaves = Array.from(block.querySelectorAll('*')).filter((el) => {
                    return el.children.length === 0 && (el.textContent || '').trim() === 'Primary Domain';
                });
                for (let j = 0; j < leaves.length && !domain; j++) {
                    const line = leaves[j].parentElement ? leaves[j].parentElement.textContent || '' : '';
                    const match = line.match(/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)/i);
                    if (match) domain = match[1];
                }
            }
        }
        return { blogId: blogId, domain: domain };
    }

    function openMenu(toggle, site) {
        closeMenus();
        const menu = document.createElement('div');
        menu.className = MENU_CLASS;
        MENU_LINKS.forEach((entry) => {
            // These need the blog id; the rest need the domain.
            const needsBlogId = entry.label === 'Blog RC' || entry.label === 'Rewind DB';
            const missing = needsBlogId ? !site.blogId : !site.domain;
            if (missing) return; // skip links we can't build for this site
            const a = document.createElement('a');
            a.href = entry.make(site);
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = entry.label;
            menu.appendChild(a);
        });
        document.body.appendChild(menu);
        // position:fixed = the iframe's viewport, which matches
        // getBoundingClientRect (this iframe never scrolls internally). Clamp.
        const rect = toggle.getBoundingClientRect();
        menu.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = Math.min(rect.bottom + 2, window.innerHeight - menu.offsetHeight - 4) + 'px';
    }

    function injectToggles() {
        const links = document.querySelectorAll('a[href*="reportcard/blog"]');
        links.forEach((blogRcLink) => {
            if ((blogRcLink.textContent || '').trim() !== 'Blog RC') return;
            // NEVER treat our own dropdown as a site row — it also contains a
            // "Blog RC" link.
            if (blogRcLink.closest('.' + MENU_CLASS)) return;
            const row = linksRowFor(blogRcLink);
            if (!row || row.querySelector('.' + TOGGLE_CLASS)) return;
            const site = siteInfoFor(blogRcLink, row);
            if (!site.blogId && !site.domain) return;

            const toggle = document.createElement('a');
            // borrow the app's own link styling so it blends in
            toggle.className = blogRcLink.className + ' ' + TOGGLE_CLASS;
            toggle.textContent = 'Tools ▾';
            toggle.href = 'javascript:void(0)';
            toggle.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const wasOpen = document.querySelector('.' + MENU_CLASS);
                closeMenus();
                if (!wasOpen || wasOpen._zdstmFor !== toggle) {
                    openMenu(toggle, site);
                    const menu = document.querySelector('.' + MENU_CLASS);
                    if (menu) menu._zdstmFor = toggle;
                }
            });

            // the app separates links with text nodes; mimic that
            row.appendChild(document.createTextNode(' '));
            row.appendChild(toggle);
        });
    }

    function removeAll() {
        closeMenus();
        document.querySelectorAll('.' + TOGGLE_CLASS).forEach((t) => t.remove());
    }

    function applyEnabled(on) {
        enabled = on !== false; // default ON
        if (enabled) {
            injectStyles();
            injectToggles();
        } else {
            removeAll();
        }
    }

    function refresh() {
        try {
            chrome.storage.sync.get([CONFIG_KEY], (res) => {
                const cfg = (res && res[CONFIG_KEY]) || {};
                applyEnabled(cfg.siteToolsMenu);
            });
        } catch (e) {
            applyEnabled(true);
        }
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) {
        /* ignore */
    }

    // Global listeners (close on outside click / blur / Escape) — always safe.
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.' + MENU_CLASS) && !event.target.closest('.' + TOGGLE_CLASS)) closeMenus();
    });
    window.addEventListener('blur', closeMenus);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenus();
    });

    // The app re-renders its content (user switches, refreshes) — keep the
    // toggles present. MutationObserver only; no timers.
    let scheduled = false;
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(() => {
            scheduled = false;
            if (enabled) injectToggles();
        });
    }).observe(document.documentElement, { childList: true, subtree: true });

    window.ZDSiteToolsMenu = { refresh };
    refresh();
})();
