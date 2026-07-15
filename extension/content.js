// Main UI: floating toolbar, modals, auto-increment, shift management

(async function () {
    const {
        avgPerHour,
        throttle,
        formatHM
    } = window.ZDUtils;

    // Runtime state
    let currentMode = 'chats';
    let lastManualSwitchAt = 0;
    const MANUAL_GRACE_MS = 15_000;

    // DOM references
    let toolbarEl = null;
    let timerEl = null;
    let ticketsPctEl = null;
    let chatsPctEl = null;
    let avgHrEl = null;
    let countEl = null;

    // Modal overlays
    let settingsOverlayEl = null;
    let scheduleOverlayEl = null;
    let statsOverlayEl = null;

    // Toolbar position
    let preferredBarPos = { top: 10, left: 10 };

    // Auto-increment tracking
    let lastIncrementTime = 0;
    let lastStatusByTicketId = {};

    // Onboarding flag
    let calendarPromptShownThisSession = false;

    // Schedule cache
    let cachedScheduleDayKey = null;
    let cachedScheduleFetchedAt = 0;
    let cachedEventsToday = [];
    let cachedChatHours = 1;
    let cachedTicketHours = 1;
    let cachedTotalHours = 1;

    // Timer state
    let latestTimerMode = 'none';
    let timerLiveReady = false;


    // Zendesk DOM helpers

    // Extract ticket ID from URL
    function getTicketIdFromURL() {
        const m = location.href.match(/tickets\/(\d+)/);
        return m ? m[1] : null;
    }

    // Get current ticket status from Zendesk UI
    function getCurrentStatusText() {
        const candSelectors = [
            '[data-test-id="ticket-status-dropdown"]',
            '[data-test-id="status-dropdown-trigger"]',
            '[data-test-id="status_select"]',
            '[data-test-id="status-dropdown"]'
        ];
        for (const sel of candSelectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent) {
                return el.textContent.trim().toLowerCase();
            }
        }
        return '';
    }

    // Dev panel moved to Settings - no longer needed in toolbar

    // Auto-mode enforcement from schedule

    async function enforceAutoModeFromSchedule() {
        if (!window.ZDTimers?.getIntendedModeFromSchedule) return;

        const intended = await ZDTimers.getIntendedModeFromSchedule();
        if (!intended) return; // no active shift, don't force anything

        const now = Date.now();
        const withinGrace = (now - lastManualSwitchAt) < MANUAL_GRACE_MS;
        if (withinGrace) return;

        if (currentMode !== intended) {
            currentMode = intended;
            fastRefreshToolbarNoNetwork();
        }
    }

    // Toolbar UI creation

    async function createToolbar() {
        if (toolbarEl) return toolbarEl;

        toolbarEl = document.createElement('div');
        toolbarEl.className = 'zd-toolbar';
        toolbarEl.style.position = 'fixed';
        toolbarEl.style.top = '10px';
        toolbarEl.style.left = '10px';
        toolbarEl.style.zIndex = '999999999';
        toolbarEl.style.display = 'flex';
        toolbarEl.style.alignItems = 'center';

        // Left cluster: mode, counter, +/-
        const leftCluster = document.createElement('div');
        leftCluster.className = 'zd-left-cluster';

        const modeBtn = document.createElement('button');
        modeBtn.className = 'zd-mode-btn';
        modeBtn.addEventListener('click', toggleMode);

        // Decrement button
        const decBtn = document.createElement('button');
        decBtn.className = 'zd-step-btn';
        decBtn.title = 'Decrement';
        decBtn.textContent = '−';
        decBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const type = currentMode === 'chats' ? 'chats' : 'tickets';
            const ticketIdGuess = getTicketIdFromURL?.();

            await ZDStorage.incCount(type, -1, {
                source: 'manual-minus',
                ticketId: ticketIdGuess || null
            });

            fastRefreshToolbarNoNetwork();
        });

        // Live count display
        const currentCountWrapper = document.createElement('span');
        currentCountWrapper.className = 'zd-current-count-wrapper';
        countEl = document.createElement('span');
        countEl.className = 'zd-current-count';
        currentCountWrapper.appendChild(countEl);

        // Increment button
        const incBtn = document.createElement('button');
        incBtn.className = 'zd-step-btn';
        incBtn.title = 'Increment';
        incBtn.textContent = '+';
        incBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const type = currentMode === 'chats' ? 'chats' : 'tickets';
            const ticketIdGuess = getTicketIdFromURL?.();

            await ZDStorage.incCount(type, 1, {
                source: 'manual-plus',
                ticketId: ticketIdGuess || null
            });

            fastRefreshToolbarNoNetwork();
        });

        leftCluster.appendChild(modeBtn);
        leftCluster.appendChild(decBtn);
        leftCluster.appendChild(currentCountWrapper);
        leftCluster.appendChild(incBtn);

        // Separator helper
        const sep = () => {
            const s = document.createElement('span');
            s.className = 'zd-separator';
            s.textContent = '|';
            return s;
        };

        // Icon group: settings, schedule, theme, stats
        const iconGroup = document.createElement('div');
        iconGroup.className = 'zd-icon-group';

        async function makeIconButton(emojiSymbol, iconName, tooltip, onClick) {
            const b = document.createElement('button');
            b.className = 'zd-ico-btn';
            b.title = tooltip;

            // Set feature ID for visibility control
            if (iconName) {
                b.dataset.featureId = iconName;
            }

            // Always use SVG icons
            if (window.ZDIcons && iconName) {
                const icon = window.ZDIcons.createIcon(iconName, 16);
                b.appendChild(icon);
            } else {
                // Fallback to emoji if icons not loaded
                b.textContent = emojiSymbol;
            }

            b.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                await onClick();
            });
            return b;
        }

        const adjustBtn = await makeIconButton('✏️', 'adjust', 'Set exact count', openManualAdjustModal);
        const settingsBtn = await makeIconButton('⚙️', 'settings', 'Settings', openSettings);
        const scheduleBtn = await makeIconButton('📅', 'schedule', 'Today\'s Schedule', async () => {
            await openScheduleFast();
        });
        const themeBtn = await makeIconButton('🌓', 'theme', 'Toggle light/dark', async () => {
            if (window.ZDThemePresets?.toggleDarkMode) {
                await window.ZDThemePresets.toggleDarkMode();
            } else {
                // Fallback to old method
                const cfg = await ZDStorage.getConfig();
                const newTheme = cfg.theme === 'dark' ? 'light' : 'dark';
                await ZDStorage.setConfig({ theme: newTheme });
                await applyThemeToDOM();
            }
        });
        const statsBtn = await makeIconButton('📊', 'stats', 'Stats / History', async () => {
            await openStatsModal();
        });
        const notesBtn = await makeIconButton('📝', 'notes', 'Daily Notes', async () => {
            await openNotesPanel();
        });
        const copyTranscriptBtn = await makeIconButton('📋', 'copy', 'Copy transcript', copyTranscript);
        const linearBtn = await makeIconButton('⚡', 'linear', 'Search Linear Issues', async () => {
            if (window.ZDLinearPanel && window.ZDLinearPanel.toggleLinearPanel) {
                await window.ZDLinearPanel.toggleLinearPanel();
            }
        });
        const librechatBtn = await makeIconButton('🤖', 'ai', 'LibreChat AI', async () => {
            if (window.ZDLibrechatPanel && window.ZDLibrechatPanel.toggle) {
                await window.ZDLibrechatPanel.toggle();
            }
        });

        // Store button references for toggling
        linearBtn.dataset.featureId = 'linear';
        librechatBtn.dataset.featureId = 'librechat';
        notesBtn.dataset.featureId = 'notes';
        statsBtn.dataset.featureId = 'stats';
        scheduleBtn.dataset.featureId = 'schedule';
        themeBtn.dataset.featureId = 'theme';

        iconGroup.appendChild(adjustBtn);
        iconGroup.appendChild(settingsBtn);
        iconGroup.appendChild(scheduleBtn);
        iconGroup.appendChild(themeBtn);
        iconGroup.appendChild(statsBtn);
        iconGroup.appendChild(notesBtn);
        iconGroup.appendChild(copyTranscriptBtn);
        iconGroup.appendChild(linearBtn);
        iconGroup.appendChild(librechatBtn);

        // Timer cluster
        const timerWrapper = document.createElement('div');
        timerWrapper.className = 'zd-timer-wrapper';

        const timerIcon = document.createElement('span');
        timerIcon.className = 'zd-timer-icon';
        if (window.ZDIcons) {
            const icon = window.ZDIcons.createIcon('timer', 16);
            timerIcon.appendChild(icon);
        } else {
            timerIcon.textContent = '⏰';
        }

        timerEl = document.createElement('span');
        timerEl.className = 'zd-timer-text';
        timerEl.textContent = '--:--';

        timerWrapper.appendChild(timerIcon);
        timerWrapper.appendChild(timerEl);

        // Performance metrics
        const perfWrapper = document.createElement('div');
        perfWrapper.className = 'zd-perf-wrapper';

        ticketsPctEl = document.createElement('span');
        ticketsPctEl.className = 'zd-tickets-pct';
        ticketsPctEl.textContent = 'Tickets: 0%';

        chatsPctEl = document.createElement('span');
        chatsPctEl.className = 'zd-chats-pct';
        chatsPctEl.textContent = 'Chats: 0%';

        avgHrEl = document.createElement('span');
        avgHrEl.className = 'zd-avg-hr';
        avgHrEl.textContent = 'Avg/hr: 0.00';

        perfWrapper.appendChild(ticketsPctEl);
        perfWrapper.appendChild(chatsPctEl);
        perfWrapper.appendChild(avgHrEl);

        // Collapse/Expand button
        const collapseBtn = await makeIconButton('◀', null, 'Collapse toolbar', async () => {
            const cfg = await ZDStorage.getConfig();
            const newMode = !cfg.toolbarCompactMode;
            await ZDStorage.setConfig({ toolbarCompactMode: newMode });
            applyToolbarVisibility();
        });
        collapseBtn.classList.add('zd-collapse-btn');

        // Drag handle
        const dragHandleEl = document.createElement('div');
        dragHandleEl.className = 'zd-drag-handle';
        dragHandleEl.title = 'Drag to move';
        if (window.ZDIcons) {
            const icon = window.ZDIcons.createIcon('drag', 16);
            dragHandleEl.appendChild(icon);
        } else {
            dragHandleEl.textContent = '🔁';
        }

        // Assemble toolbar
        toolbarEl.appendChild(leftCluster);
        toolbarEl.appendChild(sep());
        toolbarEl.appendChild(iconGroup);
        toolbarEl.appendChild(sep());
        toolbarEl.appendChild(timerWrapper);
        toolbarEl.appendChild(sep());
        toolbarEl.appendChild(perfWrapper);
        toolbarEl.appendChild(sep());
        toolbarEl.appendChild(collapseBtn);
        toolbarEl.appendChild(dragHandleEl);

        document.body.appendChild(toolbarEl);

        enableDragging(toolbarEl, dragHandleEl);
        applyThemeToDOM();

        return toolbarEl;
    }

    // Apply toolbar visibility based on config
    async function applyToolbarVisibility() {
        if (!toolbarEl) return;

        const cfg = await ZDStorage.getConfig();
        const isCompact = cfg.toolbarCompactMode;

        // Find elements
        const leftCluster = toolbarEl.querySelector('.zd-left-cluster');
        const iconGroup = toolbarEl.querySelector('.zd-icon-group');
        const perfWrapper = toolbarEl.querySelector('.zd-perf-wrapper');
        const timerWrapper = toolbarEl.querySelector('.zd-timer-wrapper');
        const separators = toolbarEl.querySelectorAll('.zd-separator');
        const collapseBtn = toolbarEl.querySelector('.zd-collapse-btn');

        if (isCompact) {
            // COMPACT MODE: Show mode button, percentages, adjust, notes, settings, and collapse button

            // Show left cluster but hide count and +/- buttons
            if (leftCluster) {
                leftCluster.style.display = '';
                const countWrapper = leftCluster.querySelector('.zd-current-count-wrapper');
                const stepBtns = leftCluster.querySelectorAll('.zd-step-btn');
                if (countWrapper) countWrapper.style.display = 'none';
                stepBtns.forEach(btn => btn.style.display = 'none');
            }

            // Hide timer
            if (timerWrapper) timerWrapper.style.display = 'none';

            // Show only percentages in perf wrapper, hide avg/hr
            if (perfWrapper) {
                const avgHrEl = perfWrapper.querySelector('.zd-avg-hr');
                if (avgHrEl) avgHrEl.style.display = 'none';
            }

            // Hide all icon group buttons except adjust, notes (if enabled), and settings
            if (iconGroup) {
                const allButtons = iconGroup.querySelectorAll('.zd-ico-btn');
                allButtons.forEach(btn => {
                    const isAdjust = btn.title === 'Set exact count';
                    const isNotes = btn.title === 'Daily Notes' && cfg.showNotes;
                    const isSettings = btn.title === 'Settings';
                    btn.style.display = (isAdjust || isNotes || isSettings) ? '' : 'none';
                });
            }

            // Hide all separators
            separators.forEach(sep => sep.style.display = 'none');

        } else {
            // FULL MODE: Show based on individual settings

            // Show left cluster and all its children
            if (leftCluster) {
                leftCluster.style.display = '';
                const countWrapper = leftCluster.querySelector('.zd-current-count-wrapper');
                const stepBtns = leftCluster.querySelectorAll('.zd-step-btn');
                if (countWrapper) countWrapper.style.display = '';
                stepBtns.forEach(btn => btn.style.display = '');
            }

            // Show timer
            if (timerWrapper) timerWrapper.style.display = '';

            // Show all perf metrics
            if (perfWrapper) {
                const avgHrEl = perfWrapper.querySelector('.zd-avg-hr');
                if (avgHrEl) avgHrEl.style.display = '';
            }

            // Show all buttons first (reset)
            if (iconGroup) {
                const allButtons = iconGroup.querySelectorAll('.zd-ico-btn');
                allButtons.forEach(btn => btn.style.display = '');
            }

            // Apply individual button visibility settings
            const buttons = toolbarEl.querySelectorAll('[data-feature-id]');
            buttons.forEach(btn => {
                const featureId = btn.dataset.featureId;
                let shouldShow = true;

                // Check individual feature settings
                if (featureId === 'linear' && !cfg.showLinear) shouldShow = false;
                if (featureId === 'notes' && !cfg.showNotes) shouldShow = false;
                if (featureId === 'stats' && !cfg.showStats) shouldShow = false;
                if (featureId === 'schedule' || featureId === 'theme') shouldShow = true; // Always show

                btn.style.display = shouldShow ? '' : 'none';
            });

            // Ensure adjust and settings always visible (essential UI - no data-feature-id)
            if (iconGroup) {
                const allButtons = iconGroup.querySelectorAll('.zd-ico-btn');
                allButtons.forEach(btn => {
                    if (btn.title === 'Set exact count' || btn.title === 'Settings') {
                        btn.style.display = '';
                    }
                });
            }

            // Show separators
            separators.forEach(sep => sep.style.display = '');
        }

        // Update collapse button icon and tooltip
        if (collapseBtn) {
            if (window.ZDIcons) {
                collapseBtn.innerHTML = '';
                const iconName = isCompact ? 'expand' : 'collapse';
                const icon = window.ZDIcons.createIcon(iconName, 16);
                collapseBtn.appendChild(icon);
            } else {
                collapseBtn.textContent = isCompact ? '▶' : '◀';
            }
            collapseBtn.title = isCompact ? 'Expand toolbar' : 'Collapse toolbar';
        }
    }

    // Schedule caching and hour calculation

    function computeScheduledHoursByType(eventsForToday) {
        let chatMs = 0;
        let ticketMs = 0;

        for (const ev of eventsForToday) {
            const title = (ev.title || '').toLowerCase();
            const durMs = ev.endLocal - ev.startLocal;
            if (durMs <= 0) continue;
            if (title.includes('chat')) {
                chatMs += durMs;
            } else if (title.includes('ticket')) {
                ticketMs += durMs;
            }
        }

        const chatHours   = chatMs   / (1000 * 60 * 60);
        const ticketHours = ticketMs / (1000 * 60 * 60);
        const totalHours  = chatHours + ticketHours;

        return {
            chatHours:   chatHours   > 0 ? chatHours   : 0,
            ticketHours: ticketHours > 0 ? ticketHours : 0,
            totalHours:  totalHours  > 0 ? totalHours  : 0
        };
    }

    // Parse ICS text to an array of local-time events {title,startLocal,endLocal}
    function parseICSForToday(text) {
        const lines = text.split(/\r?\n/);
        let temp = {};
        const out = [];

        function parseICSTimeLocal(stamp) {
            // Supports both ...Z (UTC) and "floating" local times
            const year = +stamp.slice(0,4);
            const mo = +stamp.slice(4,6) - 1;
            const da = +stamp.slice(6,8);
            const hh = +stamp.slice(9,11);
            const mm = +stamp.slice(11,13);
            if (stamp.endsWith('Z')) {
                return new Date(Date.UTC(year, mo, da, hh, mm));
            } else {
                return new Date(year, mo, da, hh, mm);
            }
        }

        for (const ln of lines) {
            if (ln.startsWith('BEGIN:VEVENT')) {
                temp = {};
            } else if (ln.startsWith('DTSTART')) {
                temp.startLocal = parseICSTimeLocal(ln.split(':')[1]);
            } else if (ln.startsWith('DTEND')) {
                temp.endLocal = parseICSTimeLocal(ln.split(':')[1]);
            } else if (ln.startsWith('SUMMARY')) {
                temp.title = ln.split(':').slice(1).join(':');
            } else if (ln.startsWith('END:VEVENT')) {
                if (temp.startLocal && temp.endLocal) {
                    out.push(temp);
                }
            }
        }
        return out;
    }

    async function fetchTodayEvents(calendarURL) {
        if (!calendarURL) return [];
        try {
            const res = await fetch(calendarURL);
            const txt = await res.text();
            const events = parseICSForToday(txt);

            const today = new Date();
            const y = today.getFullYear();
            const m = today.getMonth();
            const d = today.getDate();

            return events
                .filter(ev =>
                    ev.startLocal.getFullYear() === y &&
                    ev.startLocal.getMonth()    === m &&
                    ev.startLocal.getDate()     === d
                )
                .sort((a,b) => a.startLocal - b.startLocal);
        } catch (err) {
            console.warn('[content] calendar fetch failed', err);
            return [];
        }
    }

    async function refreshScheduleCache(force = false) {
        const cfg = await ZDStorage.getConfig();
        const now = Date.now();
        const today = new Date();
        const dayKey = today.toDateString();

        const cacheTooOld = (now - cachedScheduleFetchedAt) > 60_000; // 60s
        const dayChanged = cachedScheduleDayKey !== dayKey;

        if (!force && !cacheTooOld && !dayChanged) {
            return; // keep cache
        }

        const todaysEvents = await fetchTodayEvents(cfg.calendarURL);

        const { chatHours, ticketHours, totalHours } =
            computeScheduledHoursByType(todaysEvents);

        cachedEventsToday       = todaysEvents;
        cachedChatHours         = chatHours   > 0 ? chatHours   : 1;
        cachedTicketHours       = ticketHours > 0 ? ticketHours : 1;
        cachedTotalHours        = totalHours  > 0 ? totalHours  : 1;
        cachedScheduleDayKey    = dayKey;
        cachedScheduleFetchedAt = now;

        // Save snapshot for rollover (storage.rollDailyIfNeeded uses these)
        await ZDStorage.setConfig({
            lastDayChatHours:   cachedChatHours   || 0,
            lastDayTicketHours: cachedTicketHours || 0
        });
    }

    // ------------------------------------------------------------
    // 6. DAY ROLLOVER (LOCAL + UTC story)
    // ------------------------------------------------------------
    //
    // We do two slightly different resets:
    //
    // A) UTC rollover (handled mainly by ZDStorage.rollDailyIfNeeded() and
    //    also forceNewDayReset()) → this snapshots into dailyHistory
    //    and restarts counts.
    //
    // B) Local-day safeguard (maybeDailyResetCounts) → older "daily reset"
    //    logic we keep mostly for compatibility, but rollDailyIfNeeded()
    //    is the real authority now.
    //
    // rolloverDayIfNeeded() is an older approach that used config.lastDayKey;
    // we keep it for compatibility with streak calculations if you want it.

    async function rolloverDayIfNeeded() {
        const cfg = await ZDStorage.getConfig();
        const counts = await ZDStorage.getCounts(); // {chats, tickets}

        const today = new Date();
        const todayKey = ZDStorage.getLocalDayKey(today); // "YYYY-MM-DD"
        const lastDayKey = cfg.lastDayKey || todayKey;

        if (lastDayKey === todayKey) {
            return; // same local calendar day → nothing
        }

        // We are in a *new* local day.
        // That means the current counts actually belong to "yesterday".

        const chatHoursForPrev   = cfg.lastDayChatHours   || 0;
        const ticketHoursForPrev = cfg.lastDayTicketHours || 0;

        const prevDayRecord = {
            chats: counts.chats || 0,
            tickets: counts.tickets || 0,
            chatHours: chatHoursForPrev,
            ticketHours: ticketHoursForPrev
        };

        // Push yesterday into dailyHistory under that old dayKey
        await ZDStorage.appendDailyHistory(lastDayKey, prevDayRecord);

        // Reset counters for the brand new day
        await ZDStorage.setCount('chats', 0);
        await ZDStorage.setCount('tickets', 0);

        // Snapshot today's hours for *tomorrow's* rollover,
        // and store today's local dayKey so we don't do this again until tomorrow.
        await ZDStorage.setConfig({
            lastDayKey: todayKey,
            lastDayChatHours:   cachedChatHours   || 0,
            lastDayTicketHours: cachedTicketHours || 0
        });
    }

    // Old helper: if lastDailyReset !== todayKey, nuke counts to 0.
    // We mostly keep this to avoid weird stale counters if someone left Zendesk open
    // for multiple days without refresh. rollDailyIfNeeded() and forceNewDayReset()
    // are the primary path now.
    function getLocalDayKeySimple() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const d = now.getDate();
        const mm = m < 10 ? '0' + m : '' + m;
        const dd = d < 10 ? '0' + d : '' + d;
        return `${y}-${mm}-${dd}`;
    }

    async function maybeDailyResetCounts() {
        const todayKey = getLocalDayKeySimple();
        const cfg = await ZDStorage.getConfig();

        if (cfg.lastDailyReset === todayKey) {
            return; // already reset today
        }

        // Do a hard reset
        await ZDStorage.setCount('chats', 0);
        await ZDStorage.setCount('tickets', 0);

        await ZDStorage.setConfig({
            lastDailyReset: todayKey
        });

        // Immediately repaint toolbar so the agent sees 0/0
        fastRefreshToolbarNoNetwork();
    }

    // ------------------------------------------------------------
    // 7. TOOLBAR REFRESH (no network)
    // ------------------------------------------------------------

    // % of goal helper:
    // given a count (e.g. 14 chats so far),
    // given goalPerHour (cfg.goalChatsPerHour),
    // and given how many hours you were scheduled for that type today,
    // return an integer percentage toward target.
    function percentToGoalFixed(count, perHourGoal, scheduledHoursForThisType) {
        if (!perHourGoal || perHourGoal <= 0) return 0;
        if (!scheduledHoursForThisType || scheduledHoursForThisType <= 0) return 0;
        const targetForToday = perHourGoal * scheduledHoursForThisType;
        return Math.round((count / targetForToday) * 100);
    }

    async function fastRefreshToolbarNoNetwork() {
        if (!toolbarEl) return;

        const cfg = await ZDStorage.getConfig();
        const counts = await ZDStorage.getCounts();

        const goalChatsPerHr   = (cfg.goalChatsPerHour   != null) ? cfg.goalChatsPerHour   : 5;
        const goalTicketsPerHr = (cfg.goalTicketsPerHour != null) ? cfg.goalTicketsPerHour : 5;

        // compute Chat% and Ticket% toward today's goals
        const chatPct = percentToGoalFixed(
            counts.chats,
            goalChatsPerHr,
            cachedChatHours
        );
        const ticketPct = percentToGoalFixed(
            counts.tickets,
            goalTicketsPerHr,
            cachedTicketHours
        );

        const totalInteractions = counts.chats + counts.tickets;
        const avgText = avgPerHour(totalInteractions, cachedTotalHours);

        // Update mode button text
        const modeBtn = toolbarEl.querySelector('.zd-mode-btn');
        modeBtn.textContent = currentMode === 'chats' ? 'Chats' : 'Tickets';

        // Update big number
        countEl.textContent =
            currentMode === 'chats'
                ? counts.chats
                : counts.tickets;

        // Update perf stats
        ticketsPctEl.textContent = `Tickets: ${ticketPct || 0}%`;
        chatsPctEl.textContent   = `Chats: ${chatPct || 0}%`;
        avgHrEl.textContent      = `Avg/hr: ${avgText}`;

        // Show/hide ⏰ block if disabled in settings
        const timerWrap = toolbarEl.querySelector('.zd-timer-wrapper');
        if (timerWrap) {
            timerWrap.style.display = (cfg.showShiftTimer === false) ? 'none' : 'flex';
        }

        // Respect showPercentages flag
        const showPct = (cfg.showPercentages === false) ? false : true;
        ticketsPctEl.style.display = showPct ? 'inline-block' : 'none';
        chatsPctEl.style.display   = showPct ? 'inline-block' : 'none';
        avgHrEl.style.display      = 'inline-block';

        // Style red if <100% and you actually have a goal
        ticketsPctEl.classList.toggle(
            'zd-low',
            ticketPct < 100 && goalTicketsPerHr > 0
        );
        chatsPctEl.classList.toggle(
            'zd-low',
            chatPct < 100 && goalChatsPerHr > 0
        );
    }

    // ------------------------------------------------------------
    // 8. SHIFT TIMER DISPLAY IN TOOLBAR
    // ------------------------------------------------------------
    //
    // We have TWO data sources for the timer text:
    //
    // A) Live events from timers.js ("ZDTimerUpdate").
    //    This is authoritative. This includes:
    //      - "12m left"
    //      - "8m →"
    //      - "Done ✅"
    //    and gives us intendedMode for auto-switch.
    //
    // B) A fallback manual calculation from cachedEventsToday
    //    (refreshToolbarTimerFromSchedule), used:
    //      - at init before ZDTimers emits
    //      - and every ~30s just to make sure we're not stale.
    //
    // We keep both. The ZDTimerUpdate listener updates continuously every second.
    // The fallback is just insurance.

    function hookTimerUpdates() {
    window.addEventListener('ZDTimerUpdate', (ev) => {
        const detail = ev.detail || {};
        const { uiMode, uiText, intendedMode } = detail;

        // ✅ Mark that the live timer (timers.js) is officially in control.
        // After this fires once, we won't let our fallback overwrite timerEl.
        timerLiveReady = true;

        // 1. Update the ⏰ text and visual state classes in the toolbar.
        if (timerEl && typeof uiText === 'string') {
            // set the visible text like "12m left" or "5m →" etc
            timerEl.textContent = uiText;

            // remove any previous state classes
            timerEl.classList.remove(
                'zd-timer-live',
                'zd-timer-wait',
                'zd-timer-done',
                'zd-timer-idle'
            );

            const timerIconEl = toolbarEl.querySelector('.zd-timer-icon');
            if (timerIconEl) {
                timerIconEl.classList.remove(
                    'zd-timer-live',
                    'zd-timer-wait',
                    'zd-timer-done',
                    'zd-timer-idle'
                );
            }

            // pick a class based on uiMode
            // uiMode is "live" | "wait" | "done"
            let cls = 'zd-timer-idle';
            if (uiMode === 'live') {
                cls = 'zd-timer-live';
            } else if (uiMode === 'wait') {
                cls = 'zd-timer-wait';
            } else if (uiMode === 'done') {
                cls = 'zd-timer-done';
            }

            // apply the new class to both text and icon
            timerEl.classList.add(cls);
            if (timerIconEl) {
                timerIconEl.classList.add(cls);
            }

            // grey out when you're not actively in a shift
            const isActive = (uiMode === 'live');
            timerEl.classList.toggle('zd-timer-inactive', !isActive);
        }

        // 2. Auto mode snapback ("Chats" vs "Tickets") based on schedule,
        // unless the agent just manually flipped modes.
        if (intendedMode === 'chats' || intendedMode === 'tickets') {
            const now = Date.now();
            const withinGrace = (now - lastManualSwitchAt) < MANUAL_GRACE_MS;

            if (!withinGrace && currentMode !== intendedMode) {
                currentMode = intendedMode;
                fastRefreshToolbarNoNetwork();
            }
        }

        // 3. Keep an internal copy of the timer state if we want to use it later.
        if (uiMode) {
            latestTimerMode = uiMode;
        }
    });
}

    // Manual fallback that reads cachedEventsToday (local-shift calc)
    function getShiftTimerStatusFromCache() {
        const now = new Date();
        const relevant = (cachedEventsToday || [])
            .filter(ev => {
                const title = (ev.title || '').toLowerCase();
                return title.includes('chat') || title.includes('ticket');
            })
            .sort((a, b) => a.startLocal - b.startLocal);

        if (!relevant.length) {
            return {
                mode: 'done',
                text: 'No shifts',
                iconClass: 'zd-timer-idle'
            };
        }

        // currently in?
        let currentShift = null;
        for (const ev of relevant) {
            if (now >= ev.startLocal && now <= ev.endLocal) {
                currentShift = ev;
                break;
            }
        }

        if (currentShift) {
            const msLeft = currentShift.endLocal - now;
            const totalSec = Math.max(0, Math.floor(msLeft / 1000));
            const mm = Math.floor(totalSec / 60);
            const ss = totalSec % 60;
            const mmss = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
            return {
                mode: 'live',
                text: mmss,
                iconClass: 'zd-timer-live'
            };
        }

        // next upcoming?
        const future = relevant.filter(ev => ev.startLocal > now);
        if (future.length) {
            const nextShift = future[0];
            const msUntil = nextShift.startLocal - now;
            const totalSec = Math.max(0, Math.floor(msUntil / 1000));
            const mm = Math.floor(totalSec / 60);
            const ss = totalSec % 60;
            const mmss = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
            return {
                mode: 'wait',
                text: `${mmss} →`,
                iconClass: 'zd-timer-wait'
            };
        }

        // nothing else today
        return {
            mode: 'done',
            text: 'No shifts',
            iconClass: 'zd-timer-done'
        };
    }

    function refreshToolbarTimerFromSchedule() {
    if (!timerEl) return;

    // Once timers.js is streaming, don't let the fallback touch the UI.
    if (timerLiveReady) return;

    // Use the correct helper
    if (typeof getShiftTimerStatusFromCache !== 'function') {
        timerEl.textContent = '--:--';
        timerEl.classList.add('zd-timer-inactive');
        return;
    }

    const status = getShiftTimerStatusFromCache();

    timerEl.textContent = status.text;

    timerEl.classList.remove('zd-timer-live','zd-timer-wait','zd-timer-done','zd-timer-idle');
    const timerIconEl = toolbarEl.querySelector('.zd-timer-icon');
    if (timerIconEl) {
        timerIconEl.classList.remove('zd-timer-live','zd-timer-wait','zd-timer-done','zd-timer-idle');
    }

    if (status.iconClass) {
        timerEl.classList.add(status.iconClass);
        if (timerIconEl) timerIconEl.classList.add(status.iconClass);
    }

    const isActive = status.mode === 'live';
    timerEl.classList.toggle('zd-timer-inactive', !isActive);
}

    // ------------------------------------------------------------
    // 9. SETTINGS MODAL + CALENDAR ONBOARDING
    // ------------------------------------------------------------

    async function openSettings() {
        if (!settingsOverlayEl) {
            settingsOverlayEl = buildSettingsOverlay();
            document.body.appendChild(settingsOverlayEl);
        }

        // Toggle functionality
        if (settingsOverlayEl.style.display === 'flex') {
            settingsOverlayEl.style.display = 'none';
            return;
        }

        await populateSettingsForm();
        settingsOverlayEl.style.display = 'flex';
    }

    function closeSettings() {
        if (settingsOverlayEl) {
            settingsOverlayEl.style.display = 'none';
        }
    }

    // Copy the full ticket/chat transcript to the clipboard with clean
    // Bot / User / Agent labels (no personal names) for pasting into AI etc.
    async function copyTranscript() {
        const notify = window.ZDNotifyUtils;
        const result = window.ZDTranscript && window.ZDTranscript.getCopyText
            ? window.ZDTranscript.getCopyText()
            : { success: false, error: 'Transcript module not available' };

        if (!result.success) {
            notify?.showToast?.(result.error || 'Could not read the conversation.', 'warning', 2500);
            return;
        }

        try {
            await navigator.clipboard.writeText(result.text);
            notify?.showToast?.('Transcript copied to clipboard', 'info', 1800);
        } catch (e) {
            // Fallback when the async clipboard API is blocked (focus/permission).
            const ta = document.createElement('textarea');
            ta.value = result.text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
            ta.remove();
            notify?.showToast?.(
                ok ? 'Transcript copied to clipboard' : 'Copy failed — please try again',
                ok ? 'info' : 'warning', 2200
            );
        }
    }

    function openCalendarHelp() {
        // This opens Happy Tools integrations page where the agent can grab their ICS URL.
        const helpURL = 'https://schedule.happy.tools/preferences/integrations';
        window.ZDNotifyUtils.info(
            'Get your calendar URL',
            "We'll open your Happy Tools integrations page in a new tab. Copy your personal ICS URL and paste it in Settings."
        );
        window.open(helpURL, '_blank', 'noopener');
    }

    function openLinearAPIKeyHelp() {
        // This opens Linear API settings where the agent can create an API key.
        const helpURL = 'https://linear.app/a8c/settings/account/security';
        window.ZDNotifyUtils.info(
            'Get your Linear API key',
            "We'll open Linear API settings in a new tab. Create a personal API key and paste it in Settings to enable Linear integration."
        );
        window.open(helpURL, '_blank', 'noopener');
    }

    // First-run onboarding: prompt user for calendar URL if we don't have one
    async function maybePromptForCalendarURL() {
        if (calendarPromptShownThisSession) return;

        const cfg = await ZDStorage.getConfig();
        if ((cfg.calendarURL && cfg.calendarURL.trim() !== '') || cfg.onboardedCalendar) {
            return;
        }

        calendarPromptShownThisSession = true;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay';

        const panel = document.createElement('div');
        panel.className = 'zd-log-panel';
        panel.style.width = '400px';
        panel.innerHTML = `
            <h2 class="zd-log-title">Add Your Shift Calendar</h2>
            <div style="font-size:13px;line-height:1.4;margin-bottom:10px;">
                Paste your Happy Tools calendar URL so we can show your shifts & reminders.
            </div>
            <div class="zd-settings-row">
                <label>Calendar URL</label>
                <input type="text" class="zd-onboard-calurl" style="width:100%;" placeholder="https://..." />
                <div class="zd-settings-hint-row" style="margin-top:6px; cursor:pointer;">
                    <span class="zd-hint-link">💡 Open Happy Tools to get my URL</span>
                </div>
            </div>
            <div class="zd-log-footer" style="margin-top:16px;">
                <button class="zd-onboard-cancel">Not now</button>
                <button class="zd-onboard-save">Save</button>
            </div>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
        }

        // "Not now" → just don't ask again this session
        panel.querySelector('.zd-onboard-cancel').addEventListener('click', async () => {
            await ZDStorage.setConfig({ onboardedCalendar: true });
            close();
        });

        // "Save" → save URL, refresh schedule, update toolbar.
        panel.querySelector('.zd-onboard-save').addEventListener('click', async () => {
            const inputEl = panel.querySelector('.zd-onboard-calurl');
            const urlVal = inputEl ? inputEl.value.trim() : '';

            // while we do async stuff, show spinner
            const spinner = showLoadingSpinner();

            // close now for snappier UX
            close();

            // persist config
            if (urlVal) {
                await ZDStorage.setConfig({
                    calendarURL: urlVal,
                    onboardedCalendar: true
                });
            } else {
                await ZDStorage.setConfig({ onboardedCalendar: true });
            }

            // re-pull today's schedule from new calendar
            await refreshScheduleCache(true);
            fastRefreshToolbarNoNetwork();

            // hide spinner
            hideLoadingSpinner(spinner);
        });

        panel.querySelector('.zd-hint-link').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openCalendarHelp();
        });

        // click backdrop to dismiss
        overlay.addEventListener('click', async (evt) => {
            if (evt.target === overlay) {
                await ZDStorage.setConfig({ onboardedCalendar: true });
                close();
            }
        });
    }

    // version check: show "Toolkit Update" popup after auto-update
async function checkForVersionUpdate() {
    try {
        // version that's currently running from the extension manifest
        const runningVersion = chrome.runtime.getManifest().version;

        // version we last saved in storage
        const savedVersion = await ZDStorage.getVersion(); // falls back to "1.0.0" in storage.js if unset

        // if different AND we've actually had a savedVersion before
        // (so we don't spam on literal first install)
        if (savedVersion && savedVersion !== runningVersion) {
            // fire the nice popup
            if (window.ZDNotifications && ZDNotifications.versionUpdate) {
                ZDNotifications.versionUpdate(runningVersion);
            } else {
                console.warn('ZDNotifications.versionUpdate not available');
            }
        }

        // now persist the new one so we don't show it again
        await ZDStorage.setVersion(runningVersion);
    } catch (err) {
        console.warn('[VersionCheck] failed:', err);
    }
}


    function buildSettingsOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay';
        overlay.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'zd-settings-panel zd-settings-grid';
        panel.style.maxWidth = '1100px';
        panel.style.width = '95vw';

        panel.innerHTML = `
            <div class="zd-settings-header">
                <div class="zd-settings-header-content">
                    <div class="zd-settings-icon">${window.ZDIcons ? window.ZDIcons.getIconHTML('settings', 24) : '⚙️'}</div>
                    <div>
                        <h2 class="zd-settings-title">Settings</h2>
                        <p class="zd-settings-subtitle">Customize your support toolkit experience</p>
                    </div>
                </div>
            </div>

            <div class="zd-settings-columns zd-settings-three-col">
                <div class="zd-settings-col">
                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Display & Behavior</h3>
                            <p class="zd-section-desc">Customize toolbar display</p>
                        </div>

                        <div class="zd-setting-group">
                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showPercentages" />
                                <span>Show percentages</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showShiftReminders" />
                                <span>Shift reminders</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-playReminderSound" />
                                <span>Reminder sound</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showShiftTimer" />
                                <span>Shift timer</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-enableSummaryPopup" />
                                <span>Summary popup on resolution</span>
                            </label>
                        </div>

                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Performance Goals</h3>
                            <p class="zd-section-desc">Set hourly targets</p>
                        </div>

                        <div class="zd-setting-group">
                            <div class="zd-settings-row">
                                <label>Chats per hour</label>
                                <input type="number" min="0" class="cfg-goalChatsPerHour" />
                            </div>

                            <div class="zd-settings-row">
                                <label>Tickets per hour</label>
                                <input type="number" min="0" class="cfg-goalTicketsPerHour" />
                            </div>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Data Management</h3>
                            <p class="zd-section-desc">Backup & restore</p>
                        </div>

                        <div class="zd-settings-row-buttons">
                            <button class="zd-backup-btn zd-btn-secondary">Backup</button>
                            <button class="zd-restore-btn zd-btn-secondary">Restore</button>
                            <button class="zd-clear-btn zd-btn-danger">Clear</button>
                        </div>
                    </section>
                </div>

                <div class="zd-settings-col">
                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Scheduling</h3>
                            <p class="zd-section-desc">Work schedule settings</p>
                        </div>

                        <div class="zd-setting-group">
                            <div class="zd-settings-row zd-warning-row">
                                <label class="zd-setting-check">
                                    <input type="checkbox" class="cfg-startShiftWarningEnabled" />
                                    <span>Before shift starts</span>
                                </label>
                                <div class="zd-input-with-unit">
                                    <input type="number" min="1" max="60" class="cfg-startShiftWarningMinutes" placeholder="5" />
                                    <span class="zd-input-unit">min</span>
                                </div>
                            </div>

                            <div class="zd-settings-row zd-warning-row">
                                <label class="zd-setting-check">
                                    <input type="checkbox" class="cfg-lateLoginWarningEnabled" />
                                    <span>Late login</span>
                                </label>
                                <div class="zd-input-with-unit">
                                    <input type="number" min="1" max="60" class="cfg-lateLoginWarningMinutes" placeholder="10" />
                                    <span class="zd-input-unit">min</span>
                                </div>
                            </div>

                            <div class="zd-settings-row zd-warning-row">
                                <label class="zd-setting-check">
                                    <input type="checkbox" class="cfg-endShiftWarningEnabled" />
                                    <span>Before shift ends</span>
                                </label>
                                <div class="zd-input-with-unit">
                                    <input type="number" min="1" max="60" class="cfg-endShiftWarningMinutes" placeholder="10" />
                                    <span class="zd-input-unit">min</span>
                                </div>
                            </div>

                            <div class="zd-settings-row">
                                <label>Week starts on</label>
                                <select class="cfg-weekStartsOn">
                                    <option value="Mon">Monday</option>
                                    <option value="Tue">Tuesday</option>
                                    <option value="Wed">Wednesday</option>
                                    <option value="Thu">Thursday</option>
                                    <option value="Fri">Friday</option>
                                    <option value="Sat">Saturday</option>
                                    <option value="Sun">Sunday</option>
                                </select>
                            </div>

                            <div class="zd-settings-row">
                                <label>Calendar URL</label>
                                <input type="text" class="cfg-calendarURL" placeholder="https://schedule.happy.tools/..." />
                            </div>

                            <div class="zd-settings-hint-row">
                                <span class="zd-hint-link zd-hint-calendar">${window.ZDIcons ? window.ZDIcons.getIconHTML('schedule', 14) : '📅'} Get calendar URL</span>
                            </div>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Toolbar Features</h3>
                            <p class="zd-section-desc">Show/hide toolbar buttons</p>
                        </div>

                        <div class="zd-setting-group">
                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showLinear" />
                                <span>${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 14) : '⚡'} Linear</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showNotes" />
                                <span>${window.ZDIcons ? window.ZDIcons.getIconHTML('notes', 14) : '📝'} Notes</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showStats" />
                                <span>${window.ZDIcons ? window.ZDIcons.getIconHTML('stats', 14) : '📊'} Stats</span>
                            </label>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Zendesk Layout &amp; Styling</h3>
                            <p class="zd-section-desc">Ticket layout and appearance</p>
                        </div>

                        <div class="zd-setting-group">
                            <div class="zd-settings-row">
                                <label>Stack sidebars</label>
                                <select class="cfg-stackSidebars">
                                    <option value="off">Off</option>
                                    <option value="right">Stack on right</option>
                                    <option value="left">Stack on left</option>
                                </select>
                            </div>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-siteToolsMenu" />
                                <span>Site Tools menu</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-stylingDarkMode" />
                                <span>Dark-mode app fix</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-stylingResizeBoxes" />
                                <span>Resizable field boxes</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-stylingWideMessages" />
                                <span>Wide messages</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-stylingChatBubbles" />
                                <span>Chat bubbles</span>
                            </label>
                        </div>
                    </section>
                </div>

                <div class="zd-settings-col">
                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Linear Integration</h3>
                        </div>

                        <div class="zd-setting-group">
                            <div class="zd-settings-row">
                                <label>Linear API Key</label>
                                <input type="password" class="cfg-linearApiKey" placeholder="lin_api_..." />
                            </div>

                            <div class="zd-settings-hint-row">
                                <span class="zd-hint-link zd-hint-linear-apikey">${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 14) : '⚡'} Get Linear API key</span>
                            </div>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Appearance & Themes</h3>
                        </div>

                        <div class="zd-setting-item">
                            <label for="zd-theme-select">Theme</label>
                            <select id="zd-theme-select" class="zd-select">
                                <option value="default">Default</option>
                                <option value="ocean">Ocean</option>
                                <option value="forest">Forest</option>
                                <option value="neon">Neon</option>
                            </select>
                        </div>

                        <div class="zd-setting-item">
                            <label for="zd-size-select">Size</label>
                            <select id="zd-size-select" class="zd-select">
                                <option value="compact">Compact</option>
                                <option value="normal">Normal</option>
                                <option value="large">Large</option>
                                <option value="xlarge">Extra Large</option>
                            </select>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Developer Tools</h3>
                        </div>

                        <div class="zd-setting-group">
                            <label class="zd-setting-check zd-dev-mode-toggle">
                                <input type="checkbox" class="cfg-devMode" />
                                <span>Developer Mode</span>
                            </label>

                            <div class="zd-dev-tools" style="display: none;">
                                <div class="zd-dev-buttons">
                                    <button class="zd-dev-test-btn" data-test="shift-start">Shift Start</button>
                                    <button class="zd-dev-test-btn" data-test="shift-end">Shift End</button>
                                    <button class="zd-dev-test-btn" data-test="sound">Sound</button>
                                    <button class="zd-dev-test-btn" data-test="archive">Archive</button>
                                    <button class="zd-dev-test-btn" data-test="full-reset">Reset</button>
                                    <button class="zd-dev-test-btn zd-dev-whats-new-btn" data-test="whats-new">What's New</button>
                                    <button class="zd-dev-test-btn" data-test="version-popup">Version Popup</button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Zendesk Workflow</h3>
                            <p class="zd-section-desc">Composer & ticket automation</p>
                        </div>

                        <div class="zd-setting-group">
                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-wfDraftMode" />
                                <span>Draft Mode default</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-wfMergeUncheck" />
                                <span>Uncheck merge visibility</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-wfStayOnTicket" />
                                <span>Stay on ticket default</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-wfMessagingDefault" />
                                <span>Messaging as default channel</span>
                            </label>
                        </div>
                    </section>
                </div>
            </div>

            <section class="zd-settings-footer">
                <div class="zd-version-badge">
                    <span class="zd-version-label">Version <span class="cfg-version-val"></span></span>
                </div>
                <div class="zd-settings-actions">
                    <button class="zd-settings-cancel-btn">Cancel</button>
                    <button class="zd-settings-save-btn zd-settings-save-btn-main">
                        ${window.ZDIcons ? window.ZDIcons.getIconHTML('check', 14) : '✓'} Save Changes
                    </button>
                </div>
            </section>
        `;

        overlay.appendChild(panel);

        // close on backdrop
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSettings();
        });

        // cancel button
        panel.querySelector('.zd-settings-cancel-btn')
            .addEventListener('click', closeSettings);

        // save button
        panel.querySelector('.zd-settings-save-btn-main')
            .addEventListener('click', async (e) => {
                const btn = e.target;
                btn.classList.add('zd-btn-loading');

                const spinner = showLoadingSpinner();
                closeSettings(); // hide instantly so UX feels snappy

                await saveSettingsForm();        // persist config
                await refreshScheduleCache(true); // recalc hours now that config may have changed
                fastRefreshToolbarNoNetwork();   // repaint toolbar
                await applyToolbarVisibility();  // apply button visibility

                // Flash toolbar with success
                if (toolbarEl) {
                    toolbarEl.classList.add('zd-flash-success');
                    setTimeout(() => toolbarEl.classList.remove('zd-flash-success'), 800);
                }

                hideLoadingSpinner(spinner);
                btn.classList.remove('zd-btn-loading');

                // Show success notification
                if (window.ZDNotifyUtils?.success) {
                    ZDNotifyUtils.success('Settings saved!', 'Your changes have been applied.');
                }
            });

        // backup - opens enhanced export modal with CSV/JSON options
        panel.querySelector('.zd-backup-btn')
            .addEventListener('click', async (e) => {
                if (window.ZDExport?.showExportModal) {
                    window.ZDExport.showExportModal();
                } else {
                    // Fallback to simple backup
                    const btn = e.target;
                    btn.classList.add('zd-btn-loading');

                    const data = await ZDStorage.backupAll();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: 'application/json'
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `support-toolkit-backup-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);

                    btn.classList.remove('zd-btn-loading');

                    // Show success feedback
                    if (window.ZDNotifyUtils?.success) {
                        ZDNotifyUtils.success('Backup created!', 'Your data has been exported successfully.');
                    }
                }
            });

        // restore - with validation
        panel.querySelector('.zd-restore-btn')
            .addEventListener('click', async () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'application/json';
                input.addEventListener('change', async () => {
                    if (!input.files || !input.files[0]) return;
                    const text = await input.files[0].text();
                    try {
                        const data = JSON.parse(text);

                        // Validate data if validator is available
                        if (window.ZDExport?.validateImportData) {
                            const validation = window.ZDExport.validateImportData(data, 'full');
                            if (!validation.valid) {
                                const errorMsg = 'Invalid backup file:\n' + validation.errors.join('\n');
                                if (window.ZDNotifyUtils?.warn) {
                                    ZDNotifyUtils.warn('Validation Failed', errorMsg);
                                } else {
                                    alert(errorMsg);
                                }
                                return;
                            }
                        }

                        await ZDStorage.restoreBackup(data);
                        await refreshScheduleCache(true);
                        fastRefreshToolbarNoNetwork();
                        if (window.ZDNotifyUtils?.info) {
                            ZDNotifyUtils.info('Success', 'Data restored successfully.');
                        } else {
                            alert('Data restored.');
                        }
                    } catch (err) {
                        console.error('[Restore] Failed:', err);
                        if (window.ZDNotifyUtils?.warn) {
                            ZDNotifyUtils.warn('Restore Failed', err.message || 'Invalid backup file format.');
                        } else {
                            alert('Restore failed: ' + (err.message || 'Invalid file format'));
                        }
                    }
                });
                input.click();
            });

        // clear all
        panel.querySelector('.zd-clear-btn')
            .addEventListener('click', async () => {
                if (!confirm('This will clear all counts and settings. Continue?')) return;
                await ZDStorage.clearAll();
                await refreshScheduleCache(true);
                fastRefreshToolbarNoNetwork();
                alert('All data cleared.');
            });

        // calendar help deep link
        panel.querySelector('.zd-hint-calendar')
            .addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openCalendarHelp();
            });

        // Linear API key help deep link
        panel.querySelector('.zd-hint-linear-apikey')
            .addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openLinearAPIKeyHelp();
            });

        // dev mode toggle - show/hide dev tools
        panel.querySelector('.cfg-devMode')
            .addEventListener('change', (e) => {
                const devTools = panel.querySelector('.zd-dev-tools');
                devTools.style.display = e.target.checked ? 'block' : 'none';
            });

        // dev test buttons
        panel.querySelectorAll('.zd-dev-test-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const test = btn.getAttribute('data-test');

                if (test === 'shift-start') {
                    if (window.ZDNotifications?.showShiftNotification) {
                        window.ZDNotifications.showShiftNotification('start', 'chat');
                    }
                } else if (test === 'shift-end') {
                    if (window.ZDNotifications?.showShiftNotification) {
                        window.ZDNotifications.showShiftNotification('end', 'tickets');
                    }
                } else if (test === 'sound') {
                    if (window.ZDNotifications?.playShiftSound) {
                        window.ZDNotifications.playShiftSound();
                    }
                } else if (test === 'archive') {
                    if (!window.ZDStorage?.simulateArchiveOnly) return;
                    await ZDStorage.simulateArchiveOnly();
                    if (statsOverlayEl && statsOverlayEl.style.display === 'flex') {
                        await renderStatsOverlay();
                    }
                    window.ZDNotifyUtils?.info(
                        'Archive simulated',
                        'Today\'s counts were copied into weekly history without resetting the toolbar.'
                    );
                } else if (test === 'full-reset') {
                    if (!window.ZDStorage?.forceNewDayReset) return;

                    const currentCounts = await ZDStorage.getCounts();
                    console.log('Before reset:', currentCounts);

                    await ZDStorage.forceNewDayReset();

                    const newCounts = await ZDStorage.getCounts();
                    console.log('After reset:', newCounts);

                    fastRefreshToolbarNoNetwork();

                    if (statsOverlayEl && statsOverlayEl.style.display === 'flex') {
                        await renderStatsOverlay();
                    }

                    window.ZDNotifyUtils?.info(
                        'Full day reset simulated',
                        'Today\'s data was archived to history and counters were reset to 0. Check the console and F12 → Application → Storage to verify.'
                    );
                } else if (test === 'whats-new') {
                    // Show changelog modal
                    if (window.ZDChangelogModal?.show) {
                        window.ZDChangelogModal.show();
                    }
                } else if (test === 'version-popup') {
                    // Test version update notification
                    if (window.ZDNotifications?.versionUpdate) {
                        window.ZDNotifications.versionUpdate(chrome.runtime.getManifest().version);
                    }
                }
            });
        });

        return overlay;
    }

    async function populateSettingsForm() {
        const cfg = await ZDStorage.getConfig();
        const panel = settingsOverlayEl.querySelector('.zd-settings-panel');

        // default true unless explicitly false
        panel.querySelector('.cfg-showPercentages').checked =
            cfg.showPercentages === false ? false : true;

        panel.querySelector('.cfg-showShiftReminders').checked =
            cfg.showShiftReminders === false ? false : true;

        panel.querySelector('.cfg-playReminderSound').checked =
            cfg.playReminderSound === false ? false : true;

        panel.querySelector('.cfg-showShiftTimer').checked =
            cfg.showShiftTimer === false ? false : true;

        panel.querySelector('.cfg-enableSummaryPopup').checked =
            cfg.enableSummaryPopup === true ? true : false;  // Off by default

        panel.querySelector('.cfg-devMode').checked = !!cfg.devMode;

        // Show/hide dev tools based on devMode
        const devTools = panel.querySelector('.zd-dev-tools');
        if (devTools) {
            devTools.style.display = cfg.devMode ? 'block' : 'none';
        }

        // Hourly goals
        panel.querySelector('.cfg-goalChatsPerHour').value =
            (cfg.goalChatsPerHour != null) ? cfg.goalChatsPerHour : 5;
        panel.querySelector('.cfg-goalTicketsPerHour').value =
            (cfg.goalTicketsPerHour != null) ? cfg.goalTicketsPerHour : 5;

        // Shift warnings — each independently toggleable + adjustable
        panel.querySelector('.cfg-startShiftWarningEnabled').checked =
            cfg.startShiftWarningEnabled !== false;
        panel.querySelector('.cfg-startShiftWarningMinutes').value =
            cfg.startShiftWarningMinutes || cfg.preShiftWarningMinutes || 5;

        panel.querySelector('.cfg-lateLoginWarningEnabled').checked =
            cfg.lateLoginWarningEnabled !== false;
        panel.querySelector('.cfg-lateLoginWarningMinutes').value =
            cfg.lateLoginWarningMinutes || 10;

        panel.querySelector('.cfg-endShiftWarningEnabled').checked =
            cfg.endShiftWarningEnabled !== false;
        panel.querySelector('.cfg-endShiftWarningMinutes').value =
            cfg.endShiftWarningMinutes || 10;

        // Disable each minutes input while its warning toggle is off
        [
            ['.cfg-startShiftWarningEnabled', '.cfg-startShiftWarningMinutes'],
            ['.cfg-lateLoginWarningEnabled', '.cfg-lateLoginWarningMinutes'],
            ['.cfg-endShiftWarningEnabled', '.cfg-endShiftWarningMinutes']
        ].forEach(([toggleSel, inputSel]) => {
            const toggle = panel.querySelector(toggleSel);
            const input = panel.querySelector(inputSel);
            if (!toggle || !input) return;
            const sync = () => { input.disabled = !toggle.checked; };
            toggle.addEventListener('change', sync);
            sync();
        });

        panel.querySelector('.cfg-stackSidebars').value =
            cfg.stackSidebars || 'off';

        // Zendesk Enhancements toggles — all default ON (checked unless === false)
        const checkByKey = (sel, val) => {
            const el = panel.querySelector(sel);
            if (el) el.checked = val !== false;
        };
        checkByKey('.cfg-siteToolsMenu', cfg.siteToolsMenu);
        checkByKey('.cfg-stylingDarkMode', cfg.stylingDarkMode);
        checkByKey('.cfg-stylingResizeBoxes', cfg.stylingResizeBoxes);
        checkByKey('.cfg-stylingWideMessages', cfg.stylingWideMessages);
        checkByKey('.cfg-stylingChatBubbles', cfg.stylingChatBubbles);
        checkByKey('.cfg-wfDraftMode', cfg.wfDraftMode);
        checkByKey('.cfg-wfMergeUncheck', cfg.wfMergeUncheck);
        checkByKey('.cfg-wfStayOnTicket', cfg.wfStayOnTicket);
        checkByKey('.cfg-wfMessagingDefault', cfg.wfMessagingDefault);

        panel.querySelector('.cfg-calendarURL').value =
            cfg.calendarURL || '';

        panel.querySelector('.cfg-linearApiKey').value =
            cfg.linearApiKey || '';

        const selectEl = panel.querySelector('.cfg-weekStartsOn');
        selectEl.value = cfg.weekStartsOn || 'Mon';

        // Toolbar customization checkboxes (default true)
        panel.querySelector('.cfg-showLinear').checked =
            cfg.showLinear === false ? false : true;
        panel.querySelector('.cfg-showNotes').checked =
            cfg.showNotes === false ? false : true;
        panel.querySelector('.cfg-showStats').checked =
            cfg.showStats === false ? false : true;

        // version label matches manifest version
        panel.querySelector('.cfg-version-val').textContent =
            chrome.runtime.getManifest().version;

        // Populate theme and size selectors if available
        if (window.ZDThemePresets) {
            const themeSelect = panel.querySelector('#zd-theme-select');
            const sizeSelect = panel.querySelector('#zd-size-select');

            if (themeSelect) {
                const currentThemeId = cfg.currentTheme || 'default';
                themeSelect.value = currentThemeId;

                themeSelect.addEventListener('change', async () => {
                    const latestCfg = await ZDStorage.getConfig();
                    const currentSize = latestCfg.currentSize || 'normal';
                    const isDark = latestCfg.theme === 'dark';
                    await window.ZDThemePresets.applyTheme(themeSelect.value, isDark, currentSize);
                });
            }

            if (sizeSelect) {
                const currentSize = cfg.currentSize || 'normal';
                sizeSelect.value = currentSize;

                sizeSelect.addEventListener('change', async () => {
                    const latestCfg = await ZDStorage.getConfig();
                    const currentTheme = latestCfg.currentTheme || 'default';
                    const isDark = latestCfg.theme === 'dark';
                    await window.ZDThemePresets.applyTheme(currentTheme, isDark, sizeSelect.value);
                });
            }
        }
    }

    async function saveSettingsForm() {
        const panel = settingsOverlayEl.querySelector('.zd-settings-panel');
        const calVal = panel.querySelector('.cfg-calendarURL').value.trim();

        // Get current config to preserve properties not in the form
        const currentCfg = await ZDStorage.getConfig();

        const newCfg = {
            showPercentages: panel.querySelector('.cfg-showPercentages').checked,
            showShiftReminders: panel.querySelector('.cfg-showShiftReminders').checked,
            playReminderSound: panel.querySelector('.cfg-playReminderSound').checked,
            showShiftTimer: panel.querySelector('.cfg-showShiftTimer').checked,
            enableSummaryPopup: panel.querySelector('.cfg-enableSummaryPopup').checked,
            devMode: panel.querySelector('.cfg-devMode').checked,

            goalChatsPerHour:
                Number(panel.querySelector('.cfg-goalChatsPerHour').value) || 0,
            goalTicketsPerHour:
                Number(panel.querySelector('.cfg-goalTicketsPerHour').value) || 0,

            startShiftWarningEnabled:
                panel.querySelector('.cfg-startShiftWarningEnabled').checked,
            startShiftWarningMinutes:
                Number(panel.querySelector('.cfg-startShiftWarningMinutes').value) || 5,
            lateLoginWarningEnabled:
                panel.querySelector('.cfg-lateLoginWarningEnabled').checked,
            lateLoginWarningMinutes:
                Number(panel.querySelector('.cfg-lateLoginWarningMinutes').value) || 10,
            endShiftWarningEnabled:
                panel.querySelector('.cfg-endShiftWarningEnabled').checked,
            endShiftWarningMinutes:
                Number(panel.querySelector('.cfg-endShiftWarningMinutes').value) || 10,

            weekStartsOn: panel.querySelector('.cfg-weekStartsOn').value || 'Mon',
            stackSidebars: panel.querySelector('.cfg-stackSidebars').value || 'off',

            // Zendesk Enhancements toggles
            siteToolsMenu: panel.querySelector('.cfg-siteToolsMenu').checked,
            stylingDarkMode: panel.querySelector('.cfg-stylingDarkMode').checked,
            stylingResizeBoxes: panel.querySelector('.cfg-stylingResizeBoxes').checked,
            stylingWideMessages: panel.querySelector('.cfg-stylingWideMessages').checked,
            stylingChatBubbles: panel.querySelector('.cfg-stylingChatBubbles').checked,
            wfDraftMode: panel.querySelector('.cfg-wfDraftMode').checked,
            wfMergeUncheck: panel.querySelector('.cfg-wfMergeUncheck').checked,
            wfStayOnTicket: panel.querySelector('.cfg-wfStayOnTicket').checked,
            wfMessagingDefault: panel.querySelector('.cfg-wfMessagingDefault').checked,

            calendarURL: calVal,
            linearApiKey: panel.querySelector('.cfg-linearApiKey').value.trim(),

            // Toolbar customization
            showLinear: panel.querySelector('.cfg-showLinear').checked,
            showNotes: panel.querySelector('.cfg-showNotes').checked,
            showStats: panel.querySelector('.cfg-showStats').checked,

            // Theme settings
            currentTheme: panel.querySelector('#zd-theme-select')?.value || 'default',
            currentSize: panel.querySelector('#zd-size-select')?.value || 'normal',
            theme: currentCfg.theme || 'light', // Preserve dark/light mode

            // once you open settings, consider calendar "onboarded"
            onboardedCalendar: true
        };

        await ZDStorage.setConfig(newCfg);

        // Apply theme immediately after saving
        if (window.ZDThemePresets) {
            const isDark = newCfg.theme === 'dark';
            await window.ZDThemePresets.applyTheme(newCfg.currentTheme, isDark, newCfg.currentSize);
        }

        // Apply sidebar stacking immediately (also picked up via storage event).
        if (window.ZDCustomizerApply && window.ZDCustomizerApply.refresh) {
            window.ZDCustomizerApply.refresh();
        }
    }

    // ------------------------------------------------------------
    // 9B. CHANGELOG MODAL (What's New)
    // ------------------------------------------------------------

    let changelogModalEl = null;

    function buildChangelogModal() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-changelog-overlay';

        const modal = document.createElement('div');
        modal.className = 'zd-changelog-modal';

        // Get recent versions from changelog
        const versions = window.ZDChangelog?.getRecent(3) || [];

        const versionsHtml = versions.map(v => {
            const changesHtml = v.changes.map(c => {
                const icon = window.ZDChangelog?.getTypeIcon(c.type) || '•';
                return `<li class="zd-changelog-change zd-changelog-change-${c.type}">${icon} ${c.text}</li>`;
            }).join('');

            const dateStr = window.ZDChangelog?.formatDate(v.date) || v.date;

            return `
                <div class="zd-changelog-version">
                    <div class="zd-changelog-version-header">
                        <span class="zd-changelog-version-num">v${v.version}</span>
                        <span class="zd-changelog-version-date">${dateStr}</span>
                    </div>
                    <ul class="zd-changelog-changes">${changesHtml}</ul>
                </div>
            `;
        }).join('');

        modal.innerHTML = `
            <div class="zd-changelog-header">
                <span class="zd-changelog-title">📋 Changelog</span>
                <button class="zd-changelog-close-btn">×</button>
            </div>
            <div class="zd-changelog-body">
                ${versionsHtml || '<p class="zd-changelog-empty">No changelog data available.</p>'}
            </div>
        `;

        overlay.appendChild(modal);

        // Close handlers
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeChangelogModal();
        });
        modal.querySelector('.zd-changelog-close-btn').addEventListener('click', closeChangelogModal);

        return overlay;
    }

    function showChangelogModal() {
        if (!changelogModalEl) {
            changelogModalEl = buildChangelogModal();
            document.body.appendChild(changelogModalEl);
        }

        changelogModalEl.style.display = 'flex';
    }

    function closeChangelogModal() {
        if (changelogModalEl) {
            changelogModalEl.style.display = 'none';
        }
    }

    // Export changelog modal to global scope for version notifications
    window.ZDChangelogModal = {
        show: showChangelogModal,
        close: closeChangelogModal
    };

    // ------------------------------------------------------------
    // 10. SCHEDULE MODAL (📅 in toolbar)
    // ------------------------------------------------------------

    async function openScheduleFast() {
        // create overlay if first time
        if (!scheduleOverlayEl) {
            scheduleOverlayEl = buildScheduleOverlay();
            document.body.appendChild(scheduleOverlayEl);
        }

        // Toggle functionality
        if (scheduleOverlayEl.style.display === 'flex') {
            scheduleOverlayEl.style.display = 'none';
            return;
        }

        // paint cached info immediately
        renderScheduleOverlayFromCache();
        scheduleOverlayEl.style.display = 'flex';

        // then refresh schedule cache from network (force=true),
        // then repaint with the freshest data
        await refreshScheduleCache(true);
        renderScheduleOverlayFromCache();

        // after schedule changes, toolbar math may change (hours changed)
        fastRefreshToolbarNoNetwork();
    }

    function closeSchedule() {
        if (scheduleOverlayEl) scheduleOverlayEl.style.display = 'none';
    }

    function buildScheduleOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay';
        overlay.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'zd-schedule-panel zd-gcal-style';

        const today = new Date();
        const dateStr = today.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        panel.innerHTML = `
            <div class="zd-gcal-header">
                <h2 class="zd-gcal-title">
                    ${dateStr}
                </h2>
                <button class="zd-gcal-close-btn">✕</button>
            </div>
            <div class="zd-gcal-calendar">
                <div class="zd-gcal-timeline"></div>
                <div class="zd-gcal-events"></div>
            </div>
        `;
        overlay.appendChild(panel);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSchedule();
        });
        panel.querySelector('.zd-gcal-close-btn')
            .addEventListener('click', closeSchedule);

        return overlay;
    }

    function renderScheduleOverlayFromCache() {
        if (!scheduleOverlayEl) return;
        const timelineEl = scheduleOverlayEl.querySelector('.zd-gcal-timeline');
        const eventsEl = scheduleOverlayEl.querySelector('.zd-gcal-events');

        if (!timelineEl || !eventsEl) return;

        const events = cachedEventsToday || [];
        const now = new Date();

        // Filter relevant events
        const filtered = events.filter(ev => {
            const title = (ev.title || '').toLowerCase();
            return title.includes('chat') || title.includes('ticket');
        });

        // Create timeline hours (6 AM to 11 PM)
        const hours = [];
        for (let h = 6; h <= 23; h++) {
            const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
            const ampm = h >= 12 ? 'PM' : 'AM';
            hours.push(`<div class="zd-gcal-hour">${hour12} ${ampm}</div>`);
        }
        timelineEl.innerHTML = hours.join('');

        // No events case
        if (!filtered.length) {
            eventsEl.innerHTML = `
                <div class="zd-gcal-empty">
                    <p class="zd-empty-text">No shifts scheduled today</p>
                </div>
            `;
            return;
        }

        // Calculate event positions (6 AM = 0%, 11 PM = 100%)
        const dayStart = new Date(now);
        dayStart.setHours(6, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 0, 0, 0);
        const dayDuration = dayEnd - dayStart;

        const eventBlocks = filtered.map(ev => {
            const isChat = /chat/i.test(ev.title || '');
            const isLive = now >= ev.startLocal && now <= ev.endLocal;

            // Calculate position and height
            const startOffset = Math.max(0, (ev.startLocal - dayStart) / dayDuration * 100);
            const endOffset = Math.min(100, (ev.endLocal - dayStart) / dayDuration * 100);
            const height = endOffset - startOffset;

            const startStr = formatHM(ev.startLocal);
            const endStr = formatHM(ev.endLocal);

            return `
                <div class="zd-gcal-event ${isChat ? 'zd-gcal-chat' : 'zd-gcal-ticket'} ${isLive ? 'zd-gcal-live' : ''}"
                     style="top: ${startOffset}%; height: ${height}%;">
                    <div class="zd-gcal-event-title">
                        ${isChat ? 'WP Chat' : 'WP Tickets'}
                        ${isLive ? '<span class="zd-gcal-live-badge">LIVE</span>' : ''}
                    </div>
                    <div class="zd-gcal-event-time">${startStr} – ${endStr}</div>
                </div>
            `;
        });

        // Add current time indicator
        const nowOffset = (now - dayStart) / dayDuration * 100;
        if (nowOffset >= 0 && nowOffset <= 100) {
            const nowStr = formatHM(now);
            eventBlocks.push(`
                <div class="zd-gcal-now-line" style="top: ${nowOffset}%;">
                    <span class="zd-gcal-now-dot"></span>
                    <span class="zd-gcal-now-label">${nowStr}</span>
                </div>
            `);
        }

        eventsEl.innerHTML = eventBlocks.join('');
    }

    function nowMarkerHTML(nowDate, attachToCurrentBlock) {
        const t = formatHM(nowDate);
        return `
            <div class="zd-now-marker ${attachToCurrentBlock ? 'zd-now-marker-active-block' : ''}">
                <span class="zd-now-dot"></span>
                <span class="zd-now-text">Now ${t}</span>
                <span class="zd-now-line"></span>
            </div>
        `;
    }

    // ------------------------------------------------------------
    // 11. STATS MODAL (📊 in toolbar)
    // ------------------------------------------------------------

    async function openStatsModal() {
        if (!statsOverlayEl) {
            statsOverlayEl = buildStatsOverlay();
            document.body.appendChild(statsOverlayEl);
        }

        // Toggle functionality
        if (statsOverlayEl.style.display === 'flex') {
            statsOverlayEl.style.display = 'none';
            return;
        }

        await renderStatsOverlay();
        statsOverlayEl.style.display = 'flex';
    }

    function closeStatsModal() {
        if (statsOverlayEl) {
            statsOverlayEl.style.display = 'none';
        }
    }

    function buildStatsOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay';
        overlay.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'zd-stats-panel';
        panel.innerHTML = `
            <div class="zd-stats-header-row">
                <h2 class="zd-stats-title">Your Stats</h2>
                <div class="zd-stats-gif-slot">
                    <img
                        class="zd-stats-gif"
                        src="https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHhrMDVyeW53aHFyMG5iajJwamNxaWk4dGdsbzg5amJtYnE1MDdqbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/HyL8jQ3hvC9bCGmCk4/giphy.gif"
                        alt="Stats visualization"
                    />
                </div>
            </div>

            <div class="zd-stats-content">
                <!-- renderStatsOverlay() injects here -->
            </div>

            <div class="zd-stats-footer">
                <button class="zd-stats-close-btn">Close</button>
            </div>
        `;


        overlay.appendChild(panel);

        // clicking backdrop closes modal
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeStatsModal();
        });

        panel.querySelector('.zd-stats-close-btn')
            .addEventListener('click', closeStatsModal);

        return overlay;
    }

    // Render helper for today's activity log row
    function formatActivityEntryForDisplay(entry) {
        // entry example:
        // {
        //   timeISO: "2025-10-28T12:45:10.123Z",
        //   mode: "tickets",
        //   source: "auto-resolution",
        //   delta: +1,
        //   newValue: 5,
        //   ticketId: "10397713",
        //   url: "https://...",
        //   ts: 1698525900000
        // }

        // HH:MM local
        let timeText = '';
        try {
            const d = new Date(entry.timeISO);
            const hh = d.getHours().toString().padStart(2, '0');
            const mm = d.getMinutes().toString().padStart(2, '0');
            timeText = `${hh}:${mm}`;
        } catch (e) {
            timeText = '';
        }

        // human-ish description
        let actionText = '';

        if (typeof entry.delta === 'number') {
            if (entry.delta > 0) {
                actionText += `+${entry.delta} ${entry.mode}`;
            } else if (entry.delta < 0) {
                actionText += `${entry.delta} ${entry.mode}`;
            }
        }

        if (entry.source) {
            actionText += ` (${entry.source})`;
        }

        // Make ticket ID clickable if URL is available
        if (entry.ticketId) {
            if (entry.url) {
                actionText += ` — Ticket <a href="${entry.url}" target="_blank" class="zd-activity-ticket-link">${entry.ticketId}</a>`;
            } else {
                actionText += ` — Ticket ${entry.ticketId}`;
            }
        }

        if (typeof entry.newValue === 'number') {
            actionText += ` [now ${entry.mode}: ${entry.newValue}]`;
        }

        return {
            timeText,
            actionText
        };
    }

    // ---- Weekly summary helpers ----

    function buildWeeklyRows(historyObj, weekStartsOn) {
        // Build a 7-day window based on user preference ("week starts on Mon" etc.)
        const weekdayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        const targetStartIdx = weekdayNames.indexOf(weekStartsOn || 'Mon');
        const today = new Date();
        const todayIdx = today.getDay();

        // how far back from "today" is the start of this reporting week?
        const diffBack = (todayIdx - targetStartIdx + 7) % 7;

        // startOfWeek = that "start" day in local time
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - diffBack);

        // build 7 consecutive dates
        const span = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            span.push(d);
        }

        let weekChats = 0;
        let weekTickets = 0;

        let bestTotal = -1;
        let bestKey = null;

        const rows = span.map(d => {
            const key = ZDStorage.getLocalDayKey(d);
            const rec = historyObj[key] || { chats: 0, tickets: 0 };

            const chats = rec.chats || 0;
            const tickets = rec.tickets || 0;
            const total = chats + tickets;

            weekChats += chats;
            weekTickets += tickets;

            if (total > bestTotal) {
                bestTotal = total;
                bestKey = key;
            }

            const weekdayNamesShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const dayLabel = `${weekdayNamesShort[d.getDay()]} ${d.getDate()}`;

            return {
                dateObj: d,
                key,
                dayLabel,
                chats,
                tickets,
                total
            };
        });

        return {
            rows,
            weekChats,
            weekTickets,
            weekTotal: weekChats + weekTickets,
            bestKey,
            span // array of Date objects (for streak calc)
        };
    }

    // Did we "meet goal" for a day?
    function didDayHitGoals(dayRecord, cfg, chatHoursForDay, ticketHoursForDay) {
        if (!dayRecord) return false;

        const chats = dayRecord.chats || 0;
        const tickets = dayRecord.tickets || 0;

        const goalChatsPerHour   = (cfg.goalChatsPerHour   != null) ? cfg.goalChatsPerHour   : 5;
        const goalTicketsPerHour = (cfg.goalTicketsPerHour != null) ? cfg.goalTicketsPerHour : 5;

        const requiredChats   = Math.round(goalChatsPerHour   * (chatHoursForDay   || 0));
        const requiredTickets = Math.round(goalTicketsPerHour * (ticketHoursForDay || 0));

        const chatsOK = (chatHoursForDay   || 0) === 0
            ? true
            : (chats >= requiredChats);

        const ticketsOK = (ticketHoursForDay || 0) === 0
            ? true
            : (tickets >= requiredTickets);

        return chatsOK && ticketsOK;
    }

    // Streak = consecutive days (starting today, going backward) where you hit both chat/ticket targets
    // "recentDatesDesc" should be NEWEST → OLDEST (array of Date objects)
    function computeStreak(historyObj, cfg, todayKey, todaysHours, recentDatesDesc) {
        // today's snapshot isn't in dailyHistory yet, so we stitch it in manually
        // using live counts + cached hours.

        let streak = 0;

        for (let i = 0; i < recentDatesDesc.length; i++) {
            const d = recentDatesDesc[i];
            const key = ZDStorage.getLocalDayKey(d);

            let rec = null;
            let hoursForThatDay = { chatHours: 0, ticketHours: 0 };

            if (key === todayKey) {
                // Today → synthesize from live data
                rec = {
                    chats: window.__TODAY_OVERRIDES__?.chats ?? 0,
                    tickets: window.__TODAY_OVERRIDES__?.tickets ?? 0
                };
                hoursForThatDay.chatHours   = todaysHours.chatHours   || 0;
                hoursForThatDay.ticketHours = todaysHours.ticketHours || 0;
            } else {
                // Historical → dailyHistory should have the record + scheduled hours
                const histRec = historyObj[key];
                if (histRec) {
                    rec = {
                        chats: histRec.chats || 0,
                        tickets: histRec.tickets || 0
                    };
                    hoursForThatDay.chatHours   = histRec.chatHours   || 0;
                    hoursForThatDay.ticketHours = histRec.ticketHours || 0;
                }
            }

            const ok = didDayHitGoals(
                rec,
                cfg,
                hoursForThatDay.chatHours,
                hoursForThatDay.ticketHours
            );

            if (ok) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }

    async function renderStatsOverlay() {
        if (!statsOverlayEl) return;

        try {
            const todayCounts = await ZDStorage.getCounts();    // { chats, tickets }
            const history = await ZDStorage.getDailyHistory();  // { "YYYY-MM-DD": {chats,...} }
            const cfg = await ZDStorage.getConfig();

        const todayChats = todayCounts.chats || 0;
        const todayTickets = todayCounts.tickets || 0;
        const todayTotal = todayChats + todayTickets;

        // For streak: we need today's info even though it's not written yet
        const todayKey = ZDStorage.getLocalDayKey(new Date());
        window.__TODAY_OVERRIDES__ = {
            chats: todayChats,
            tickets: todayTickets
        };

        // We already computed these hours from schedule cache
        const todaysHours = {
            chatHours:   cachedChatHours   || 0,
            ticketHours: cachedTicketHours || 0
        };

        const requiredChats   = Math.round((cfg.goalChatsPerHour   ?? 5) * (cachedChatHours   || 0));
        const requiredTickets = Math.round((cfg.goalTicketsPerHour ?? 5) * (cachedTicketHours || 0));

        const chatsProgressPct = (cachedChatHours || 0) === 0 || requiredChats === 0
            ? 0
            : Math.min(100, Math.round((todayChats / requiredChats) * 100) || 0);

        const ticketsProgressPct = (cachedTicketHours || 0) === 0 || requiredTickets === 0
            ? 0
            : Math.min(100, Math.round((todayTickets / requiredTickets) * 100) || 0);

        const avgText = avgPerHour(todayTotal, cachedTotalHours);

        // Build this-week block (always Mon–Sun)
        const weekInfo = buildWeeklyRows(history, "Mon");

        // Streak calc:
        // We want newest → oldest dates for computeStreak
        const reversedSpan = [...weekInfo.span].sort((a,b) => b - a);
        const streakDays = computeStreak(
            history,
            cfg,
            todayKey,
            todaysHours,
            reversedSpan
        );

        // WEEK TABLE HTML
        const headerHtml = `
            <div class="zd-week-header">
                <div>Day</div><div>Chats</div><div>Tickets</div><div>Total</div><div>Notes</div>
            </div>
        `;

        const rowsHtml = weekInfo.rows.map(r => {
            const isToday = (r.key === todayKey);

            let chats = r.chats;
            let tickets = r.tickets;

            // Use live counts for *today* only if there is no archived record yet.
            // If history[todayKey] exists, treat it as a finalized snapshot
            // and don't overwrite it with 0 after a dev "Full New Day".
            if (isToday && !history[todayKey]) {
                chats = todayChats;
                tickets = todayTickets;
            }

            const total = chats + tickets;

            const highlightClass = isToday
                ? 'zd-week-row zd-week-row-today'
                : 'zd-week-row';

            const downloadIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('download', 16) : '↓';
            return `
                <div class="${highlightClass}">
                    <div>${r.dayLabel}</div>
                    <div>${chats}</div>
                    <div>${tickets}</div>
                    <div><strong>${total}</strong></div>
                    <div>
                        <button class="zd-week-download-btn" data-date="${r.key}" title="Download notes for ${r.dayLabel}">
                            ${downloadIcon}
                        </button>
                    </div>
                </div>
            `;
        }).join('');


        // Check if goals are achieved
        const goalsAchieved = chatsProgressPct >= 100 && ticketsProgressPct >= 100 && cachedTotalHours > 0;

        // Celebration memes for goal achievement
        let celebrationHTML = '';
        if (goalsAchieved) {
            // Trigger confetti celebration!
            triggerConfetti();
            const celebrationMemes = [
                {
                    text: '🎉 CRUSHING IT! Goals smashed!',
                    gif: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif'
                },
                {
                    text: '🏆 You\'re a LEGEND!',
                    gif: 'https://media.giphy.com/media/3o6fIUZTTDl0IDjbZS/giphy.gif'
                },
                {
                    text: '🔥 On fire today! Keep it up!',
                    gif: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'
                },
                {
                    text: '💪 Beast mode: ACTIVATED',
                    gif: 'https://media.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif'
                }
            ];
            const meme = celebrationMemes[Math.floor(Math.random() * celebrationMemes.length)];
            celebrationHTML = `
                <div class="zd-celebration-banner">
                    <img src="${meme.gif}" alt="Celebration" class="zd-celebration-gif" />
                    <p class="zd-celebration-text">${meme.text}</p>
                </div>
            `;
        }

        // TODAY CARD HTML (top of stats modal)
        const todayHTML = `
            ${celebrationHTML}
            <div class="zd-stats-today-card">
                <div class="zd-stats-dual">
                    <div class="zd-stats-pair">
                        <div class="zd-stats-label">Chats</div>
                        <div class="zd-stats-value">${todayChats}</div>
                        <div class="zd-progressbar">
                            <div class="zd-progressfill ${chatsProgressPct >= 100 ? 'zd-progress-complete' : ''}" style="width:${chatsProgressPct}%;"></div>
                        </div>
                    </div>

                    <div class="zd-stats-pair">
                        <div class="zd-stats-label">Tickets</div>
                        <div class="zd-stats-value">${todayTickets}</div>
                        <div class="zd-progressbar">
                            <div class="zd-progressfill ${ticketsProgressPct >= 100 ? 'zd-progress-complete' : ''}" style="width:${ticketsProgressPct}%;"></div>
                        </div>
                    </div>
                </div>

                <div class="zd-stats-total-line">
                    <span>Total</span><strong>${todayTotal}</strong>
                </div>

                <div class="zd-stats-today-meta">
                    <div>Avg/hr: ${avgText}</div>
                    <div>Hours today: ${cachedTotalHours.toFixed(1)} h</div>
                </div>
            </div>
        `;

        // ACTIVITY LOG (today)
        const activityArr = await ZDStorage.getActivityLogToday() || [];
        // newest first
        const activitySorted = [...activityArr].sort((a,b) => {
            const at = a.ts || 0;
            const bt = b.ts || 0;
            return bt - at;
        });

        let activityRowsHtml = activitySorted.map(entry => {
            const pretty = formatActivityEntryForDisplay(entry);
            return `
                <div class="zd-activity-row">
                    <span class="zd-activity-time">${pretty.timeText}</span>
                    <span class="zd-activity-desc">${pretty.actionText}</span>
                </div>
            `;
        }).join('');

        // Add meme for empty activity state
        if (!activityRowsHtml || activitySorted.length === 0) {
            const activityMemes = [
                {
                    text: '🦗 Crickets... No activity yet!',
                    gif: 'https://media.giphy.com/media/hEc4k5pN17GZq/giphy.gif'
                },
                {
                    text: '☕ Coffee break mode activated',
                    gif: 'https://media.giphy.com/media/4aBQ9oXQlK41i/giphy.gif'
                },
                {
                    text: '🎮 Loading... just kidding, nothing here yet!',
                    gif: 'https://media.giphy.com/media/tXL4FHPSnVJ0A/giphy.gif'
                }
            ];
            const meme = activityMemes[Math.floor(Math.random() * activityMemes.length)];
            activityRowsHtml = `
                <div class="zd-activity-empty">
                    <img src="${meme.gif}" alt="No activity" class="zd-empty-meme-small" />
                    <p>${meme.text}</p>
                </div>
            `;
        }

        const activitySectionHtml = `
            <section class="zd-stats-section">
                <div class="zd-stats-section-title" style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
                    <span>Today’s Activity</span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input
                            type="text"
                            class="zd-activity-search"
                            placeholder="Search (ticket ID, source, etc.)"
                            style="font-size:12px;padding:6px 8px;border:1px solid #444;border-radius:4px;min-width:220px;background:#111;color:#eee"
                        />
                        <button class="zd-activity-clear-btn" title="Clear all activity (no undo)" style="font-size:12px;padding:6px 10px;border-radius:4px;border:1px solid #666;background:#444;color:#fff;cursor:pointer;">
                            Clear
                        </button>
                    </div>
                </div>
                <div class="zd-activity-list">
                    ${activityRowsHtml}
                </div>
            </section>
        `;


        // FINAL modal content
        statsOverlayEl.querySelector('.zd-stats-content').innerHTML = `
            <section class="zd-stats-section">
                <div class="zd-stats-section-title">Today</div>
                ${todayHTML}
            </section>

            <section class="zd-stats-section">
                <div class="zd-stats-section-title">This week</div>
                <div class="zd-stats-week-wrapper">
                    ${headerHtml}${rowsHtml}
                </div>
                <div class="zd-stats-btn-row">
                    <button class="zd-week-notes-btn">${window.ZDIcons ? window.ZDIcons.getIconHTML('download', 14) : ''}Download Week Notes</button>
                    <button class="zd-open-worked-log-btn">${window.ZDIcons ? window.ZDIcons.getIconHTML('clipboard', 14) : ''}View Worked Log</button>
                </div>
            </section>

            ${activitySectionHtml}
        `;

        // Wire up download buttons for weekly notes
        setTimeout(() => {
            const weekDownloadBtns = statsOverlayEl.querySelectorAll('.zd-week-download-btn');
            weekDownloadBtns.forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const dateKey = btn.getAttribute('data-date');
                    const notes = await getNotesForDate(dateKey);
                    downloadNotes(dateKey, notes);
                });
            });

            const weekNotesBtn = statsOverlayEl.querySelector('.zd-week-notes-btn');
            if (weekNotesBtn) {
                weekNotesBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await downloadWeekNotes();
                });
            }

            // Wire up worked log button
            const workedLogBtn = statsOverlayEl.querySelector('.zd-open-worked-log-btn');
            if (workedLogBtn) {
                workedLogBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    closeStatsModal();
                    await openWorkedLogModal();
                });
            }
        }, 100);

// --- Wire up search + clear for the activity list (uses activityLive) ---
// Wire up search + clear in the activity section
(function initActivityControls() {
    const root = statsOverlayEl;
    if (!root) return;

    const listEl   = root.querySelector('.zd-activity-list');
    const searchEl = root.querySelector('.zd-activity-search');
    const clearBtn = root.querySelector('.zd-activity-clear-btn');

    // Keep a MUTABLE copy of the raw (sorted) items to filter
    let raw = activitySorted.map(entry => {
        const pretty = formatActivityEntryForDisplay(entry);
        // Flatten everything into one searchable string
        const flat = [
            pretty.timeText || '',
            pretty.actionText || '',
            entry.ticketId || '',
            entry.mode || '',
            entry.source || ''
        ].join(' ').toLowerCase();
        return { pretty, entry, flat };
    });

    function renderFiltered(q) {
        const query = (q || '').trim().toLowerCase();
        let rows = raw;

        if (query) {
            rows = raw.filter(r => r.flat.includes(query));
        }

        if (!rows.length) {
            if (query) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'zd-activity-empty';
                emptyDiv.textContent = `🔍 No activity matching "${query}".`;
                listEl.innerHTML = '';
                listEl.appendChild(emptyDiv);
            } else {
                const activityMemes = [
                    {
                        text: '🦗 Crickets... No activity yet!',
                        gif: 'https://media.giphy.com/media/hEc4k5pN17GZq/giphy.gif'
                    },
                    {
                        text: '☕ Coffee break mode activated',
                        gif: 'https://media.giphy.com/media/4aBQ9oXQlK41i/giphy.gif'
                    },
                    {
                        text: '🎮 Loading... just kidding, nothing here yet!',
                        gif: 'https://media.giphy.com/media/tXL4FHPSnVJ0A/giphy.gif'
                    }
                ];
                const meme = activityMemes[Math.floor(Math.random() * activityMemes.length)];
                listEl.innerHTML = `
                    <div class="zd-activity-empty">
                        <img src="${meme.gif}" alt="No activity" class="zd-empty-meme-small" />
                        <p>${meme.text}</p>
                    </div>
                `;
            }
            return;
        }

        listEl.innerHTML = rows.map(r => `
            <div class="zd-activity-row">
                <span class="zd-activity-time">${r.pretty.timeText}</span>
                <span class="zd-activity-desc">${r.pretty.actionText}</span>
            </div>
        `).join('');
    }

    // Live filter as you type
    if (searchEl) {
        searchEl.addEventListener('input', (e) => {
            renderFiltered(e.target.value);
        });
    }

    // Clear all activity (with confirmation)
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            const sure = confirm('This will permanently delete all activity log entries. This cannot be undone. Continue?');
            if (!sure) return;

            const spinner = showLoadingSpinner();
            try {
                // Clear everything in storage
                await ZDStorage.clearActivityLogAll();

                // Also clear our in-memory copy so search can't bring them back
                raw = [];
                activitySorted.length = 0;

                // Reset search box
                if (searchEl) searchEl.value = '';

                // Re-render empty state
                renderFiltered('');
            } finally {
                hideLoadingSpinner(spinner);
            }
        });
    }

    // Initial render (no query → show all)
    renderFiltered('');
})();

        } catch (err) {
            console.error('[Stats] Error rendering stats overlay:', err);

            // If there's an error, render the full stats page with all zeros
            // This ensures the modal always opens with the complete layout
            if (statsOverlayEl) {
                const contentEl = statsOverlayEl.querySelector('.zd-stats-content');
                if (contentEl) {
                    // Get current date for week display
                    const today = new Date();
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const currentDay = today.getDay();

                    // Build week rows with zeros
                    let weekRows = '';
                    for (let i = 1; i <= 7; i++) {
                        const dayIndex = i % 7;
                        const dayName = days[dayIndex];
                        const isToday = dayIndex === currentDay;
                        const rowClass = isToday ? 'zd-week-row zd-week-row-today' : 'zd-week-row';

                        const fallbackDownloadIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('download', 16) : '↓';
                        weekRows += `
                            <div class="${rowClass}">
                                <div>${dayName}</div>
                                <div>0</div>
                                <div>0</div>
                                <div><strong>0</strong></div>
                                <div>
                                    <button class="zd-week-download-btn" data-date="" title="Download notes">
                                        ${fallbackDownloadIcon}
                                    </button>
                                </div>
                            </div>
                        `;
                    }

                    contentEl.innerHTML = `
                        <section class="zd-stats-section">
                            <div class="zd-stats-section-title">Today</div>
                            <div class="zd-stats-dual">
                                <div class="zd-stats-pair">
                                    <div class="zd-stats-label">Chats</div>
                                    <div class="zd-stats-value">0</div>
                                    <div class="zd-progressbar">
                                        <div class="zd-progressfill" style="width: 0%;"></div>
                                    </div>
                                </div>
                                <div class="zd-stats-pair">
                                    <div class="zd-stats-label">Tickets</div>
                                    <div class="zd-stats-value">0</div>
                                    <div class="zd-progressbar">
                                        <div class="zd-progressfill" style="width: 0%;"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="zd-stats-total-line">
                                <span>Total</span>
                                <strong>0</strong>
                            </div>
                        </section>

                        <section class="zd-stats-section">
                            <div class="zd-stats-section-title">This week</div>
                            <div class="zd-stats-week-wrapper">
                                <div class="zd-week-header">
                                    <div>Day</div><div>Chats</div><div>Tickets</div><div>Total</div><div>Notes</div>
                                </div>
                                ${weekRows}
                            </div>
                            <button class="zd-week-notes-btn">${window.ZDIcons ? window.ZDIcons.getIconHTML('download', 14) : ''}Download Week Notes</button>
                        </section>

                        <section class="zd-stats-section">
                            <div class="zd-stats-section-title">Activity Log</div>
                            <div class="zd-activity-list">
                                <div class="zd-activity-empty">No activity logged yet.</div>
                            </div>
                        </section>
                    `;

                    // Wire up download buttons
                    setTimeout(() => {
                        const weekDownloadBtns = statsOverlayEl.querySelectorAll('.zd-week-download-btn');
                        weekDownloadBtns.forEach(btn => {
                            btn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                alert('No notes available for this date.');
                            });
                        });

                        const weekNotesBtn = statsOverlayEl.querySelector('.zd-week-notes-btn');
                        if (weekNotesBtn) {
                            weekNotesBtn.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                await downloadWeekNotes();
                            });
                        }
                    }, 100);
                }
            }
        }
    }

    // ------------------------------------------------------------
    // 12. MANUAL ADJUST MODAL (✏️ in toolbar)
    // ------------------------------------------------------------

    async function openManualAdjustModal() {
        // Prevent multiple instances of THIS modal
        if (document.querySelector('.zd-manual-adjust-modal')) {
            return;
        }

        const counts = await ZDStorage.getCounts();
        const type = currentMode === 'chats' ? 'chats' : 'tickets';

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-manual-adjust-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-log-panel';
        panel.style.width = '320px';

        panel.innerHTML = `
            <h2 class="zd-log-title">Set ${type} count</h2>
            <div style="font-size:13px;line-height:1.4;margin-bottom:10px;">
                Current: <strong>${counts[type]}</strong>
            </div>
            <div class="zd-settings-row">
                <label>New value</label>
                <input type="number" min="0" class="zd-manual-newval" style="width:100%;" value="${counts[type]}"/>
            </div>
            <div class="zd-log-footer" style="margin-top:16px;">
                <button class="zd-manual-cancel">Cancel</button>
                <button class="zd-manual-save">Save</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        function close() {
            overlay.remove();
        }

        panel.querySelector('.zd-manual-cancel').addEventListener('click', close);

        panel.querySelector('.zd-manual-save').addEventListener('click', async () => {
            const newValStr = panel.querySelector('.zd-manual-newval').value;
            const newValNum = parseInt(newValStr, 10);

            if (!Number.isNaN(newValNum) && newValNum >= 0) {
                // update the counter itself
                await ZDStorage.setCount(type, newValNum);

                // write a "manual-set" activity log entry
                await ZDStorage.appendActivityLog({
                    timeISO: new Date().toISOString(),
                    mode: type,                // "chats" or "tickets"
                    source: 'manual-set',      // user override
                    delta: 0,                  // not +1/-1 specifically
                    newValue: newValNum        // final value
                });

                fastRefreshToolbarNoNetwork();
            }
            close();
        });

        overlay.addEventListener('click', (evt) => {
            if (evt.target === overlay) close();
        });
    }

    // ------------------------------------------------------------
    // 13. DAILY NOTES SYSTEM
    // ------------------------------------------------------------

    // Get today's date key (YYYY-MM-DD)
    function getTodayDateKey() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    // Get notes for a specific date
    async function getNotesForDate(dateKey) {
        const result = await chrome.storage.local.get([`notes_${dateKey}`]);
        return result[`notes_${dateKey}`] || '';
    }

    // Save notes for a specific date
    async function saveNotesForDate(dateKey, content) {
        await chrome.storage.local.set({ [`notes_${dateKey}`]: content });
    }

    // Download notes as .txt file
    function downloadNotes(dateKey, content) {
        if (!content || content.trim() === '') {
            alert('No notes to download for this date.');
            return;
        }

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes_${dateKey}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Download week's notes
    async function downloadWeekNotes() {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

        let weekContent = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dateKey = date.toISOString().split('T')[0];
            const dayName = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i];
            const notes = await getNotesForDate(dateKey);

            if (notes && notes.trim()) {
                weekContent += `===========================================\n`;
                weekContent += `${dayName} - ${dateKey}\n`;
                weekContent += `===========================================\n`;
                weekContent += notes + '\n\n';
            }
        }

        if (!weekContent) {
            alert('No notes found for this week.');
            return;
        }

        const today$ = getTodayDateKey();
        const monday$ = monday.toISOString().split('T')[0];

        const blob = new Blob([weekContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `week_notes_${monday$}_to_${today$}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Open notes side panel
    async function openNotesPanel() {
        // Check if panel already exists
        let panel = document.querySelector('.zd-notes-panel');
        if (panel) {
            // Toggle visibility
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
            return;
        }

        const dateKey = getTodayDateKey();
        const existingNotes = await getNotesForDate(dateKey);

        // Create panel
        panel = document.createElement('div');
        panel.className = 'zd-notes-panel';
        panel.innerHTML = `
            <div class="zd-notes-header">
                <h3 class="zd-notes-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('notes', 18) : '📝'} Daily Notes</h3>
                <span class="zd-notes-date">${dateKey}</span>
                <button class="zd-notes-close-btn" title="Close">×</button>
            </div>
            <div class="zd-notes-content">
                <textarea class="zd-notes-textarea" placeholder="Type your notes here... They will be saved automatically and reset at midnight.">${existingNotes}</textarea>
            </div>
            <div class="zd-notes-footer">
                <button class="zd-notes-download-btn">Download Today's Notes</button>
                <span class="zd-notes-auto-save">Auto-saves as you type</span>
            </div>
        `;

        document.body.appendChild(panel);

        const textarea = panel.querySelector('.zd-notes-textarea');
        const closeBtn = panel.querySelector('.zd-notes-close-btn');
        const downloadBtn = panel.querySelector('.zd-notes-download-btn');

        // Auto-save as user types (with debounce)
        let saveTimeout;
        textarea.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                const content = textarea.value;
                await saveNotesForDate(dateKey, content);
            }, 500);
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Download button
        downloadBtn.addEventListener('click', () => {
            const content = textarea.value;
            downloadNotes(dateKey, content);
        });

        // Apply theme
        await applyThemeToDOM();
    }

    // Check if it's end of day and remind to download notes
    async function checkEndOfDayNotesReminder() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Check if it's 11:45 PM (15 minutes before midnight)
        if (hours === 23 && minutes === 45) {
            const dateKey = getTodayDateKey();
            const notes = await getNotesForDate(dateKey);

            if (notes && notes.trim()) {
                // Check if we already showed reminder today
                const reminderKey = `notesReminder_${dateKey}`;
                const result = await chrome.storage.local.get([reminderKey]);

                if (!result[reminderKey]) {
                    // Mark reminder as shown
                    await chrome.storage.local.set({ [reminderKey]: true });

                    // Show notification
                    if (window.ZDNotifications && typeof window.ZDNotifications.showCenterNotification === 'function') {
                        window.ZDNotifications.showCenterNotification({
                            title: 'Don\'t Forget Your Notes!',
                            message: 'You have notes from today. Download them before midnight!',
                            actionText: 'Download Now',
                            actionCallback: async () => {
                                const content = await getNotesForDate(dateKey);
                                downloadNotes(dateKey, content);
                            }
                        });
                    }
                }
            }
        }
    }

    // Check for end-of-week reminder (Saturday evening before Sunday reset)
    async function checkEndOfWeekReminder() {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
        const hours = now.getHours();

        // Saturday evening at 8 PM
        if (dayOfWeek === 6 && hours === 20) {
            const reminderKey = `weekEndReminder_${getTodayDateKey()}`;
            const result = await chrome.storage.local.get([reminderKey]);

            if (!result[reminderKey]) {
                // Mark reminder as shown
                await chrome.storage.local.set({ [reminderKey]: true });

                // Show notification
                if (window.ZDNotifications && typeof window.ZDNotifications.showCenterNotification === 'function') {
                    window.ZDNotifications.showCenterNotification({
                        title: 'End of Week - Download Your Notes!',
                        message: 'It\'s Saturday evening! Download your week\'s notes before they reset on Sunday.',
                        actionText: 'Download Week Notes',
                        actionCallback: async () => {
                            await downloadWeekNotes();
                        }
                    });
                }
            }
        }
    }

    // Initialize notes system - register reminders with timer manager
    // (They will be started once ZDTimerManager.start() is called in init)
    if (window.ZDTimerManager) {
        ZDTimerManager.register({
            id: 'notes-day-reminder',
            intervalMs: 60_000,
            fn: checkEndOfDayNotesReminder
        });
        ZDTimerManager.register({
            id: 'notes-week-reminder',
            intervalMs: 60_000,
            fn: checkEndOfWeekReminder
        });
    }

    // ------------------------------------------------------------
    // WORKED LOG: Summary Popup + Log Modal
    // ------------------------------------------------------------

    let workedLogOverlayEl = null;

    // Summary Popup Modal - shows when ticket is resolved (if enabled)
    function showSummaryPopup(data) {
        // Prevent multiple instances
        if (document.querySelector('.zd-summary-popup-modal')) {
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-summary-popup-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-settings-panel zd-modal-animated';
        panel.style.width = '400px';
        panel.style.maxWidth = '95vw';

        const modeLabel = data.mode === 'chats' ? 'Chat' : 'Ticket';
        const ticketDisplay = data.ticketId ? `#${data.ticketId}` : 'Unknown';

        panel.innerHTML = `
            <h2 class="zd-settings-title" style="margin-bottom:16px;">${modeLabel} Resolved</h2>
            <div style="font-size:13px;line-height:1.4;margin-bottom:12px;">
                <strong>${ticketDisplay}</strong>
            </div>
            <div class="zd-settings-row">
                <label style="margin-bottom:6px;display:block;">Quick Summary (optional)</label>
                <textarea
                    class="zd-summary-input"
                    placeholder="What was this about? (e.g., 'Password reset issue')"
                    style="width:100%;height:80px;resize:vertical;padding:10px;border:1px solid var(--zd-border-light);border-radius:6px;font-family:inherit;font-size:13px;"
                ></textarea>
            </div>
            <div class="zd-settings-footer" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                <button class="zd-summary-skip zd-btn-secondary">Skip</button>
                <button class="zd-summary-save zd-btn-primary">Save</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const textareaEl = panel.querySelector('.zd-summary-input');

        // Focus textarea
        setTimeout(() => textareaEl.focus(), 100);

        function close() {
            overlay.remove();
        }

        async function saveEntry(summary) {
            await ZDStorage.appendWorkedLog({
                timestamp: new Date().toISOString(),
                mode: data.mode,
                ticketId: data.ticketId,
                url: data.url,
                summary: summary || '',
                source: data.source || 'auto-resolution'
            });

            if (window.ZDEvents) {
                ZDEvents.emit(ZDEvents.EVENTS.WORKEDLOG_ENTRY_ADDED);
            }
        }

        panel.querySelector('.zd-summary-skip').addEventListener('click', async () => {
            await saveEntry('');
            close();
        });

        panel.querySelector('.zd-summary-save').addEventListener('click', async () => {
            const summary = textareaEl.value.trim();
            await saveEntry(summary);
            close();
        });

        // Enter key to save
        textareaEl.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const summary = textareaEl.value.trim();
                await saveEntry(summary);
                close();
            }
        });

        // Escape to skip
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                saveEntry('');
                close();
            }
        });

        // Click backdrop to skip
        overlay.addEventListener('click', async (evt) => {
            if (evt.target === overlay) {
                await saveEntry('');
                close();
            }
        });
    }

    // Listen for summary popup event from auto-count.js
    if (window.ZDEvents) {
        ZDEvents.on(ZDEvents.EVENTS.WORKEDLOG_SHOW_POPUP, showSummaryPopup);
    }

    // Worked Log Modal - view all worked items
    let workedLogWeekOffset = 0; // 0 = current week, -1 = last week, etc.

    function buildWorkedLogOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-worked-log-modal';
        overlay.style.display = 'none';

        const panel = document.createElement('div');
        panel.className = 'zd-stats-panel zd-worked-log-panel';

        const collapseIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('collapse', 14) : '‹';
        const expandIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('expand', 14) : '›';

        panel.innerHTML = `
            <div class="zd-worked-log-header">
                <h2 class="zd-stats-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('clipboard', 18) : ''}Worked Log</h2>
                <button class="zd-worked-log-close" title="Close">×</button>
            </div>

            <div class="zd-week-nav">
                <button class="zd-week-nav-btn zd-week-prev" title="Previous week">${collapseIcon}</button>
                <span class="zd-week-range">This Week</span>
                <button class="zd-week-nav-btn zd-week-next" title="Next week">${expandIcon}</button>
            </div>

            <div class="zd-worked-log-tabs">
                <div class="zd-worked-log-day-tabs">
                    <!-- Day tabs dynamically inserted -->
                </div>
                <div class="zd-worked-log-type-tabs">
                    <button class="zd-type-tab active" data-type="all">All</button>
                    <button class="zd-type-tab" data-type="chats">Chats</button>
                    <button class="zd-type-tab" data-type="tickets">Tickets</button>
                </div>
            </div>

            <div class="zd-worked-log-content">
                <table class="zd-worked-log-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>ID</th>
                            <th>Summary</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody class="zd-worked-log-tbody">
                        <!-- Rows dynamically inserted -->
                    </tbody>
                </table>
                <div class="zd-worked-log-empty" style="display:none;">
                    <p>No entries for this day.</p>
                </div>
            </div>

            <div class="zd-worked-log-footer">
                <div class="zd-worked-log-actions-left">
                    <button class="zd-worked-log-btn zd-btn-secondary" data-action="today" title="Export today's log as text">
                        ${window.ZDIcons ? window.ZDIcons.getIconHTML('download', 14) : ''}Today (.txt)
                    </button>
                    <button class="zd-worked-log-btn zd-btn-secondary" data-action="week" title="Export week's log as text">
                        ${window.ZDIcons ? window.ZDIcons.getIconHTML('download', 14) : ''}Week (.txt)
                    </button>
                    <button class="zd-worked-log-btn zd-btn-secondary" data-action="csv" title="Export week's log as CSV">
                        ${window.ZDIcons ? window.ZDIcons.getIconHTML('clipboard', 14) : ''}CSV
                    </button>
                </div>
                <div class="zd-worked-log-actions-right">
                    <button class="zd-worked-log-btn zd-btn-secondary" data-action="add">
                        ${window.ZDIcons ? window.ZDIcons.getIconHTML('plus', 14) : '+'}Add Entry
                    </button>
                    <button class="zd-worked-log-close-btn">Close</button>
                </div>
            </div>
        `;

        overlay.appendChild(panel);

        // Event handlers
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeWorkedLogModal();
        });

        panel.querySelector('.zd-worked-log-close').addEventListener('click', closeWorkedLogModal);
        panel.querySelector('.zd-worked-log-close-btn').addEventListener('click', closeWorkedLogModal);

        return overlay;
    }

    async function openWorkedLogModal() {
        // Reset to current week when opening
        workedLogWeekOffset = 0;

        if (!workedLogOverlayEl) {
            workedLogOverlayEl = buildWorkedLogOverlay();
            document.body.appendChild(workedLogOverlayEl);
            await wireWorkedLogEvents();
        }
        await renderWorkedLogModal();
        workedLogOverlayEl.style.display = 'flex';
    }

    function closeWorkedLogModal() {
        if (workedLogOverlayEl) {
            workedLogOverlayEl.style.display = 'none';
        }
    }

    async function wireWorkedLogEvents() {
        const panel = workedLogOverlayEl.querySelector('.zd-worked-log-panel');

        // Type tabs
        panel.querySelectorAll('.zd-type-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                panel.querySelectorAll('.zd-type-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                await renderWorkedLogTable();
            });
        });

        // Action buttons
        panel.querySelectorAll('.zd-worked-log-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                const originalText = btn.innerHTML;

                // Add loading state for export actions
                if (action === 'today' || action === 'week' || action === 'csv') {
                    btn.classList.add('zd-btn-loading');
                    btn.disabled = true;
                }

                try {
                    switch (action) {
                        case 'today':
                            await exportWorkedLogToday();
                            break;
                        case 'week':
                            await exportWorkedLogWeek();
                            break;
                        case 'csv':
                            await exportWorkedLogCSV();
                            break;
                        case 'add':
                            openAddWorkedLogEntry();
                            break;
                    }
                } finally {
                    // Remove loading state
                    if (action === 'today' || action === 'week' || action === 'csv') {
                        btn.classList.remove('zd-btn-loading');
                        btn.disabled = false;
                    }
                }
            });
        });

        // Week navigation buttons
        const prevWeekBtn = panel.querySelector('.zd-week-prev');
        const nextWeekBtn = panel.querySelector('.zd-week-next');

        if (prevWeekBtn) {
            prevWeekBtn.addEventListener('click', async () => {
                workedLogWeekOffset--;
                await renderDayTabs();
                await renderWorkedLogTable();
            });
        }

        if (nextWeekBtn) {
            nextWeekBtn.addEventListener('click', async () => {
                if (workedLogWeekOffset < 0) {
                    workedLogWeekOffset++;
                    await renderDayTabs();
                    await renderWorkedLogTable();
                }
            });
        }
    }

    async function renderWorkedLogModal() {
        await renderDayTabs();
        await renderWorkedLogTable();
    }

    async function renderDayTabs() {
        const dayTabsEl = workedLogOverlayEl.querySelector('.zd-worked-log-day-tabs');
        const weekRangeEl = workedLogOverlayEl.querySelector('.zd-week-range');
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        // Get week dates based on offset (Monday start)
        const today = new Date();
        const currentDayOfWeek = today.getDay();
        const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset + (workedLogWeekOffset * 7));

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        // Update week range display
        const formatDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (workedLogWeekOffset === 0) {
            weekRangeEl.textContent = `This Week (${formatDate(monday)} - ${formatDate(sunday)})`;
        } else if (workedLogWeekOffset === -1) {
            weekRangeEl.textContent = `Last Week (${formatDate(monday)} - ${formatDate(sunday)})`;
        } else {
            weekRangeEl.textContent = `${formatDate(monday)} - ${formatDate(sunday)}`;
        }

        // Disable next button if already on current week
        const nextBtn = workedLogOverlayEl.querySelector('.zd-week-next');
        if (nextBtn) {
            nextBtn.disabled = workedLogWeekOffset >= 0;
            nextBtn.classList.toggle('zd-week-nav-disabled', workedLogWeekOffset >= 0);
        }

        let html = '';
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            const dayKey = ZDStorage.getLocalDayKey(date);
            const todayKey = ZDStorage.getLocalDayKey(today);
            const isToday = dayKey === todayKey;

            // Default selection: today if current week, else Monday
            const shouldBeActive = workedLogWeekOffset === 0 ? isToday : (i === 0);
            const activeClass = shouldBeActive ? 'active' : '';
            const todayClass = isToday ? 'zd-day-today' : '';

            html += `
                <button class="zd-day-tab ${activeClass} ${todayClass}" data-day="${dayKey}">
                    ${weekDays[i]}
                    <span class="zd-day-date">${date.getDate()}</span>
                </button>
            `;
        }
        dayTabsEl.innerHTML = html;

        // Add click handlers
        dayTabsEl.querySelectorAll('.zd-day-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                dayTabsEl.querySelectorAll('.zd-day-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                await renderWorkedLogTable();
            });
        });
    }

    async function renderWorkedLogTable() {
        const tbodyEl = workedLogOverlayEl.querySelector('.zd-worked-log-tbody');
        const emptyEl = workedLogOverlayEl.querySelector('.zd-worked-log-empty');
        const tableEl = workedLogOverlayEl.querySelector('.zd-worked-log-table');

        // Get selected day
        const activeDay = workedLogOverlayEl.querySelector('.zd-day-tab.active');
        const dayKey = activeDay?.dataset.day || ZDStorage.getLocalDayKey(new Date());

        // Get selected type filter
        const activeType = workedLogOverlayEl.querySelector('.zd-type-tab.active');
        const typeFilter = activeType?.dataset.type || 'all';

        // Get ALL entries for the day (for counting)
        const allEntries = await ZDStorage.getWorkedLogForDay(dayKey);

        // Update type tab counts
        const allCount = allEntries.length;
        const chatsCount = allEntries.filter(e => e.mode === 'chats').length;
        const ticketsCount = allEntries.filter(e => e.mode === 'tickets').length;

        workedLogOverlayEl.querySelectorAll('.zd-type-tab').forEach(tab => {
            const type = tab.dataset.type;
            let count = 0;
            if (type === 'all') count = allCount;
            else if (type === 'chats') count = chatsCount;
            else if (type === 'tickets') count = ticketsCount;

            const label = type.charAt(0).toUpperCase() + type.slice(1);
            tab.innerHTML = `${label} <span class="zd-tab-count">(${count})</span>`;

            // Dim tabs with 0 entries (but keep All always visible)
            if (count === 0 && type !== 'all') {
                tab.classList.add('zd-tab-empty');
            } else {
                tab.classList.remove('zd-tab-empty');
            }
        });

        // Filter entries for display
        let entries = allEntries;
        if (typeFilter !== 'all') {
            entries = entries.filter(e => e.mode === typeFilter);
        }

        // Sort by timestamp (newest first)
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (entries.length === 0) {
            tbodyEl.innerHTML = '';
            tableEl.style.display = 'none';
            emptyEl.style.display = 'block';

            // Dynamic empty state message
            const dayDate = new Date(dayKey + 'T12:00:00');
            const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
            const typeLabel = typeFilter === 'all' ? 'entries' : typeFilter;
            const clipboardIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('clipboard', 32) : '';

            emptyEl.innerHTML = `
                <div class="zd-empty-icon">${clipboardIcon}</div>
                <p class="zd-empty-title">No ${typeLabel} for ${dayName}</p>
                <p class="zd-empty-hint">Entries are added automatically when you resolve tickets, or use "Add Entry" below.</p>
            `;
            return;
        }

        tableEl.style.display = 'table';
        emptyEl.style.display = 'none';

        tbodyEl.innerHTML = entries.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const typeIcon = entry.mode === 'chats'
                ? (window.ZDIcons ? window.ZDIcons.getIconHTML('chat', 16) : 'Chat')
                : (window.ZDIcons ? window.ZDIcons.getIconHTML('ticket', 16) : 'Ticket');
            const idDisplay = entry.ticketId || '-';
            const summaryDisplay = entry.summary || '<span class="zd-no-summary">No summary</span>';
            const summaryTooltip = entry.summary ? entry.summary.replace(/"/g, '&quot;') : '';
            const editIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('adjust', 14) : 'Edit';
            const deleteIcon = window.ZDIcons ? window.ZDIcons.getIconHTML('trash', 14) : 'Del';
            const sourceBadge = entry.source === 'auto-resolution'
                ? '<span class="zd-source-badge zd-source-auto">Auto</span>'
                : '<span class="zd-source-badge zd-source-manual">Manual</span>';

            return `
                <tr data-id="${entry.id}">
                    <td>${time} ${sourceBadge}</td>
                    <td class="zd-type-icon-cell">${typeIcon}</td>
                    <td>
                        ${entry.url
                            ? `<a href="${entry.url}" target="_blank" class="zd-ticket-link">${idDisplay}</a>`
                            : idDisplay
                        }
                    </td>
                    <td class="zd-summary-cell" title="${summaryTooltip}">${summaryDisplay}</td>
                    <td class="zd-actions-cell">
                        <button class="zd-action-btn zd-edit-btn" title="Edit" data-id="${entry.id}">${editIcon}</button>
                        <button class="zd-action-btn zd-delete-btn" title="Delete" data-id="${entry.id}">${deleteIcon}</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Wire up action buttons
        tbodyEl.querySelectorAll('.zd-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditWorkedLogEntry(btn.dataset.id));
        });

        tbodyEl.querySelectorAll('.zd-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const entryId = btn.dataset.id;
                const row = btn.closest('tr');
                const entryInfo = row ? row.querySelector('.zd-ticket-link')?.textContent || row.children[2]?.textContent || '' : '';
                showDeleteConfirmation(entryId, entryInfo);
            });
        });
    }

    // Custom delete confirmation modal
    function showDeleteConfirmation(entryId, entryInfo) {
        if (document.querySelector('.zd-delete-confirm-modal')) return;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-delete-confirm-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-settings-panel zd-delete-confirm-panel';

        panel.innerHTML = `
            <h2 class="zd-settings-title" style="margin-bottom:12px;">Delete Entry?</h2>
            <p style="font-size:13px;color:var(--zd-text-secondary);margin-bottom:16px;">
                ${entryInfo ? `Entry <strong>${entryInfo}</strong> will be permanently deleted.` : 'This entry will be permanently deleted.'}
            </p>
            <div class="zd-settings-footer" style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="zd-delete-cancel zd-btn-secondary">Cancel</button>
                <button class="zd-delete-confirm zd-btn-danger">Delete</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Focus the cancel button by default
        setTimeout(() => panel.querySelector('.zd-delete-cancel').focus(), 50);

        function close() {
            overlay.remove();
        }

        panel.querySelector('.zd-delete-cancel').addEventListener('click', close);

        panel.querySelector('.zd-delete-confirm').addEventListener('click', async () => {
            await ZDStorage.deleteWorkedLog(entryId);
            close();
            await renderWorkedLogTable();

            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('Entry deleted', 'info', 2000);
            }
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Escape key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // Export worked log for today
    async function exportWorkedLogToday() {
        const todayKey = ZDStorage.getLocalDayKey(new Date());
        const entries = await ZDStorage.getWorkedLogForDay(todayKey);

        if (entries.length === 0) {
            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('No entries for today', 'warning', 2500);
            }
            return;
        }

        const content = formatWorkedLogForExport([{ day: todayKey, entries }]);
        const filename = `worked-log-${todayKey}.txt`;
        downloadTextFile(content, filename);

        if (window.ZDNotifyUtils) {
            window.ZDNotifyUtils.showToast(`Downloaded ${entries.length} entries`, 'success', 2500);
        }
    }

    // Export worked log for current week
    async function exportWorkedLogWeek() {
        const weekData = await ZDStorage.getWorkedLogForWeek();

        const daysWithEntries = Object.entries(weekData)
            .filter(([_, entries]) => entries.length > 0)
            .map(([day, entries]) => ({ day, entries }));

        if (daysWithEntries.length === 0) {
            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('No entries for this week', 'warning', 2500);
            }
            return;
        }

        const totalEntries = daysWithEntries.reduce((sum, d) => sum + d.entries.length, 0);
        const content = formatWorkedLogForExport(daysWithEntries);
        const today = ZDStorage.getLocalDayKey(new Date());
        const filename = `worked-log-week-${today}.txt`;
        downloadTextFile(content, filename);

        if (window.ZDNotifyUtils) {
            window.ZDNotifyUtils.showToast(`Downloaded ${totalEntries} entries from ${daysWithEntries.length} days`, 'success', 2500);
        }
    }

    // Export worked log as CSV
    async function exportWorkedLogCSV() {
        const weekData = await ZDStorage.getWorkedLogForWeek();

        // Flatten all entries with their day info
        const allEntries = [];
        for (const [day, entries] of Object.entries(weekData)) {
            for (const entry of entries) {
                allEntries.push({ day, ...entry });
            }
        }

        if (allEntries.length === 0) {
            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('No entries for this week', 'warning', 2500);
            }
            return;
        }

        // Sort by timestamp
        allEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Build CSV content
        const headers = ['Date', 'Day', 'Time', 'Type', 'ID', 'Summary', 'Source', 'URL'];
        const escapeCSV = (val) => {
            if (val == null) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        };

        let csv = headers.join(',') + '\n';

        for (const entry of allEntries) {
            const date = new Date(entry.timestamp);
            const dateStr = entry.day;
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
            const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            const type = entry.mode === 'chats' ? 'Chat' : 'Ticket';
            const id = entry.ticketId || '';
            const summary = entry.summary || '';
            const source = entry.source === 'auto-resolution' ? 'Auto' : 'Manual';
            const url = entry.url || '';

            const row = [dateStr, dayName, time, type, id, summary, source, url].map(escapeCSV);
            csv += row.join(',') + '\n';
        }

        const today = ZDStorage.getLocalDayKey(new Date());
        const filename = `worked-log-${today}.csv`;
        downloadCSVFile(csv, filename);

        if (window.ZDNotifyUtils) {
            window.ZDNotifyUtils.showToast(`Exported ${allEntries.length} entries to CSV`, 'success', 2500);
        }
    }

    function downloadCSVFile(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function formatWorkedLogForExport(daysData) {
        let output = 'WORKED LOG EXPORT\n';
        output += '================\n\n';

        for (const { day, entries } of daysData) {
            const date = new Date(day + 'T12:00:00');
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

            output += `${dayName} - ${day}\n`;
            output += '-'.repeat(30) + '\n';

            for (const entry of entries) {
                const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                const type = entry.mode === 'chats' ? 'Chat' : 'Ticket';
                const id = entry.ticketId || 'N/A';

                output += `[${time}] ${type} #${id}\n`;
                if (entry.summary) {
                    output += `  Summary: ${entry.summary}\n`;
                }
                if (entry.url) {
                    output += `  URL: ${entry.url}\n`;
                }
                output += '\n';
            }

            output += '\n';
        }

        return output;
    }

    function downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Open Add Entry Modal
    function openAddWorkedLogEntry() {
        if (document.querySelector('.zd-add-entry-modal')) return;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-add-entry-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-settings-panel zd-modal-animated';
        panel.style.width = '400px';
        panel.style.maxWidth = '95vw';

        panel.innerHTML = `
            <h2 class="zd-settings-title" style="margin-bottom:16px;">Add Entry</h2>
            <div class="zd-settings-row" style="margin-bottom:12px;">
                <label style="margin-bottom:6px;display:block;">Type</label>
                <select class="zd-entry-type zd-form-input">
                    <option value="tickets">Ticket</option>
                    <option value="chats">Chat</option>
                </select>
            </div>
            <div class="zd-settings-row" style="margin-bottom:12px;">
                <label style="margin-bottom:6px;display:block;">Ticket/Chat ID (optional)</label>
                <input type="text" class="zd-entry-id zd-form-input" placeholder="e.g., 12345" />
            </div>
            <div class="zd-settings-row" style="margin-bottom:12px;">
                <label style="margin-bottom:6px;display:block;">URL (optional)</label>
                <input type="url" class="zd-entry-url zd-form-input" placeholder="https://..." />
            </div>
            <div class="zd-settings-row" style="margin-bottom:12px;">
                <label style="margin-bottom:6px;display:block;">Summary</label>
                <textarea class="zd-entry-summary zd-form-textarea" placeholder="What was this about?"></textarea>
                <div class="zd-char-counter"><span class="zd-char-count">0</span>/500</div>
            </div>
            <div class="zd-settings-footer" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                <button class="zd-entry-cancel zd-btn-secondary">Cancel</button>
                <button class="zd-entry-save zd-btn-primary">Add</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Focus first input
        setTimeout(() => panel.querySelector('.zd-entry-type').focus(), 50);

        // Character counter
        const summaryEl = panel.querySelector('.zd-entry-summary');
        const charCountEl = panel.querySelector('.zd-char-count');
        summaryEl.addEventListener('input', () => {
            charCountEl.textContent = summaryEl.value.length;
        });

        function close() {
            overlay.remove();
        }

        panel.querySelector('.zd-entry-cancel').addEventListener('click', close);

        async function saveEntry() {
            const type = panel.querySelector('.zd-entry-type').value;
            const ticketId = panel.querySelector('.zd-entry-id').value.trim();
            const url = panel.querySelector('.zd-entry-url').value.trim();
            const summary = panel.querySelector('.zd-entry-summary').value.trim();

            await ZDStorage.appendWorkedLog({
                timestamp: new Date().toISOString(),
                mode: type,
                ticketId: ticketId || null,
                url: url || null,
                summary: summary,
                source: 'manual'
            });

            close();
            await renderWorkedLogTable();

            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('Entry added', 'success', 2000);
            }
        }

        panel.querySelector('.zd-entry-save').addEventListener('click', saveEntry);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Keyboard shortcuts
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                saveEntry();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);
    }

    // Open Edit Entry Modal
    async function openEditWorkedLogEntry(entryId) {
        // Find the entry
        const allLogs = await ZDStorage.getWorkedLogAll();
        let entry = null;

        for (const dayKey in allLogs) {
            const found = allLogs[dayKey].find(e => e.id === entryId);
            if (found) {
                entry = found;
                break;
            }
        }

        if (!entry) return;

        if (document.querySelector('.zd-edit-entry-modal')) return;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-edit-entry-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-settings-panel zd-modal-animated';
        panel.style.width = '400px';
        panel.style.maxWidth = '95vw';

        const currentLen = (entry.summary || '').length;
        panel.innerHTML = `
            <h2 class="zd-settings-title" style="margin-bottom:16px;">Edit Entry</h2>
            <div class="zd-settings-row" style="margin-bottom:12px;">
                <label style="margin-bottom:6px;display:block;">Summary</label>
                <textarea class="zd-entry-summary zd-form-textarea">${entry.summary || ''}</textarea>
                <div class="zd-char-counter"><span class="zd-char-count">${currentLen}</span>/500</div>
            </div>
            <div class="zd-settings-footer" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                <button class="zd-entry-cancel zd-btn-secondary">Cancel</button>
                <button class="zd-entry-save zd-btn-primary">Save</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Focus textarea
        const summaryEl = panel.querySelector('.zd-entry-summary');
        const charCountEl = panel.querySelector('.zd-char-count');
        setTimeout(() => summaryEl.focus(), 50);

        // Character counter
        summaryEl.addEventListener('input', () => {
            charCountEl.textContent = summaryEl.value.length;
        });

        function close() {
            overlay.remove();
        }

        async function saveEntry() {
            const summary = summaryEl.value.trim();
            await ZDStorage.updateWorkedLog(entryId, { summary });
            close();
            await renderWorkedLogTable();

            if (window.ZDNotifyUtils) {
                window.ZDNotifyUtils.showToast('Entry updated', 'success', 2000);
            }
        }

        panel.querySelector('.zd-entry-cancel').addEventListener('click', close);
        panel.querySelector('.zd-entry-save').addEventListener('click', saveEntry);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // Keyboard shortcuts
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', keyHandler);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                saveEntry();
                document.removeEventListener('keydown', keyHandler);
            }
        };
        document.addEventListener('keydown', keyHandler);
    }

    // ------------------------------------------------------------
    // 15. MODE SWITCH (Chats <> Tickets pill)
    // ------------------------------------------------------------

    async function toggleMode() {
        // record manual override time so auto-enforcer backs off briefly
        currentMode = (currentMode === 'chats') ? 'tickets' : 'chats';
        lastManualSwitchAt = Date.now();
        fastRefreshToolbarNoNetwork();
    }

    // ------------------------------------------------------------
    // 14. THEME & TOOLBAR POSITION
    // ------------------------------------------------------------

    async function applyThemeToDOM() {
        const cfg = await ZDStorage.getConfig();

        // Use new advanced theme system
        if (window.ZDThemePresets) {
            const currentTheme = cfg.currentTheme || 'default';
            const currentSize = cfg.currentSize || 'normal';
            const isDark = cfg.theme === 'dark';
            await window.ZDThemePresets.applyTheme(currentTheme, isDark, currentSize);
        } else {
            // Fallback to old simple dark/light theme
            const theme = cfg.theme || 'light';
            if (theme === 'dark') {
                document.body.classList.add('zd-theme-dark');
            } else {
                document.body.classList.remove('zd-theme-dark');
            }
        }
    }

    // Make toolbar draggable, remember preferredBarPos in sync storage
    function enableDragging(bar, handle) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        // Define handlers so they can be removed
        const onMouseMove = (e) => {
            if (!dragging) return;
            bar.style.left = `${e.clientX - offsetX}px`;
            bar.style.top = `${e.clientY - offsetY}px`;
        };

        const onMouseUp = async () => {
            if (!dragging) return;
            dragging = false;

            // Remove listeners when drag ends to prevent memory leak
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // where user actually dropped it
            const rawPos = {
                top:  parseInt(toolbarEl.style.top, 10),
                left: parseInt(toolbarEl.style.left, 10)
            };

            // update our "preferred" (unclamped) memory
            preferredBarPos = rawPos;

            // clamp to viewport so it doesn't get lost off-screen
            const clamped = clampToViewport(preferredBarPos);

            // snap to the clamped coords
            toolbarEl.style.top  = clamped.top  + 'px';
            toolbarEl.style.left = clamped.left + 'px';

            // save the user's chosen preferred position (even if we clamped visually)
            await ZDStorage.setBarPosition(preferredBarPos);
        };

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            const rect = bar.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();

            // Only attach listeners during drag
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    // keep the toolbar onscreen after drag/resizes
    function clampToViewport(pos) {
        if (!toolbarEl) return pos;

        const barRect = toolbarEl.getBoundingClientRect();
        const barW = barRect.width  || 200;
        const barH = barRect.height || 40;

        const maxLeft = window.innerWidth  - barW - 8;
        const maxTop  = window.innerHeight - barH - 8;

        let newLeft = Math.max(8, Math.min(pos.left, maxLeft));
        let newTop  = Math.max(8, Math.min(pos.top,  maxTop));

        return { top: newTop, left: newLeft };
    }

    async function applySavedPosition(initialLoad = false) {
        if (!toolbarEl) return;

        if (initialLoad) {
            // only read from sync once at startup
            const saved = await ZDStorage.getBarPosition();
            preferredBarPos = {
                top:  (saved && typeof saved.top  === 'number') ? saved.top  : 10,
                left: (saved && typeof saved.left === 'number') ? saved.left : 10
            };
        }

        const clamped = clampToViewport(preferredBarPos);
        toolbarEl.style.top  = clamped.top  + 'px';
        toolbarEl.style.left = clamped.left + 'px';
    }

    // ------------------------------------------------------------
    // 15. LOADING SPINNER OVERLAY HELPERS
    // ------------------------------------------------------------

    function showLoadingSpinner() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-loading-overlay';
        overlay.innerHTML = `<div class="zd-loading-ball"></div>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    function hideLoadingSpinner(overlay) {
        if (!overlay) return;
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }

    // Confetti celebration effect
    let confettiTriggered = false;
    function triggerConfetti() {
        // Only trigger once per page load to avoid overwhelming the user
        if (confettiTriggered) return;
        confettiTriggered = true;

        const colors = ['#a91b1b', '#165c3a', '#ffd700', '#4caf50', '#ff6b6b'];
        const confettiCount = 50;

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'zd-confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }

        // Reset after 30 seconds
        setTimeout(() => { confettiTriggered = false; }, 30000);
    }

    // ------------------------------------------------------------
    // 16. AUTO-COUNT (+1 WHEN YOU SUBMIT AS SOLVED/PENDING)
    // ------------------------------------------------------------
    //
    // We watch Zendesk "Submit as Pending", "Submit as Solved", etc.
    // flow:
    //   - on mousedown: store old status (per ticket ID)
    //   - on click: check button text; if it clearly says "Submit as Pending/Solved" → increment immediately
    //   - else: wait 300ms, then compare status text before/after; if it changed to pending/solved/closed → increment
    //
    // We also write that increment to the rich activity log with source:"auto-resolution"

    function isResolutionActionText(txt) {
        if (!txt) return false;
        const t = txt.toLowerCase().trim();
        return (
            t.includes('submit as pending') ||
            t.includes('submit as solved')  ||
            t.includes('submit as closed')  ||
            t.includes('submit as on-hold') ||
            t.includes('submit as on hold') ||
            t === 'pending' ||
            t === 'solved'  ||
            t === 'closed'  ||
            t === 'set to pending' ||
            t === 'set to solved'
        );
    }

    async function incrementForResolution() {
        const now = Date.now();
        if (now - lastIncrementTime < 800) {
            // debounce (avoid +2 from dropdown click + status change fallback)
            return;
        }
        lastIncrementTime = now;

        const which = currentMode === 'chats' ? 'chats' : 'tickets';
        const ticketId = getTicketIdFromURL() || null;
        const currentUrl = window.location.href;

        // increment visible counter (now includes URL for clickable activity)
        await ZDStorage.incCount(which, 1, {
            source: 'auto-resolution',
            ticketId: ticketId,
            url: currentUrl
        });

        fastRefreshToolbarNoNetwork();

        // Handle worked log: show popup or auto-create entry
        const cfg = await ZDStorage.getConfig();

        if (cfg.enableSummaryPopup) {
            // Emit event to show summary popup
            if (window.ZDEvents) {
                window.ZDEvents.emit(window.ZDEvents.EVENTS.WORKEDLOG_SHOW_POPUP, {
                    mode: which,
                    ticketId: ticketId,
                    url: currentUrl,
                    source: 'auto-resolution'
                });
            }
        } else {
            // Auto-create worked log entry without summary
            await ZDStorage.appendWorkedLog({
                timestamp: new Date().toISOString(),
                mode: which,
                ticketId: ticketId,
                url: currentUrl,
                summary: '',
                source: 'auto-resolution'
            });
        }
    }

    // Store the old status right BEFORE submit click
    document.body.addEventListener('mousedown', (e) => {
        const candidate = e.target.closest(
            '[data-test-id="omni-save-button"], ' +
            '[data-test-id="submit_button-button"], ' +
            '[role="menuitem"], ' +
            '[data-test-id="ticket-footer-post-save-actions-menu-button"]'
        );
        if (!candidate) return;

        const tid = getTicketIdFromURL() || 'noid';
        lastStatusByTicketId[tid] = getCurrentStatusText();
    });

    // On click: immediate check + fallback check
    document.body.addEventListener('click', (e) => {
        const candidate = e.target.closest(
            '[data-test-id="omni-save-button"], ' +
            '[data-test-id="submit_button-button"], ' +
            '[role="menuitem"], ' +
            '[data-test-id="ticket-footer-post-save-actions-menu-button"]'
        );
        if (!candidate) return;

        const clickedText = (candidate.innerText || candidate.textContent || '').trim();

        // Case 1: The button text literally says "Submit as Pending", "Submit as Solved", etc.
        if (isResolutionActionText(clickedText)) {
            incrementForResolution();
            return;
        }

        // Case 2: Fallback (wait for Zendesk to actually apply new status)
        setTimeout(() => {
            const tid = getTicketIdFromURL() || 'noid';
            const oldStatus = (lastStatusByTicketId[tid] || '').toLowerCase().trim();
            const newStatus = getCurrentStatusText().toLowerCase().trim();
            if (!newStatus) return;

            const resolvedNow =
                (newStatus.includes('pending') ||
                 newStatus.includes('solved')  ||
                 newStatus.includes('closed')) &&
                newStatus !== oldStatus;

            if (resolvedNow) {
                incrementForResolution();
            }
        }, 300);
    });

    // ------------------------------------------------------------
    // 17. INIT SEQUENCE
    // ------------------------------------------------------------

    async function init() {
        // 0. Ensure mobile viewport meta tag exists
        if (!document.querySelector('meta[name="viewport"]')) {
            const viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
            document.head.appendChild(viewport);
        }

        // 1. Initialize storage (ensure dailyHistory, counts, lastActiveDayUTC exist)
        try {
            if (window.ZDStorage && ZDStorage.initializeStorage) {
                await ZDStorage.initializeStorage();
            }
        } catch (e) {
            console.warn('[ZDCounter] initializeStorage failed:', e);
        }

        // 1. Try to roll UTC-day data; if something goes wrong, don't kill the UI
        try {
            if (window.ZDStorage && ZDStorage.rollDailyIfNeeded) {
                await ZDStorage.rollDailyIfNeeded();
            }
        } catch (e) {
            console.warn('[ZDCounter] rollDailyIfNeeded failed:', e);
        }

        // 2. Build toolbar DOM immediately so user sees it
        await createToolbar();

        // 3. Check version and maybe show update popup
        await checkForVersionUpdate();

        // 4. Apply saved position from sync
        await applySavedPosition(true);

        // 5. Apply theme immediately (prevents flash)
        await applyThemeToDOM();

        // 6. Apply toolbar visibility settings
        await applyToolbarVisibility();

        // 7. Ask for calendar URL onboarding if needed
        await maybePromptForCalendarURL();

        // 8. Try to align starting mode with active shift (no wait for timer tick)
        if (window.ZDTimers?.getIntendedModeFromSchedule) {
            ZDTimers.getIntendedModeFromSchedule().then((intended) => {
                if (intended === 'chats' || intended === 'tickets') {
                    currentMode = intended;
                    fastRefreshToolbarNoNetwork();
                }
            }).catch((err) => {
                console.warn('[ZDCounter] getIntendedModeFromSchedule failed:', err);
            });
        }

        // 6. Listen for live ⏰ updates from timers.js
        hookTimerUpdates();

        // 8. warm schedule cache (network once)
        await refreshScheduleCache(true);

        // 9. paint toolbar counters (after potential reset)
        fastRefreshToolbarNoNetwork();

        // 11. start the live timer engine (this will dispatch ZDTimerUpdate events)
        if (window.ZDTimers && ZDTimers.initTimer) {
            await ZDTimers.initTimer();
        }

        // 11.2. now that timer is initialized, draw the initial timer state safely
        refreshToolbarTimerFromSchedule();

        // 12. Initialize Timer Manager with all recurring tasks
        if (window.ZDTimerManager) {
            // Schedule cache refresh - every 60s
            ZDTimerManager.register({
                id: 'schedule-refresh',
                intervalMs: 60_000,
                fn: async () => {
                    await refreshScheduleCache(false);
                    fastRefreshToolbarNoNetwork();
                    refreshToolbarTimerFromSchedule();
                }
            });

            // Auto-mode enforcer - every 5s
            ZDTimerManager.register({
                id: 'auto-mode-enforcer',
                intervalMs: 5_000,
                fn: () => {
                    enforceAutoModeFromSchedule();
                }
            });

            // Fallback timer repaint - every 30s
            ZDTimerManager.register({
                id: 'timer-repaint',
                intervalMs: 30_000,
                fn: () => {
                    refreshToolbarTimerFromSchedule();
                }
            });
        }

        // 15. Keep toolbar in viewport if window resizes
        window.addEventListener('resize', () => {
            if (!toolbarEl) return;
            const clamped = clampToViewport(preferredBarPos);
            toolbarEl.style.top  = clamped.top  + 'px';
            toolbarEl.style.left = clamped.left + 'px';
        });

        // 16. Storage listeners:
        //     A) Throttled UI refresh when chrome.storage.sync changes (counts, config)
        chrome.storage.onChanged.addListener(
            throttle((changes, area) => {
                if (area === 'sync') {
                    fastRefreshToolbarNoNetwork();
                    refreshToolbarTimerFromSchedule();
                }
            }, 100)
        );

        // Event listener for Linear panel to open settings
        window.addEventListener('zd-open-settings', () => {
            openSettings();
        });

        // 17. Register remaining tasks with Timer Manager
        if (window.ZDTimerManager) {
            // Safety repaint every 5s just to never look stale
            ZDTimerManager.register({
                id: 'safety-repaint',
                intervalMs: 5_000,
                fn: () => {
                    fastRefreshToolbarNoNetwork();
                    refreshToolbarTimerFromSchedule();
                }
            });

            // Midnight UTC watcher - every 60s
            ZDTimerManager.register({
                id: 'midnight-watcher',
                intervalMs: 60_000,
                fn: async () => {
                    if (window.ZDStorage && ZDStorage.rollDailyIfNeeded) {
                        await ZDStorage.rollDailyIfNeeded();
                        fastRefreshToolbarNoNetwork();
                        refreshToolbarTimerFromSchedule();
                        if (statsOverlayEl && statsOverlayEl.style.display === 'flex') {
                            await renderStatsOverlay();
                        }
                    }
                }
            });

            // Start the timer manager
            ZDTimerManager.start();
        }

    }

    // Run init once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
