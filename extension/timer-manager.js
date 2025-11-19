// Unified timer manager to consolidate all intervals and reduce CPU/battery usage

(function () {
    'use strict';

    // Registered tasks
    const tasks = [];

    // Main loop state
    let mainLoopId = null;
    let isRunning = false;

    // Main loop interval (1 second for precise timing)
    const TICK_INTERVAL = 1000;

    /**
     * Register a task to run at specified interval
     * @param {Object} options - Task options
     * @param {string} options.id - Unique task identifier
     * @param {Function} options.fn - Function to execute (can be async)
     * @param {number} options.intervalMs - Interval in milliseconds
     * @param {boolean} [options.immediate=false] - Run immediately on registration
     */
    function register(options) {
        const { id, fn, intervalMs, immediate = false } = options;

        // Remove existing task with same ID
        unregister(id);

        const task = {
            id,
            fn,
            intervalMs,
            lastRun: immediate ? 0 : Date.now()
        };

        tasks.push(task);

        // Run immediately if requested
        if (immediate && isRunning) {
            runTask(task);
        }
    }

    /**
     * Unregister a task by ID
     * @param {string} id - Task identifier
     */
    function unregister(id) {
        const idx = tasks.findIndex(t => t.id === id);
        if (idx > -1) {
            tasks.splice(idx, 1);
        }
    }

    /**
     * Run a single task with error handling
     * @param {Object} task - Task to run
     */
    async function runTask(task) {
        try {
            await task.fn();
        } catch (err) {
            console.error(`[TimerManager] Task "${task.id}" failed:`, err);
        }
        task.lastRun = Date.now();
    }

    /**
     * Main loop - checks all tasks and runs those due
     */
    async function mainLoop() {
        const now = Date.now();

        for (const task of tasks) {
            if (now - task.lastRun >= task.intervalMs) {
                await runTask(task);
            }
        }
    }

    /**
     * Start the timer manager
     */
    function start() {
        if (isRunning) return;

        isRunning = true;
        mainLoopId = setInterval(mainLoop, TICK_INTERVAL);

        // Run first tick immediately
        mainLoop();
    }

    /**
     * Stop the timer manager
     */
    function stop() {
        if (!isRunning) return;

        isRunning = false;
        if (mainLoopId) {
            clearInterval(mainLoopId);
            mainLoopId = null;
        }
    }

    /**
     * Get all registered tasks (for debugging)
     * @returns {Array} List of tasks
     */
    function getTasks() {
        return tasks.map(t => ({
            id: t.id,
            intervalMs: t.intervalMs,
            lastRun: t.lastRun
        }));
    }

    /**
     * Clear all tasks
     */
    function clear() {
        tasks.length = 0;
    }

    /**
     * Initialize with common extension tasks
     * This replaces all the setInterval calls in content.js
     */
    function initDefaultTasks() {
        // Schedule cache refresh - every 60s
        register({
            id: 'schedule-refresh',
            intervalMs: 60_000,
            fn: async () => {
                if (window.ZDSchedule && window.ZDSchedule.refreshScheduleCache) {
                    await window.ZDSchedule.refreshScheduleCache(false);
                }
                // Emit event for toolbar refresh
                if (window.ZDEvents) {
                    window.ZDEvents.emit(window.ZDEvents.EVENTS.TOOLBAR_REFRESH);
                    window.ZDEvents.emit(window.ZDEvents.EVENTS.TIMER_TICK);
                }
            }
        });

        // Auto-mode enforcer - every 5s
        register({
            id: 'auto-mode-enforcer',
            intervalMs: 5_000,
            fn: () => {
                // This will be handled by content.js via event
                if (window.ZDEvents) {
                    window.ZDEvents.emit('timer:autoModeCheck');
                }
            }
        });

        // Midnight UTC watcher - every 60s
        register({
            id: 'midnight-watcher',
            intervalMs: 60_000,
            fn: async () => {
                if (window.ZDStorage && window.ZDStorage.rollDailyIfNeeded) {
                    await window.ZDStorage.rollDailyIfNeeded();
                    if (window.ZDEvents) {
                        window.ZDEvents.emit(window.ZDEvents.EVENTS.TOOLBAR_REFRESH);
                    }
                }
            }
        });

        // Notes reminders - every 60s
        register({
            id: 'notes-day-reminder',
            intervalMs: 60_000,
            fn: async () => {
                if (window.ZDNotes && window.ZDNotes.checkEndOfDayNotesReminder) {
                    await window.ZDNotes.checkEndOfDayNotesReminder();
                }
            }
        });

        register({
            id: 'notes-week-reminder',
            intervalMs: 60_000,
            fn: async () => {
                if (window.ZDNotes && window.ZDNotes.checkEndOfWeekReminder) {
                    await window.ZDNotes.checkEndOfWeekReminder();
                }
            }
        });
    }

    // Public API
    window.ZDTimerManager = {
        register,
        unregister,
        start,
        stop,
        getTasks,
        clear,
        initDefaultTasks
    };
})();
