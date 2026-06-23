# Zendesk Customizer — Design Spec

**Date:** 2026-06-22
**Author:** Mauro Pereira (with Claude)
**Status:** Draft for review
**Component:** Support Toolkit Chrome extension (v3.0.0 → next)

---

## 1. Goal

Add a **"Customize Zendesk"** menu to the Support Toolkit floating toolbar that lets a Happiness Engineer reshape their Zendesk Agent Workspace to their own taste:

- **Rearrange ticket panes** — assign any pane (Conversation, Notes/apps, User Info/context) to any column position and width. Full freedom, not just a left↔right swap.
- **Theme** — apply the toolbar's existing themes (Default / Ocean / Forest / Neon, light/dark) to Zendesk itself, so the toolbar and Zendesk feel like one product.
- **Text & density** — adjust font, font size, and spacing/density.
- **Hide / show** — toggle off chrome the agent never uses (declutter).

Appearance changes (theme/text/hide) apply across **every Zendesk page** (Home, Views, tickets). Layout reorder applies on **ticket pages** (the only place panes exist).

**North star:** make the HE's day-to-day smoother. The result must look native, be fast, be smooth, and actually work everywhere.

## 2. Design rules (non-negotiable)

- **No emojis** in any UI. Text titles/labels only.
- **Match the existing toolbar.** Reuse the current theme tokens (`--zd-*`), `.zd-*` class conventions, and the Settings-modal layout as the template. Not a standalone look.
- **Unified theme.** The menu reads/writes the same `--zd-*` tokens the toolbar already uses; toolbar and Zendesk move together.
- **Privacy-first.** This feature manipulates CSS/DOM only. No customer/ticket content is read, stored, or transmitted. Nothing leaves the browser.
- **Consistent everywhere.** Appearance must survive Zendesk's SPA route changes and apply on first paint without flashes.

## 3. Background — verified facts

### 3.1 Zendesk Agent Workspace structure (verified live 2026-06-22)
- Persistent global chrome shared by **all** agent pages:
  - `header[data-test-id="header-toolbar"]` (`data-garden-id="navigation.header"`) — top bar, full width, ~48px.
  - `nav[data-test-id="header-tablist"]` — open-ticket tabs.
  - `main[data-garden-id="navigation.main"]` — routed content area (Home `/agent/home/tickets`, Views, ticket, etc.).
  - `body` — dark canvas (`rgb(21,26,30)` in dark mode), `system-ui` font stack.
- Ticket body is a **CSS Grid**: `div[data-test-id="ticket-<id>-custom-layout"]`, class `.ticket-panes-grid-layout`, `display:grid`, `grid-template-columns` = 3 explicit tracks.
  - `[data-test-id="column-1"]` — Apps pane (`component-type-AppPane`; hosts the `a8cnotes` ZAF app).
  - `[data-test-id="column-2"]` — Conversation (`component-type-MainConversationPane`, also holds `sla-divider-wrapper`).
  - `[data-test-id="column-3"]` — Context panel (`component-type-ContextPanel`, customer/User Info; has a `CollapseButton`).
  - Each pane carries `data-garden-id="pane"`.
- Zendesk is React + the **Garden design system**. `data-test-id` and `data-garden-id` are the most stable hooks; hashed class names are not. The ticket id in `ticket-<id>-custom-layout` varies, so match on the **`.ticket-panes-grid-layout` class** (or `[data-test-id$="-custom-layout"]`).

### 3.2 Extension theme system (existing)
- `theme-presets.js` defines 4 themes × light/dark and 4 size presets (Compact/Normal/Large/XL), applied by setting ~29 `--zd-*` CSS custom properties on `document.documentElement` and `zd-theme-dark` etc. body classes.
- Today these tokens style only the extension's own UI; Zendesk's elements do not consume them. **This feature bridges that gap** by injecting CSS that maps `--zd-*` onto Zendesk's real elements.
- UI component conventions: single `:root` token block in `styles.css`; `.zd-modal-overlay`, `.zd-settings-*` (header/content/footer/columns/section), `.zd-setting-section`, `.zd-btn-primary/secondary/danger`, `.zd-*-panel` + `-panel-header`, `.zd-*-tab`.

## 4. Scope

**In scope (this spec — Track A):**
- The Customize Zendesk menu (4 tabs) and its settings model.
- An **applier** that injects/refreshes CSS on page load and SPA route changes.
- A shared **`zendesk-selectors.js`** module (single source of truth for Zendesk hooks) — also the foundation for the later hardening track.
- Curated theming of Zendesk surfaces (decision A).

**Out of scope (separate future spec — Track B):** broad consistency/hardening pass of the rest of the extension (migrating all existing features off duplicated selectors, auto-count robustness, etc.). This spec only introduces `zendesk-selectors.js` and uses it for the Customizer; wholesale migration of legacy modules is follow-up work.

**Explicitly not doing:** free drag-to-move arbitrary elements; full aggressive recolor of every Garden component; building a ZAF app.

## 5. Architecture

```
Toolbar button ──▶ Customizer menu (zd-customizer-panel)
                        │ reads/writes
                        ▼
                 chrome.storage (config.customizer = {...})
                        │ on change
                        ▼
                 Applier (customizer-apply.js)
                        │ builds CSS string from settings + --zd- tokens
                        ▼
        <style id="zd-customizer-styles"> injected into <head>
                        ▲
                 Re-applied on SPA route change (history + DOM observer)
```

### 5.1 Modules (new)
- **`zendesk-selectors.js`** — exports `ZDZendeskSelectors`: named, documented selectors with fallback chains (grid container, panes, header, nav, main, composer, macro bar, etc.) plus helpers (`getTicketGrid()`, `getPanes()`, `isTicketPage()`, `onRouteChange(cb)`). Single source of truth; replaces selectors currently duplicated across `content.js`, `auto-count.js`, `config.js`, `constants.js`.
- **`customizer.js`** — builds the menu UI (tabs, controls), wired to storage. Follows `.zd-settings-*` markup/classes.
- **`customizer-apply.js`** — pure function `buildCustomizerCSS(settings) → string` + an injector that writes one `<style id="zd-customizer-styles">` and keeps it current across route changes.
- CSS for the menu added to `styles.css` under `.zd-customizer-*` (mirroring `.zd-settings-*`).

### 5.2 Two CSS layers (one injected stylesheet)
- **Appearance layer** (always on, every page): variables + rules targeting `body`, `header-toolbar`, `navigation.main`, links, conversation bubbles, and our own panels.
- **Layout layer** (only when `isTicketPage()`): rules on `.ticket-panes-grid-layout` and `[data-test-id^="column-"]`.
Both are generated into the same `<style>` element to avoid ordering/flicker issues.

### 5.3 SPA route handling
Zendesk is a single-page app — the `<style>` element persists across route changes, but the **layout layer** must only target ticket pages and re-evaluate when the user navigates. Approach:
- Inject the appearance layer once (it's route-agnostic; pure CSS, no JS needed per route).
- Patch `history.pushState`/`replaceState` + listen to `popstate` to detect route changes; debounce (~150ms) and re-run the applier so the layout layer matches the current route. Fallback: a lightweight `MutationObserver` on `navigation.main` watching for the grid container appearing.
- Apply as early as possible (`document_idle` is current; consider `document_start` for the appearance `<style>` to avoid a flash of un-themed Zendesk — see Open Questions).

## 6. The menu — tabs & controls

Panel titled **"Customize Zendesk"**, opened from the toolbar, styled like the Settings modal. Footer: **Reset all** (left), **Done** (right). Each section notes its scope (ticket-only vs all pages).

### 6.1 Layout (ticket pages)
- One row per pane: **Conversation**, **Notes (a8cnotes)**, **User Info / Context**.
- Each row: **Position** select (1 / 2 / 3) and **Width** select (Narrow / Normal / Wide).
- Position changes set CSS `order` on the matching `[data-test-id^="column-"]`; widths rewrite `grid-template-columns` (Narrow≈0.7fr, Normal≈1fr conversation-weighted, Wide≈2fr — exact fr values tuned during build).
- If two panes are assigned the same position, last-write-wins with a subtle inline warning (no blocking).
- Quick presets: **Default**, **Swap sidebars**, **Both sidebars right**.

### 6.2 Theme (all pages)
- Theme picker: **Default / Ocean / Forest / Neon** (reuse `THEME_PRESETS`).
- **Light / Dark** toggle (reuse existing).
- Optional **accent override** (color swatch) → sets `--zd-primary`.
- **"Apply theme to Zendesk"** toggle (default on): when on, the curated Zendesk surfaces are themed; when off, only the toolbar themes (today's behavior).
- **Curated surfaces** themed (decision A): page/`body` background, `header-toolbar` background + text, `navigation.main` background, links/accents, conversation bubble colors (agent vs customer), our own panels. Garden components left at their defaults unless trivially safe.

### 6.3 Text & Density (all pages)
- **Size**: Compact / Normal / Large / XL (reuse `SIZE_PRESETS` → `--zd-font-size`, etc.), applied to Zendesk text surfaces too.
- **Font**: System / a small curated list (e.g., Inter, system-serif, a mono option) → `--zd-font` + injected `font-family` on Zendesk text containers.
- **Density**: Compact / Comfortable → adjusts padding/line-height on conversation + list rows.

### 6.4 Hide / Show (scoped)
- Curated checklist of safe-to-hide elements, each mapped to a named selector in `zendesk-selectors.js`, e.g.: top header tab clutter, macro bar, specific composer extras, a chosen pane, etc.
- Hidden via `display:none` rules in the injected stylesheet. Reversible by re-checking.
- A possible **"click an element to hide"** picker is deferred to a later iteration (more complex/fragile); ship the curated list first.

## 7. Data model

```js
config.customizer = {
  enabled: true,
  theme: { applyToZendesk: true },          // theme id/dark reuse existing config.currentTheme / config.theme
  layout: {                                  // ticket panes, keyed by stable pane role
    conversation: { position: 1, width: 'wide' },
    apps:         { position: 2, width: 'normal' },   // a8cnotes / column with AppPane
    context:      { position: 3, width: 'narrow' }
  },
  text: { size: 'normal', font: 'system', density: 'comfortable' },
  hidden: { headerTabs: false, macroBar: false, contextPane: false /* ...curated keys */ }
}
```
Stored in `chrome.storage` via existing `ZDStorage.setConfig`. Pane identity is keyed by **role** (conversation/apps/context), resolved to `column-N` at apply time so it survives ticket-id changes.

## 8. Resilience & performance

- **Graceful degradation:** if a selector is missing (Zendesk changed), that rule is skipped; the rest still applies; no thrown errors. `zendesk-selectors.js` returns null safely and the applier guards every target.
- **CSS-only application:** changes are expressed as CSS in one `<style>` element — no per-element JS styling, no layout thrash. Re-apply = regenerate one string and swap `textContent`.
- **Route changes debounced** (~150ms) to avoid churn during rapid navigation.
- **No flash:** appearance `<style>` injected as early as possible (see Open Questions re `document_start`).
- **Single observer:** reuse one route observer; do not add per-feature observers.

## 9. Privacy

CSS/DOM manipulation only. The feature never reads conversation text, requester data, or any ticket content; it only references structural selectors and writes style rules. Consistent with the project's privacy-first principle. No new host permissions required (already runs on `*.zendesk.com`).

## 10. Testing & verification

- **Manual matrix** via the Claude browser extension on a real ticket + Home + a View: each setting toggled, verified visually, verified persisting across reloads and SPA navigations.
- **Pure-function tests** for `buildCustomizerCSS(settings)` (input settings → expected CSS substrings) — no DOM needed, fast.
- **Selector smoke check:** a dev helper that reports which `zendesk-selectors.js` targets currently resolve on the page (so breakage is visible).
- Verify no console errors and no measurable interaction lag.

## 11. Decisions made
- **Theming depth:** A — curated surfaces (reliable now; deep/full theming not pursued).
- **No free-drag** layout; position+width selects + presets instead.
- **Reorder via CSS grid `order` + `grid-template-columns`** on stable `column-N` hooks.
- **Selectors centralized** in a new shared module from day one.

## 12. Open questions
1. **Injection timing:** move the appearance `<style>` to `document_start` (separate tiny script) to eliminate any un-themed flash, or accept current `document_idle`? (Leaning: small `document_start` style for appearance only.)
2. **Width model:** fixed fr presets (Narrow/Normal/Wide) vs. a draggable column divider later? (Start with presets.)
3. **Hide/Show curated list:** finalize exactly which elements are offered (needs a short pass over the real DOM to pick safe, useful targets).
4. **Track B sequencing:** do we migrate existing features onto `zendesk-selectors.js` within this effort or as the separate follow-up? (Currently: introduce module here, migrate legacy in Track B.)
