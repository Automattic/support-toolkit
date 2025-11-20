// Enhanced Data Export Module
// Provides CSV/JSON export with date range selection and validation

(function () {
    'use strict';

    const { logError } = window.ZDErrorHandler || { logError: console.error };
    const { showToast } = window.ZDNotificationUtils || {};

    /**
     * Convert data to CSV format
     */
    function dataToCSV(data, headers) {
        const rows = [];

        // Add header row
        rows.push(headers.join(','));

        // Add data rows
        data.forEach(row => {
            const values = headers.map(header => {
                let value = row[header];

                // Handle nulls and undefined
                if (value === null || value === undefined) {
                    value = '';
                }

                // Convert to string and escape quotes
                value = String(value).replace(/"/g, '""');

                // Wrap in quotes if contains comma, newline, or quotes
                if (value.includes(',') || value.includes('\n') || value.includes('"')) {
                    value = `"${value}"`;
                }

                return value;
            });
            rows.push(values.join(','));
        });

        return rows.join('\n');
    }

    /**
     * Export counts data to CSV
     */
    async function exportCountsCSV(startDate, endDate) {
        try {
            const history = await window.ZDStorage?.getLocal('dailyHistory') || {};
            const data = [];

            const headers = ['Date', 'Day', 'Chats', 'Tickets', 'Total', 'Hours Worked', 'Avg Per Hour'];

            // Filter by date range
            const dates = Object.keys(history).sort();
            for (const dateKey of dates) {
                const date = new Date(dateKey + 'T00:00:00Z');

                if (startDate && date < startDate) continue;
                if (endDate && date > endDate) continue;

                const entry = history[dateKey];
                const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
                const total = (entry.chats || 0) + (entry.tickets || 0);
                const hours = (entry.hoursWorked || 8);
                const avgPerHour = hours > 0 ? (total / hours).toFixed(1) : '0';

                data.push({
                    Date: dateKey,
                    Day: dayOfWeek,
                    Chats: entry.chats || 0,
                    Tickets: entry.tickets || 0,
                    Total: total,
                    'Hours Worked': hours,
                    'Avg Per Hour': avgPerHour
                });
            }

            if (data.length === 0) {
                if (showToast) showToast('No data in selected range', 'warning');
                return null;
            }

            return dataToCSV(data, headers);
        } catch (error) {
            logError(error, { category: 'UI', context: 'export-counts-csv' });
            throw error;
        }
    }

    /**
     * Export activity log to CSV
     */
    async function exportActivityCSV(startDate, endDate) {
        try {
            const allCounts = await window.ZDStorage?.getLocal('allCounts') || [];
            const data = [];

            const headers = ['Timestamp', 'Date', 'Time', 'Type', 'Action', 'Ticket ID', 'Source'];

            // Filter by date range
            for (const entry of allCounts) {
                const timestamp = new Date(entry.timestamp);

                if (startDate && timestamp < startDate) continue;
                if (endDate && timestamp > endDate) continue;

                data.push({
                    Timestamp: entry.timestamp,
                    Date: timestamp.toLocaleDateString(),
                    Time: timestamp.toLocaleTimeString(),
                    Type: entry.type || 'unknown',
                    Action: entry.delta > 0 ? 'increment' : 'decrement',
                    'Ticket ID': entry.ticketId || '',
                    Source: entry.source || 'manual'
                });
            }

            if (data.length === 0) {
                if (showToast) showToast('No activity in selected range', 'warning');
                return null;
            }

            return dataToCSV(data, headers);
        } catch (error) {
            logError(error, { category: 'UI', context: 'export-activity-csv' });
            throw error;
        }
    }

    /**
     * Export configuration to JSON
     */
    async function exportConfigJSON() {
        try {
            const config = await window.ZDStorage?.getConfig() || {};
            return JSON.stringify(config, null, 2);
        } catch (error) {
            logError(error, { category: 'UI', context: 'export-config-json' });
            throw error;
        }
    }

    /**
     * Export all data to comprehensive JSON
     */
    async function exportAllDataJSON() {
        try {
            const data = {
                exportedAt: new Date().toISOString(),
                version: chrome.runtime.getManifest().version,
                config: await window.ZDStorage?.getConfig() || {},
                counts: await window.ZDStorage?.getCounts() || {},
                dailyHistory: await window.ZDStorage?.getLocal('dailyHistory') || {},
                allCounts: await window.ZDStorage?.getLocal('allCounts') || [],
                lastActiveDayUTC: await window.ZDStorage?.getLocal('lastActiveDayUTC') || null
            };

            return JSON.stringify(data, null, 2);
        } catch (error) {
            logError(error, { category: 'UI', context: 'export-all-json' });
            throw error;
        }
    }

    /**
     * Validate imported data
     */
    function validateImportData(data, type = 'full') {
        const errors = [];

        try {
            if (type === 'full') {
                // Validate full backup structure
                if (!data || typeof data !== 'object') {
                    errors.push('Invalid data format: must be an object');
                    return { valid: false, errors };
                }

                if (!data.version) {
                    errors.push('Missing version information');
                }

                if (data.config && typeof data.config !== 'object') {
                    errors.push('Invalid config format');
                }

                if (data.counts && typeof data.counts !== 'object') {
                    errors.push('Invalid counts format');
                }

                if (data.dailyHistory && typeof data.dailyHistory !== 'object') {
                    errors.push('Invalid dailyHistory format');
                }

                if (data.allCounts && !Array.isArray(data.allCounts)) {
                    errors.push('Invalid allCounts format: must be an array');
                }
            } else if (type === 'config') {
                // Validate config only
                if (!data || typeof data !== 'object') {
                    errors.push('Invalid config format: must be an object');
                    return { valid: false, errors };
                }
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings: []
            };
        } catch (error) {
            return {
                valid: false,
                errors: ['Failed to validate data: ' + error.message]
            };
        }
    }

    /**
     * Download data as file
     */
    function downloadFile(content, filename, mimeType = 'application/json') {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);

            if (showToast) showToast('Downloaded: ' + filename, 'success');
        } catch (error) {
            logError(error, { category: 'UI', context: 'download-file' });
            throw error;
        }
    }

    /**
     * Show export modal with date range selection
     */
    function showExportModal() {
        // Remove existing modal if any
        const existing = document.querySelector('.zd-export-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-export-modal';

        const modal = document.createElement('div');
        modal.className = 'zd-settings-panel';
        modal.style.maxWidth = '600px';
        modal.innerHTML = `
            <div class="zd-settings-header">
                <h2>📥 Export Data</h2>
                <p class="zd-settings-subtitle">Choose format and date range</p>
            </div>

            <div class="zd-modal-body" style="padding: 24px;">
                <div class="zd-export-section">
                    <h3 style="margin: 0 0 16px 0; font-size: 16px;">Date Range (Optional)</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
                        <div>
                            <label style="display: block; margin-bottom: 6px; font-size: 13px;">Start Date</label>
                            <input type="date" class="zd-export-start-date" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 6px; font-size: 13px;">End Date</label>
                            <input type="date" class="zd-export-end-date" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                        <button class="zd-quick-range" data-range="7">Last 7 days</button>
                        <button class="zd-quick-range" data-range="30">Last 30 days</button>
                        <button class="zd-quick-range" data-range="90">Last 90 days</button>
                        <button class="zd-quick-range" data-range="all">All Time</button>
                    </div>
                </div>

                <div class="zd-export-section">
                    <h3 style="margin: 0 0 16px 0; font-size: 16px;">Export Format</h3>
                    <div style="display: grid; gap: 12px;">
                        <button class="zd-export-btn zd-btn-primary" data-type="counts-csv">
                            📊 Daily Counts (CSV)
                        </button>
                        <button class="zd-export-btn zd-btn-primary" data-type="activity-csv">
                            📋 Activity Log (CSV)
                        </button>
                        <button class="zd-export-btn zd-btn-primary" data-type="config-json">
                            ⚙️ Configuration (JSON)
                        </button>
                        <button class="zd-export-btn zd-btn-secondary" data-type="full-json">
                            💾 Full Backup (JSON)
                        </button>
                    </div>
                </div>
            </div>

            <div class="zd-modal-footer">
                <button class="zd-export-close zd-btn-secondary">Close</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Quick range buttons
        overlay.querySelectorAll('.zd-quick-range').forEach(btn => {
            btn.addEventListener('click', () => {
                const range = btn.dataset.range;
                const startInput = overlay.querySelector('.zd-export-start-date');
                const endInput = overlay.querySelector('.zd-export-end-date');

                const today = new Date();
                endInput.valueAsDate = today;

                if (range === 'all') {
                    startInput.value = '';
                    endInput.value = '';
                } else {
                    const days = parseInt(range);
                    const startDate = new Date(today);
                    startDate.setDate(startDate.getDate() - days);
                    startInput.valueAsDate = startDate;
                }
            });
        });

        // Export buttons
        overlay.querySelectorAll('.zd-export-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.dataset.type;
                const startInput = overlay.querySelector('.zd-export-start-date');
                const endInput = overlay.querySelector('.zd-export-end-date');

                const startDate = startInput.value ? new Date(startInput.value) : null;
                const endDate = endInput.value ? new Date(endInput.value) : null;

                btn.classList.add('zd-btn-loading');
                btn.disabled = true;

                try {
                    let content, filename, mimeType;
                    const timestamp = new Date().toISOString().split('T')[0];

                    switch (type) {
                        case 'counts-csv':
                            content = await exportCountsCSV(startDate, endDate);
                            filename = `support-toolkit-counts-${timestamp}.csv`;
                            mimeType = 'text/csv';
                            break;
                        case 'activity-csv':
                            content = await exportActivityCSV(startDate, endDate);
                            filename = `support-toolkit-activity-${timestamp}.csv`;
                            mimeType = 'text/csv';
                            break;
                        case 'config-json':
                            content = await exportConfigJSON();
                            filename = `support-toolkit-config-${timestamp}.json`;
                            break;
                        case 'full-json':
                            content = await exportAllDataJSON();
                            filename = `support-toolkit-backup-${timestamp}.json`;
                            break;
                    }

                    if (content) {
                        downloadFile(content, filename, mimeType);
                    }
                } catch (error) {
                    if (showToast) showToast('Export failed: ' + error.message, 'error');
                } finally {
                    btn.classList.remove('zd-btn-loading');
                    btn.disabled = false;
                }
            });
        });

        // Close button
        overlay.querySelector('.zd-export-close').addEventListener('click', () => {
            overlay.remove();
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    // Expose public API
    window.ZDExport = {
        exportCountsCSV,
        exportActivityCSV,
        exportConfigJSON,
        exportAllDataJSON,
        validateImportData,
        downloadFile,
        showExportModal
    };

    console.log('[Support Toolkit] Export module loaded');
})();
