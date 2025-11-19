// Data persistence layer: counters, config, history, backup/restore

(function () {
    const { STORAGE_KEYS, DEFAULT_CONFIG } = window.ZDConstants;
    const { formatMDYSlash } = window.ZDUtils;
    const { withErrorHandling, sanitizeInput, logError, ErrorLevel, ErrorCategory } = window.ZDErrorHandler || {};
    const { LIMITS, SCHEMAS } = window.ZDConfig || {};

    // Config cache to reduce storage reads
    let configCache = null;
    let configCacheTime = 0;
    const CONFIG_CACHE_TTL = 5000; // 5 seconds

    // Counts cache to reduce storage reads
    let countsCache = null;
    let countsCacheTime = 0;
    const COUNTS_CACHE_TTL = 1000; // 1 second (shorter for frequently changing data)

    // Chrome storage wrappers with error handling and retry

    function getSync(key) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.sync.get([key], (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(result[key]);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function setSync(key, value) {
        return new Promise((resolve, reject) => {
            try {
                const obj = {};
                obj[key] = value;
                chrome.storage.sync.set(obj, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function getLocal(key) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get([key], (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(result[key]);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function setLocal(key, value) {
        return new Promise((resolve, reject) => {
            try {
                const obj = {};
                obj[key] = value;
                chrome.storage.local.set(obj, () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    // Read all sync storage data
    function _readAllSync() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(null, (all) => {
                resolve(all || {});
            });
        });
    }

    // Sync individual count keys with aggregate counts object
    async function _mirrorCountsAggregate() {
        const { chats, tickets } = await getCounts();
        await new Promise((resolve) => {
            chrome.storage.sync.set({ counts: { chats, tickets } }, resolve);
        });
    }

    // User configuration with validation

    async function getConfig() {
        try {
            // Check cache first
            const now = Date.now();
            if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
                return configCache;
            }

            const cfg = await getSync(STORAGE_KEYS.CONFIG);
            const merged = Object.assign({}, DEFAULT_CONFIG, cfg || {});

            // Sanitize and validate config values
            if (sanitizeInput) {
                merged.calendarURL = sanitizeInput(merged.calendarURL, 'url', {
                    httpsOnly: true,
                    default: ''
                });

                merged.goalChatsPerHour = sanitizeInput(merged.goalChatsPerHour, 'number', {
                    min: LIMITS?.MIN_GOAL_VALUE || 1,
                    max: LIMITS?.MAX_GOAL_VALUE || 100,
                    default: DEFAULT_CONFIG.goalChatsPerHour
                });

                merged.goalTicketsPerHour = sanitizeInput(merged.goalTicketsPerHour, 'number', {
                    min: LIMITS?.MIN_GOAL_VALUE || 1,
                    max: LIMITS?.MAX_GOAL_VALUE || 100,
                    default: DEFAULT_CONFIG.goalTicketsPerHour
                });

                merged.preShiftWarningMinutes = sanitizeInput(merged.preShiftWarningMinutes, 'number', {
                    min: LIMITS?.MIN_WARNING_MINUTES || 1,
                    max: LIMITS?.MAX_WARNING_MINUTES || 60,
                    default: DEFAULT_CONFIG.preShiftWarningMinutes
                });
            }

            // Update cache
            configCache = merged;
            configCacheTime = now;

            return merged;
        } catch (error) {
            if (logError) {
                logError(error, {
                    level: ErrorLevel.ERROR,
                    category: ErrorCategory.STORAGE,
                    data: { operation: 'getConfig' }
                });
            }
            // Return safe defaults on error
            return { ...DEFAULT_CONFIG };
        }
    }

    async function setConfig(partialConfig) {
        try {
            const current = await getConfig();
            const updated = Object.assign({}, current, partialConfig);

            // Validate before saving
            if (SCHEMAS?.isValidConfig && !SCHEMAS.isValidConfig(updated)) {
                throw new Error('Invalid config structure');
            }

            await setSync(STORAGE_KEYS.CONFIG, updated);

            // Update cache with new config
            configCache = updated;
            configCacheTime = Date.now();

            return updated;
        } catch (error) {
            if (logError) {
                logError(error, {
                    level: ErrorLevel.ERROR,
                    category: ErrorCategory.STORAGE,
                    data: { operation: 'setConfig' }
                });
            }
            throw error;
        }
    }

    // Live counter management with validation

    async function getCounts() {
        try {
            // Check cache first
            const now = Date.now();
            if (countsCache && (now - countsCacheTime) < COUNTS_CACHE_TTL) {
                return countsCache;
            }

            const [chatCount, ticketCount] = await Promise.all([
                getSync(STORAGE_KEYS.CHAT_COUNT),
                getSync(STORAGE_KEYS.TICKET_COUNT)
            ]);

            // Sanitize counts
            const counts = {
                chats: sanitizeInput ? sanitizeInput(chatCount, 'number', {
                    min: LIMITS?.MIN_COUNT_VALUE || 0,
                    max: LIMITS?.MAX_COUNT_VALUE || 999,
                    default: 0
                }) : (chatCount || 0),
                tickets: sanitizeInput ? sanitizeInput(ticketCount, 'number', {
                    min: LIMITS?.MIN_COUNT_VALUE || 0,
                    max: LIMITS?.MAX_COUNT_VALUE || 999,
                    default: 0
                }) : (ticketCount || 0)
            };

            // Validate structure
            if (SCHEMAS?.isValidCounts && !SCHEMAS.isValidCounts(counts)) {
                throw new Error('Invalid counts structure');
            }

            // Update cache
            countsCache = counts;
            countsCacheTime = now;

            return counts;
        } catch (error) {
            if (logError) {
                logError(error, {
                    level: ErrorLevel.ERROR,
                    category: ErrorCategory.STORAGE,
                    data: { operation: 'getCounts' }
                });
            }
            // Return safe defaults
            return { chats: 0, tickets: 0 };
        }
    }

    async function setCount(type, value) {
        try {
            // Validate and sanitize input
            const sanitizedValue = sanitizeInput ? sanitizeInput(value, 'number', {
                min: LIMITS?.MIN_COUNT_VALUE || 0,
                max: LIMITS?.MAX_COUNT_VALUE || 999,
                default: 0
            }) : Math.max(0, Math.min(999, value || 0));

            const key = type === 'chats' ? STORAGE_KEYS.CHAT_COUNT : STORAGE_KEYS.TICKET_COUNT;
            await setSync(key, sanitizedValue);

            // Invalidate counts cache
            countsCache = null;
            countsCacheTime = 0;

            await _mirrorCountsAggregate();
        } catch (error) {
            if (logError) {
                logError(error, {
                    level: ErrorLevel.ERROR,
                    category: ErrorCategory.STORAGE,
                    data: { operation: 'setCount', type, value }
                });
            }
            throw error;
        }
    }


    // Increment counter and log activity
    async function incCount(type, amount = 1, meta = {}) {
        const counts = await getCounts();

        counts[type] = (counts[type] || 0) + amount;
        if (counts[type] < 0) counts[type] = 0;

        await setCount(type, counts[type]);

        // Legacy log for backwards compatibility
        await appendLog(type, amount);

        // Rich activity timeline
        await appendActivityLog({
            timeISO: new Date().toISOString(),
            mode: type,
            source: meta.source || "unknown",
            delta: amount,
            newValue: counts[type],
            ticketId: meta.ticketId || null
        });
        await _mirrorCountsAggregate();

        // Sync today's counts to dailyHistory so stats table shows live data
        const todayKey = getLocalDayKey(new Date());
        const hist = await getDailyHistory();
        if (!hist[todayKey]) {
            hist[todayKey] = { chats: 0, tickets: 0, chatHours: 0, ticketHours: 0 };
        }
        hist[todayKey].chats = counts.chats || 0;
        hist[todayKey].tickets = counts.tickets || 0;
        await new Promise((resolve) => {
            chrome.storage.sync.set({ dailyHistory: hist }, resolve);
        });

        return counts[type];
    }

    // Reset counters to zero
    async function resetCounts() {
        await setSync(STORAGE_KEYS.CHAT_COUNT, 0);
        await setSync(STORAGE_KEYS.TICKET_COUNT, 0);

        // Invalidate counts cache
        countsCache = null;
        countsCacheTime = 0;

        await new Promise((resolve) => {
            chrome.storage.sync.set(
                {
                    counts: { chats: 0, tickets: 0 }
                },
                resolve
            );
        });
    }

    // Legacy daily logs

    async function getLogs() {
        const logs = await getLocal(STORAGE_KEYS.LOGS);
        return logs || {};
    }

    async function saveLogs(logs) {
        await setLocal(STORAGE_KEYS.LOGS, logs);
    }

    // Append simple log entry
    async function appendLog(type, delta = 1) {
        if (delta <= 0) return;
        const logs = await getLogs();
        const today = formatMDYSlash(new Date());
        if (!logs[today]) logs[today] = [];
        logs[today].push({
            time: new Date().toISOString(),
            type,
            delta
        });
        await saveLogs(logs);
    }

    async function getTodayLogs() {
        const logs = await getLogs();
        const today = formatMDYSlash(new Date());
        return logs[today] || [];
    }

    async function clearLogs() {
        await setLocal(STORAGE_KEYS.LOGS, {});
    }

    // Theme and toolbar position

    async function getTheme() {
        const val = await getSync(STORAGE_KEYS.THEME);
        return val || 'light';
    }

    async function setTheme(theme) {
        await setSync(STORAGE_KEYS.THEME, theme);
    }

    async function getBarPosition() {
        const pos = await getSync(STORAGE_KEYS.POSITION);
        return pos || { top: 10, left: 10 };
    }

    async function setBarPosition(pos) {
        await setSync(STORAGE_KEYS.POSITION, pos);
    }

    // Backup and restore

    async function backupAll() {
        const cfg = await getConfig();
        const logs = await getLogs();
        const counts = await getCounts();
        return {
            backupTime: new Date().toISOString(),
            config: cfg,
            logs: logs,
            counts: counts
        };
    }

    async function restoreBackup(data) {
        if (!data) return;
        if (data.config) await setConfig(data.config);
        if (data.logs) await saveLogs(data.logs);
        if (data.counts) {
            await setSync(STORAGE_KEYS.CHAT_COUNT, data.counts.chats || 0);
            await setSync(STORAGE_KEYS.TICKET_COUNT, data.counts.tickets || 0);
        }
    }

    // Clear all data (dev/debug only)
    async function clearAll() {
        await Promise.all([
            resetCounts(),
            clearLogs(),
            setSync(STORAGE_KEYS.CONFIG, DEFAULT_CONFIG),
            setLocal(STORAGE_KEYS.ACTIVITY_LOG, {}),
            // Also clear dailyHistory so weekly stats reset
            new Promise((resolve) => {
                chrome.storage.sync.set({ dailyHistory: {} }, resolve);
            })
        ]);
    }



    // Daily rollover and history
    // Tracks counts per UTC day, archives to dailyHistory on day change

    // Get local date key "YYYY-MM-DD"
    function getLocalDayKey(dateObj = new Date()) {
        const y = dateObj.getFullYear();
        const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const d = dateObj.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Get UTC date key "YYYY-MM-DD"
    function getUTCDayKey(dateObj = new Date()) {
        const y = dateObj.getUTCFullYear();
        const m = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
        const d = dateObj.getUTCDate().toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Convert UTC date key to local date key
    function utcKeyToLocalKey(utcKey) {
    const [y, m, d] = utcKey.split('-').map(n => parseInt(n, 10));
    const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return getLocalDayKey(utcDate);
}


    // Check if day changed and rollover if needed
    async function rollDailyIfNeeded() {
        const all = await _readAllSync();
        const todayKeyUTC = getUTCDayKey(new Date());
        const lastActiveDayUTC = all.lastActiveDayUTC;

        const liveCounts = await getCounts();

        // First run: initialize baseline
        if (!lastActiveDayUTC) {
            await new Promise((resolve) => {
                chrome.storage.sync.set(
                    {
                        lastActiveDayUTC: todayKeyUTC,
                        counts: liveCounts
                    },
                    resolve
                );
            });
            return;
        }

        // Same day: no action needed
        if (lastActiveDayUTC === todayKeyUTC) {
            return;
        }

        // New day detected: archive and reset
        await forceNewDayReset();
    }

    // Force new day rollover: archive counts and reset
    async function forceNewDayReset() {
        const all = await _readAllSync();

        const prevDayUTC = all.lastActiveDayUTC || getUTCDayKey(new Date());
        const prevDayLocal = utcKeyToLocalKey(prevDayUTC);

        const liveCounts = await getCounts();

        const cfg = await getConfig();
        const chatHoursForPrev   = cfg.lastDayChatHours   || 0;
        const ticketHoursForPrev = cfg.lastDayTicketHours || 0;

        // Archive previous day to history
        const hist = all.dailyHistory || {};

        console.log('[ZDCounter] Before archiving - dailyHistory keys:', Object.keys(hist));

        hist[prevDayLocal] = {
            chats: liveCounts.chats || 0,
            tickets: liveCounts.tickets || 0,
            chatHours: chatHoursForPrev,
            ticketHours: ticketHoursForPrev
        };

        console.log('[ZDCounter] After archiving - dailyHistory keys:', Object.keys(hist));
        console.log('[ZDCounter] Archived data for', prevDayLocal, ':', hist[prevDayLocal]);

        // Reset counters
        const newCounts = { chats: 0, tickets: 0 };

        // Advance to current UTC day
        const newActiveUTC = getUTCDayKey(new Date());

        await new Promise((resolve) => {
            chrome.storage.sync.set(
                {
                    dailyHistory: hist,
                    counts: newCounts,
                    lastActiveDayUTC: newActiveUTC,
                    [STORAGE_KEYS.CHAT_COUNT]: 0,
                    [STORAGE_KEYS.TICKET_COUNT]: 0
                },
                resolve
            );
        });

        console.log(
            `[ZDCounter] New day rollover: archived ${prevDayUTC} → local ${prevDayLocal}, now active=${newActiveUTC}`
        );

        return newActiveUTC;
    }

// Archive today's counts without resetting (for testing)
async function simulateArchiveOnly() {
    const all = await _readAllSync();

    const activeUTC = all.lastActiveDayUTC || getUTCDayKey(new Date());
    const localKey  = utcKeyToLocalKey(activeUTC);

    const liveCounts = await getCounts();

    const cfg = await getConfig();
    const chatHoursForPrev   = cfg.lastDayChatHours   || 0;
    const ticketHoursForPrev = cfg.lastDayTicketHours || 0;

    const hist = all.dailyHistory || {};
    hist[localKey] = {
        chats: liveCounts.chats || 0,
        tickets: liveCounts.tickets || 0,
        chatHours: chatHoursForPrev,
        ticketHours: ticketHoursForPrev
    };

    await new Promise((resolve) => {
        chrome.storage.sync.set({ dailyHistory: hist }, resolve);
    });

    console.log('[ZDCounter] simulateArchiveOnly → saved', localKey, hist[localKey]);
    return { dayKey: localKey, record: hist[localKey] };
}

    // Get complete daily history
    async function getDailyHistory() {
        const all = await _readAllSync();

        // Initialize dailyHistory if it doesn't exist
        if (!all.dailyHistory) {
            await setSync('dailyHistory', {});
            return {};
        }

        return all.dailyHistory;
    }

    // Save or update single day record
    async function appendDailyHistory(dayKey, record) {
        const hist = await getDailyHistory();
        hist[dayKey] = {
            chats: record.chats || 0,
            tickets: record.tickets || 0,
            chatHours: record.chatHours || 0,
            ticketHours: record.ticketHours || 0
        };
        await setSync('dailyHistory', hist);
    }

    // Version tracking
    async function getVersion() {
        const v = await getSync(STORAGE_KEYS.VERSION);
        return v || '1.0.0';
    }

    async function setVersion(v) {
        await setSync(STORAGE_KEYS.VERSION, v);
    }

    // Activity log: detailed timeline of all counter changes
    // Stored by local date "YYYY-MM-DD" in chrome.storage.local

    async function getActivityLogAll() {
        const logObj = await getLocal(STORAGE_KEYS.ACTIVITY_LOG);
        return logObj || {};
    }

    async function clearActivityLogAll() {
        await setActivityLogAll({});
    }

    async function setActivityLogAll(newLogObj) {
        await setLocal(STORAGE_KEYS.ACTIVITY_LOG, newLogObj || {});
        return newLogObj || {};
    }

    // Add activity entry for today
    async function appendActivityLog(entry) {
        const all = await getActivityLogAll();
        const dayKey = getLocalDayKey(new Date());

        if (!all[dayKey]) {
            all[dayKey] = [];
        }

        all[dayKey].push({
            ...entry,
            ts: Date.now()
        });

        await setActivityLogAll(all);
    }

    // Get today's activity log
    async function getActivityLogToday() {
        const all = await getActivityLogAll();
        const everything = await _readAllSync();
        const activeUTC = everything.lastActiveDayUTC || getUTCDayKey(new Date());
        const activeLocalKey = utcKeyToLocalKey(activeUTC);
        return all[activeLocalKey] || [];
    }

    // Clear today's activity log only
    async function clearActivityLogForToday() {
    const all = await getActivityLogAll();
    const todayLocalKey = getLocalDayKey(new Date());
    if (all[todayLocalKey]) {
        all[todayLocalKey] = [];
        await setActivityLogAll(all);
    }
    }

    // Initialize storage on first load
    async function initializeStorage() {
        const all = await _readAllSync();

        // Initialize dailyHistory if missing
        if (!all.dailyHistory) {
            console.log('[ZDCounter] Initializing dailyHistory');
            await setSync('dailyHistory', {});
        }

        // Initialize lastActiveDayUTC if missing
        if (!all.lastActiveDayUTC) {
            const todayUTC = getUTCDayKey(new Date());
            console.log('[ZDCounter] Initializing lastActiveDayUTC to', todayUTC);
            await setSync('lastActiveDayUTC', todayUTC);
        }

        // Initialize counts if missing
        if (!all.counts) {
            console.log('[ZDCounter] Initializing counts');
            await setSync('counts', { chats: 0, tickets: 0 });
        }
    }


    // Public API

    window.ZDStorage = {
        getConfig,
        setConfig,
        getCounts,
        setCount,
        incCount,
        resetCounts,
        getLogs,
        getTodayLogs,
        appendLog,
        clearLogs,
        getTheme,
        setTheme,
        getBarPosition,
        setBarPosition,
        backupAll,
        restoreBackup,
        clearAll,
        getVersion,
        setVersion,
        rollDailyIfNeeded,
        forceNewDayReset,
        getDailyHistory,
        appendDailyHistory,
        getLocalDayKey,
        getUTCDayKey,
        getActivityLogAll,
        getActivityLogToday,
        appendActivityLog,
        simulateArchiveOnly,
        clearActivityLogAll,
        clearActivityLogForToday,
        initializeStorage
    };
})();
