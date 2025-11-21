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
        const translateBtn = await makeIconButton('🌐', 'translate', 'Translator', async () => {
            await openTranslatePanel();
        });
        const aiBtn = await makeIconButton('🤖', 'ai', 'AI Copilot', async () => {
            await openAIPanel();
        });
        const linearBtn = await makeIconButton('⚡', 'linear', 'Search Linear Issues', async () => {
            if (window.ZDLinearPanel && window.ZDLinearPanel.toggleLinearPanel) {
                await window.ZDLinearPanel.toggleLinearPanel();
            }
        });

        // Store button references for toggling
        translateBtn.dataset.featureId = 'translator';
        aiBtn.dataset.featureId = 'ai';
        linearBtn.dataset.featureId = 'linear';
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
        iconGroup.appendChild(translateBtn);
        iconGroup.appendChild(aiBtn);
        iconGroup.appendChild(linearBtn);

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
                if (featureId === 'translator' && !cfg.showTranslator) shouldShow = false;
                if (featureId === 'ai' && !cfg.showAICopilot) shouldShow = false;
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
        await populateSettingsForm();
        settingsOverlayEl.style.display = 'flex';
    }

    function closeSettings() {
        if (settingsOverlayEl) {
            settingsOverlayEl.style.display = 'none';
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

    function openAPIKeyHelp() {
        // This opens Google AI Studio where the agent can get a free API key.
        const helpURL = 'https://aistudio.google.com/app/apikey';
        window.ZDNotifyUtils.info(
            'Get your free API key',
            "We'll open Google AI Studio in a new tab. Create a free API key and paste it in Settings to enable AI Copilot."
        );
        window.open(helpURL, '_blank', 'noopener');
    }

    function openLinearAPIKeyHelp() {
        // This opens Linear API settings where the agent can create an API key.
        const helpURL = 'https://linear.app/settings/api';
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
                            <div class="zd-settings-row">
                                <label>Pre-shift warning</label>
                                <div class="zd-input-with-unit">
                                    <input type="number" min="1" class="cfg-preShiftWarningMinutes" placeholder="15" />
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
                                <input type="checkbox" class="cfg-showTranslator" />
                                <span>${window.ZDIcons ? window.ZDIcons.getIconHTML('translate', 14) : '🌐'} Translator</span>
                            </label>

                            <label class="zd-setting-check">
                                <input type="checkbox" class="cfg-showAICopilot" />
                                <span>${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 14) : '🤖'} AI Copilot</span>
                            </label>

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
                </div>

                <div class="zd-settings-col">
                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>AI Copilot</h3>
                        </div>

                        <div class="zd-setting-group">
                            <div class="zd-settings-row">
                                <label>Gemini API Key</label>
                                <input type="text" class="cfg-aiApiKey" placeholder="AIza..." />
                            </div>

                            <div class="zd-settings-hint-row">
                                <span class="zd-hint-link zd-hint-apikey">${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 14) : '🤖'} Get free API key</span>
                            </div>
                        </div>
                    </section>

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
                            <p class="zd-section-desc">Customize your look</p>
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
                                </div>
                            </div>
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

        // API key help deep link
        panel.querySelector('.zd-hint-apikey')
            .addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openAPIKeyHelp();
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

        panel.querySelector('.cfg-preShiftWarningMinutes').value =
            cfg.preShiftWarningMinutes || 5;

        panel.querySelector('.cfg-calendarURL').value =
            cfg.calendarURL || '';

        panel.querySelector('.cfg-aiApiKey').value =
            cfg.aiApiKey || '';

        panel.querySelector('.cfg-linearApiKey').value =
            cfg.linearApiKey || '';

        const selectEl = panel.querySelector('.cfg-weekStartsOn');
        selectEl.value = cfg.weekStartsOn || 'Mon';

        // Toolbar customization checkboxes (default true)
        panel.querySelector('.cfg-showTranslator').checked =
            cfg.showTranslator === false ? false : true;
        panel.querySelector('.cfg-showAICopilot').checked =
            cfg.showAICopilot === false ? false : true;
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

        const newCfg = {
            showPercentages: panel.querySelector('.cfg-showPercentages').checked,
            showShiftReminders: panel.querySelector('.cfg-showShiftReminders').checked,
            playReminderSound: panel.querySelector('.cfg-playReminderSound').checked,
            showShiftTimer: panel.querySelector('.cfg-showShiftTimer').checked,
            devMode: panel.querySelector('.cfg-devMode').checked,

            goalChatsPerHour:
                Number(panel.querySelector('.cfg-goalChatsPerHour').value) || 0,
            goalTicketsPerHour:
                Number(panel.querySelector('.cfg-goalTicketsPerHour').value) || 0,

            preShiftWarningMinutes:
                Number(panel.querySelector('.cfg-preShiftWarningMinutes').value) || 5,

            weekStartsOn: panel.querySelector('.cfg-weekStartsOn').value || 'Mon',
            calendarURL: calVal,
            aiApiKey: panel.querySelector('.cfg-aiApiKey').value.trim(),
            linearApiKey: panel.querySelector('.cfg-linearApiKey').value.trim(),

            // Toolbar customization
            showTranslator: panel.querySelector('.cfg-showTranslator').checked,
            showAICopilot: panel.querySelector('.cfg-showAICopilot').checked,
            showLinear: panel.querySelector('.cfg-showLinear').checked,
            showNotes: panel.querySelector('.cfg-showNotes').checked,
            showStats: panel.querySelector('.cfg-showStats').checked,

            // once you open settings, consider calendar "onboarded"
            onboardedCalendar: true
        };

        await ZDStorage.setConfig(newCfg);
    }

    // ------------------------------------------------------------
    // 10. SCHEDULE MODAL (📅 in toolbar)
    // ------------------------------------------------------------

    async function openScheduleFast() {
        // create overlay if first time
        if (!scheduleOverlayEl) {
            scheduleOverlayEl = buildScheduleOverlay();
            document.body.appendChild(scheduleOverlayEl);
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
                        alt="Festive stats"
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

        if (entry.ticketId) {
            actionText += ` — Ticket ${entry.ticketId}`;
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

            return `
                <div class="${highlightClass}">
                    <div>${r.dayLabel}</div>
                    <div>${chats}</div>
                    <div>${tickets}</div>
                    <div><strong>${total}</strong></div>
                    <div>
                        <button class="zd-week-download-btn" data-date="${r.key}" title="Download notes for ${r.dayLabel}">
                            📥
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
                <button class="zd-week-notes-btn">📥 Download Week Notes</button>
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

                        weekRows += `
                            <div class="${rowClass}">
                                <div>${dayName}</div>
                                <div>0</div>
                                <div>0</div>
                                <div><strong>0</strong></div>
                                <div>
                                    <button class="zd-week-download-btn" data-date="" title="Download notes">
                                        📥
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
                            <button class="zd-week-notes-btn">📥 Download Week Notes</button>
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
    // 14. TRANSLATION SYSTEM
    // ------------------------------------------------------------

    // Translate text using Lingva Translate (Google Translate frontend)
    async function translateText(text, targetLang, sourceLang = 'auto') {
        if (!text || text.trim() === '') return '';

        try {
            // Limit text length to avoid issues
            const maxLength = 1000;
            const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

            const encodedText = encodeURIComponent(truncatedText);
            const source = sourceLang === 'auto' ? 'auto' : sourceLang;

            const url = `https://lingva.ml/api/v1/${source}/${targetLang}/${encodedText}`;

            const response = await fetch(url);

            if (!response.ok) {
                console.error('[Translator] HTTP error:', response.status);
                return 'Translation service unavailable. Please try again.';
            }

            const data = await response.json();

            if (data && data.translation) {
                return data.translation;
            } else {
                console.error('[Translator] No translation in response:', data);
                return 'Translation error. Please try again.';
            }
        } catch (err) {
            console.error('[Translator] Error:', err);
            return 'Translation failed. Check your connection.';
        }
    }

    // Open translation panel
    async function openTranslatePanel() {
        // Check if panel already exists
        let panel = document.querySelector('.zd-translate-panel');
        if (panel) {
            // Toggle visibility
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
            return;
        }

        // Get saved target language preference
        const savedLang = localStorage.getItem('zd-translate-target') || 'en';

        // Create panel
        panel = document.createElement('div');
        panel.className = 'zd-translate-panel';
        panel.innerHTML = `
            <div class="zd-translate-header">
                <h3 class="zd-translate-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('translate', 18) : '🌐'} Translator</h3>
                <button class="zd-translate-close-btn" title="Close">×</button>
            </div>
            <div class="zd-translate-content">
                <div class="zd-translate-section">
                    <div class="zd-translate-label">Source Text (Auto-detect)</div>
                    <textarea class="zd-translate-source" placeholder="Paste or type text here to translate..."></textarea>
                </div>
                <div class="zd-translate-controls">
                    <label class="zd-translate-lang-label">
                        Translate to:
                        <select class="zd-translate-lang-select">
                            <option value="en">English</option>
                            <option value="es">Spanish</option>
                            <option value="pt">Portuguese</option>
                            <option value="fr">French</option>
                            <option value="de">German</option>
                            <option value="it">Italian</option>
                            <option value="nl">Dutch</option>
                            <option value="ru">Russian</option>
                            <option value="zh">Chinese</option>
                            <option value="ja">Japanese</option>
                            <option value="ko">Korean</option>
                            <option value="ar">Arabic</option>
                        </select>
                    </label>
                </div>
                <div class="zd-translate-section">
                    <div class="zd-translate-label">
                        Translation
                        <button class="zd-translate-copy-btn" title="Copy translation">📋</button>
                    </div>
                    <textarea class="zd-translate-target" placeholder="Translation will appear here..." readonly></textarea>
                </div>
            </div>
            <div class="zd-translate-footer">
                <span class="zd-translate-status">Ready to translate</span>
                <span class="zd-translate-powered">Powered by Google Translate</span>
            </div>
        `;

        document.body.appendChild(panel);

        const sourceTextarea = panel.querySelector('.zd-translate-source');
        const targetTextarea = panel.querySelector('.zd-translate-target');
        const langSelect = panel.querySelector('.zd-translate-lang-select');
        const closeBtn = panel.querySelector('.zd-translate-close-btn');
        const copyBtn = panel.querySelector('.zd-translate-copy-btn');
        const statusEl = panel.querySelector('.zd-translate-status');

        // Set saved language
        langSelect.value = savedLang;

        // Auto-translate with debounce
        let translateTimeout;
        async function performTranslation() {
            const sourceText = sourceTextarea.value;
            const targetLang = langSelect.value;

            if (!sourceText || sourceText.trim() === '') {
                targetTextarea.value = '';
                statusEl.textContent = 'Ready to translate';
                return;
            }

            statusEl.textContent = 'Translating...';

            const translation = await translateText(sourceText, targetLang);
            targetTextarea.value = translation;

            statusEl.textContent = 'Translation complete';
        }

        sourceTextarea.addEventListener('input', () => {
            clearTimeout(translateTimeout);
            translateTimeout = setTimeout(performTranslation, 800);
        });

        langSelect.addEventListener('change', () => {
            localStorage.setItem('zd-translate-target', langSelect.value);
            if (sourceTextarea.value.trim()) {
                performTranslation();
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Copy button
        copyBtn.addEventListener('click', () => {
            const translation = targetTextarea.value;
            if (translation && translation.trim()) {
                navigator.clipboard.writeText(translation).then(() => {
                    statusEl.textContent = 'Translation copied!';
                    setTimeout(() => {
                        statusEl.textContent = 'Ready to translate';
                    }, 2000);
                }).catch((err) => {
                    console.error('[Clipboard] Copy failed:', err);
                    statusEl.textContent = 'Copy failed - try again';
                    setTimeout(() => {
                        statusEl.textContent = 'Ready to translate';
                    }, 2000);
                });
            }
        });

        // Apply theme
        await applyThemeToDOM();
    }

    // ------------------------------------------------------------
    // 15. AI COPILOT SYSTEM
    // ------------------------------------------------------------

    let aiChatHistory = [];

    // Show AI setup modal when no API key is configured
    function showAISetupModal() {
        // Check if AI setup modal already exists
        const existingModal = document.querySelector('.zd-ai-setup-modal');
        if (existingModal) {
            // Don't create another one
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-ai-setup-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-log-panel';
        panel.style.width = '480px';
        panel.style.maxWidth = '90vw';

        panel.innerHTML = `
            <h2 class="zd-log-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 20) : '🤖'} AI Copilot Setup</h2>

            <div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: var(--zd-text);">
                <p style="margin: 0 0 16px 0;">
                    Get a free Google Gemini API key to enable AI assistance for your support work.
                </p>

                <div style="background: var(--zd-bg-secondary); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--zd-accent);">
                        Quick Setup
                    </div>
                    <ol style="margin: 0; padding-left: 18px; line-height: 1.8; color: var(--zd-text-secondary);">
                        <li>Click "Get API Key" below to visit Google AI Studio</li>
                        <li>Sign in and click "Create API Key"</li>
                        <li>Copy your key (starts with "AIza...")</li>
                        <li>Click "Configure" and paste it in Settings</li>
                    </ol>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px;">
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">${window.ZDIcons ? window.ZDIcons.getIconHTML('check', 18) : '✓'}</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">100% Free</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">${window.ZDIcons ? window.ZDIcons.getIconHTML('lightning', 18) : '⚡'}</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">60 req/min</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">${window.ZDIcons ? window.ZDIcons.getIconHTML('lock', 18) : '🔒'}</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">No card</div>
                    </div>
                </div>
            </div>

            <div class="zd-log-footer">
                <button class="zd-ai-setup-close-btn">Cancel</button>
                <button class="zd-ai-setup-get-key-btn" style="background: var(--zd-accent-green);">Get API Key</button>
                <button class="zd-ai-setup-settings-btn">Configure</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Get API key button
        overlay.querySelector('.zd-ai-setup-get-key-btn').addEventListener('click', () => {
            window.open('https://aistudio.google.com/app/apikey', '_blank');
        });

        // Open settings button
        overlay.querySelector('.zd-ai-setup-settings-btn').addEventListener('click', () => {
            overlay.remove();
            openSettingsPanel();
        });

        // Close button
        overlay.querySelector('.zd-ai-setup-close-btn').addEventListener('click', () => {
            overlay.remove();
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // Call AI API via background service worker
    async function callDuckDuckGoAI(userMessage) {
        try {
            // Get API key from config
            const cfg = await ZDStorage.getConfig();

            // Send message to background worker to make API call
            const response = await chrome.runtime.sendMessage({
                type: 'AI_CHAT',
                message: userMessage,
                history: aiChatHistory,
                apiKey: cfg.aiApiKey
            });

            if (response.success) {
                const aiResponse = response.response;

                // Add to history
                aiChatHistory.push({ role: 'user', content: userMessage });
                aiChatHistory.push({ role: 'assistant', content: aiResponse });

                // Keep history limited to last 10 messages (5 exchanges)
                if (aiChatHistory.length > 10) {
                    aiChatHistory = aiChatHistory.slice(-10);
                }

                return aiResponse;
            } else {
                console.error('[AI Copilot] Error from background:', response.error);
                return response.error || 'Sorry, the AI service is unavailable right now. Please try again later.';
            }
        } catch (err) {
            console.error('[AI Copilot] Error:', err);
            return 'An error occurred. Please check your connection and try again.';
        }
    }

    // Open AI Copilot panel
    async function openAIPanel() {
        // Check if API key is configured
        const cfg = await ZDStorage.getConfig();
        if (!cfg.aiApiKey || cfg.aiApiKey.trim() === '') {
            // Show setup modal
            showAISetupModal();
            return;
        }

        // Check if panel already exists
        let panel = document.querySelector('.zd-ai-panel');
        if (panel) {
            // Toggle visibility
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
            return;
        }

        // Create panel
        panel = document.createElement('div');
        panel.className = 'zd-ai-panel';
        panel.innerHTML = `
            <div class="zd-ai-header">
                <h3 class="zd-ai-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 18) : '🤖'} AI Copilot</h3>
                <div class="zd-ai-header-buttons">
                    <button class="zd-ai-clear-btn" title="Clear chat">Clear</button>
                    <button class="zd-ai-close-btn" title="Close">×</button>
                </div>
            </div>
            <div class="zd-ai-chat-container">
            </div>
            <div class="zd-ai-input-area">
                <textarea class="zd-ai-input" placeholder="Ask me anything..." rows="1"></textarea>
                <button class="zd-ai-send-btn">Send</button>
            </div>
            <div class="zd-ai-footer">
                <span class="zd-ai-status">Ready</span>
                <span class="zd-ai-powered">Powered by Google Gemini</span>
            </div>
        `;

        document.body.appendChild(panel);

        const chatContainer = panel.querySelector('.zd-ai-chat-container');
        const inputTextarea = panel.querySelector('.zd-ai-input');
        const sendBtn = panel.querySelector('.zd-ai-send-btn');
        const closeBtn = panel.querySelector('.zd-ai-close-btn');
        const clearBtn = panel.querySelector('.zd-ai-clear-btn');
        const statusEl = panel.querySelector('.zd-ai-status');

        // Add welcome message
        addAIMessage('assistant', '👋 Hi! I\'m your AI assistant. I can help you with:\n\n• Troubleshooting customer issues\n• Drafting professional responses\n• Answering technical questions\n• Explaining concepts\n\nHow can I help you today?');

        // Helper to strip markdown formatting
        function stripMarkdown(text) {
            return text
                .replace(/\*\*(.+?)\*\*/g, '$1')  // Remove bold **text**
                .replace(/\*(.+?)\*/g, '$1')      // Remove italic *text*
                .replace(/__(.+?)__/g, '$1')      // Remove bold __text__
                .replace(/_(.+?)_/g, '$1')        // Remove italic _text_
                .replace(/`(.+?)`/g, '$1')        // Remove inline code `text`
                .replace(/~~(.+?)~~/g, '$1');     // Remove strikethrough ~~text~~
        }

        // Helper to add message to chat
        function addAIMessage(role, content) {
            const msgEl = document.createElement('div');
            msgEl.className = `zd-ai-message ${role}`;

            // Strip markdown from content
            const displayContent = stripMarkdown(content);

            msgEl.innerHTML = `
                <div class="zd-ai-message-role">${role === 'user' ? 'You' : 'AI'}</div>
                <div class="zd-ai-message-content">${escapeHtml(displayContent)}</div>
                ${role === 'assistant' ? '<button class="zd-ai-copy-btn" title="Copy message">Copy</button>' : ''}
            `;

            chatContainer.appendChild(msgEl);

            // Add copy button event listener if it's an assistant message
            if (role === 'assistant') {
                const copyBtn = msgEl.querySelector('.zd-ai-copy-btn');
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(displayContent.replace(/<br>/g, '\n')).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                        }, 2000);
                    }).catch((err) => {
                        console.error('[Clipboard] Copy failed:', err);
                        copyBtn.textContent = 'Failed';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                        }, 2000);
                    });
                });
            }

            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Helper to escape HTML
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/\n/g, '<br>');
        }

        // Send message function
        async function sendMessage() {
            const message = inputTextarea.value.trim();
            if (!message) return;

            // Add user message to UI
            addAIMessage('user', message);

            // Clear input
            inputTextarea.value = '';
            inputTextarea.style.height = 'auto';

            // Show loading
            statusEl.textContent = 'Thinking...';
            sendBtn.disabled = true;

            // Get AI response
            const aiResponse = await callDuckDuckGoAI(message);

            // Add AI response to UI
            addAIMessage('assistant', aiResponse);

            // Reset status
            statusEl.textContent = 'Ready';
            sendBtn.disabled = false;
            inputTextarea.focus();
        }

        // Send button click
        sendBtn.addEventListener('click', sendMessage);

        // Enter to send (Shift+Enter for new line)
        inputTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Auto-resize textarea
        inputTextarea.addEventListener('input', () => {
            inputTextarea.style.height = 'auto';
            inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Clear chat button
        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all chat history?')) {
                aiChatHistory = [];
                chatContainer.innerHTML = '';
                addAIMessage('assistant', 'Chat cleared. How can I help you?');
            }
        });

        // Apply theme
        await applyThemeToDOM();
    }

    // ------------------------------------------------------------
    // 16. MODE SWITCH (Chats <> Tickets pill)
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

        // increment visible counter
        await ZDStorage.incCount(which, 1, {
            source: 'auto-resolution',
            ticketId: getTicketIdFromURL() || null
        });

        fastRefreshToolbarNoNetwork();
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
