// Daily notes system with auto-save and reminders

(function () {
    'use strict';

    // Interval IDs for cleanup
    let dayReminderInterval = null;
    let weekReminderInterval = null;

    /**
     * Get today's date key (YYYY-MM-DD)
     * @returns {string} Date key
     */
    function getTodayDateKey() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    /**
     * Get notes for a specific date
     * @param {string} dateKey - Date in YYYY-MM-DD format
     * @returns {Promise<string>} Notes content
     */
    async function getNotesForDate(dateKey) {
        const result = await chrome.storage.local.get([`notes_${dateKey}`]);
        return result[`notes_${dateKey}`] || '';
    }

    /**
     * Save notes for a specific date
     * @param {string} dateKey - Date in YYYY-MM-DD format
     * @param {string} content - Notes content
     */
    async function saveNotesForDate(dateKey, content) {
        await chrome.storage.local.set({ [`notes_${dateKey}`]: content });

        // Emit event for other modules
        if (window.ZDEvents) {
            window.ZDEvents.emit(window.ZDEvents.EVENTS.NOTES_SAVED, { dateKey, content });
        }
    }

    /**
     * Download notes as .txt file
     * @param {string} dateKey - Date in YYYY-MM-DD format
     * @param {string} content - Notes content
     */
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

    /**
     * Download the entire week's notes
     */
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

        const todayKey = getTodayDateKey();
        const mondayKey = monday.toISOString().split('T')[0];

        const blob = new Blob([weekContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `week_notes_${mondayKey}_to_${todayKey}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Open or toggle the notes side panel
     */
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

        // Apply theme if available
        if (window.ZDTheme && window.ZDTheme.applyThemeToDOM) {
            await window.ZDTheme.applyThemeToDOM();
        }
    }

    /**
     * Check if it's end of day and remind to download notes
     */
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
                            title: '📝 Don\'t Forget Your Notes!',
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

    /**
     * Check for end-of-week reminder (Saturday evening)
     */
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
                        title: '📅 End of Week - Download Your Notes!',
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

    /**
     * Initialize notes system - start reminder intervals
     */
    function init() {
        // Clear any existing intervals
        if (dayReminderInterval) clearInterval(dayReminderInterval);
        if (weekReminderInterval) clearInterval(weekReminderInterval);

        // Check reminders every minute
        dayReminderInterval = setInterval(checkEndOfDayNotesReminder, 60000);
        weekReminderInterval = setInterval(checkEndOfWeekReminder, 60000);
    }

    /**
     * Cleanup - clear intervals
     */
    function cleanup() {
        if (dayReminderInterval) clearInterval(dayReminderInterval);
        if (weekReminderInterval) clearInterval(weekReminderInterval);
    }

    // Public API
    window.ZDNotes = {
        getTodayDateKey,
        getNotesForDate,
        saveNotesForDate,
        downloadNotes,
        downloadWeekNotes,
        openNotesPanel,
        checkEndOfDayNotesReminder,
        checkEndOfWeekReminder,
        init,
        cleanup
    };
})();
