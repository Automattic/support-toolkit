// Shift notifications: center-screen cards, sounds, version alerts

(function () {
    const { showNotification, info } = window.ZDNotifyUtils;

    // Play shift alert sound
    async function playShiftSound() {
        try {
            const cfg = await ZDStorage.getConfig();

            if (cfg.playReminderSound === false) {
                return;
            }

            const audioURL = chrome.runtime.getURL('sounds/shift-alert.mp3');
            const audioEl = new Audio(audioURL);
            audioEl.volume = 0.4;

            audioEl.play().catch((err) => {
                console.warn('[ZDNotifications] Audio blocked by autoplay rules:', err);
            });
        } catch (e) {
            console.warn('[ZDNotifications] playShiftSound failed:', e);
        }
    }

    function versionUpdate(newVersion) {
        // Try to show enhanced notification with changelog
        if (window.ZDChangelog) {
            showVersionUpdateCard(newVersion);
        } else {
            // Fallback to simple notification
            const title = 'Toolkit updated';
            const message = `You're now on <strong>${newVersion}</strong>.<br>Enjoy the latest fixes and features.`;
            info(title, message, { timeout: 12000 });
        }
    }

    /**
     * Show version update notification using the same style as shift notifications
     */
    function showVersionUpdateCard(newVersion) {
        const versionData = window.ZDChangelog.getVersion(newVersion) || window.ZDChangelog.getLatest();
        const gifUrl = window.ZDChangelog.UPDATE_GIF;

        // Build highlights as bullet points
        const highlights = versionData?.highlights?.length
            ? versionData.highlights.map(h => `• ${h}`).join('\n')
            : '• Bug fixes and improvements';

        const message = `You're now on v${newVersion}!\n${highlights}`;

        // Use the same centered notification as shift reminders
        showCenteredNotification({
            title: 'Toolkit updated',
            message: message,
            imgURL: gifUrl
        });
    }


    function firstTimeUserAlert() {
        const title = 'New Contact Detected';
        const message =
            "This looks like your <strong>first interaction</strong> with this user today — make it a good one!";
        showNotification(title, message, { timeout: 8000 });
    }

    // Center-screen notification card
    function showCenteredNotification({ title, message, imgURL }) {
        const overlay = document.createElement('div');
        overlay.className = 'zd-center-overlay';

        const card = document.createElement('div');
        card.className = 'zd-center-card';

        const headerEl = document.createElement('div');
        headerEl.className = 'zd-center-card-header';
        headerEl.textContent = title || 'Notice';

        const bodyEl = document.createElement('div');
        bodyEl.className = 'zd-center-card-body';

        if (imgURL) {
            const imgEl = document.createElement('img');
            imgEl.className = 'zd-center-card-img';
            imgEl.src = imgURL;
            imgEl.alt = '';
            bodyEl.appendChild(imgEl);
        }

        const msgEl = document.createElement('div');
        msgEl.className = 'zd-center-card-text';
        msgEl.textContent = message || '';
        bodyEl.appendChild(msgEl);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'zd-center-close-btn';
        closeBtn.textContent = 'Close';

        card.appendChild(headerEl);
        card.appendChild(bodyEl);
        card.appendChild(closeBtn);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        function removeOverlay() {
            overlay.remove();
        }

        closeBtn.addEventListener('click', removeOverlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                removeOverlay();
            }
        });

        // Auto-close after 60 seconds for shift start notifications
        if (title && /shift starting/i.test(title)) {
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    overlay.remove();
                }
            }, 60 * 1000);
        }
    }

    // Show shift notification with GIF and sound
    async function showShiftNotification(type, shiftType) {
        const cfg = await ZDStorage.getConfig();

        const allowVisual = cfg.showShiftReminders !== false;
        const allowSound = cfg.playReminderSound !== false;

        const normalized = /chat/i.test(shiftType) ? 'chat' : 'tickets';

        const gifs = {
            chatStart:    'https://media.giphy.com/media/mcsPU3SkKrYDdW3aAU/giphy.gif',
            chatEnd:      'https://media.giphy.com/media/UuebWyG4pts3rboawU/giphy.gif',
            ticketsStart: 'https://media.giphy.com/media/SwImQhtiNA7io/giphy.gif',
            ticketsEnd:   'https://media.giphy.com/media/RjVP4ZoxA3xeReLQT0/giphy.gif'
        };

        // Show notification if enabled
        function maybeShowCard(opts) {
            if (allowVisual) {
                showCenteredNotification(opts);
            }
            if (allowSound) {
                playShiftSound();
            }
        }

        if (type === 'start' && normalized === 'chat') {
            return maybeShowCard({
                title: 'Chat shift starting',
                message: 'Your chat shift starts in ~5 min.\nTime to get ready!',
                imgURL: gifs.chatStart
            });
        }

        if (type === 'start' && normalized === 'tickets') {
            return maybeShowCard({
                title: 'Tickets shift starting',
                message: 'Your tickets shift starts in ~5 min.\nGet in the queue mindset.',
                imgURL: gifs.ticketsStart
            });
        }

        if (type === 'end' && normalized === 'chat') {
            return maybeShowCard({
                title: 'Chat shift ending',
                message: 'Your chat shift ends in ~10 min.\nStart wrapping up to go offline.',
                imgURL: gifs.chatEnd
            });
        }

        if (type === 'end' && normalized === 'tickets') {
            return maybeShowCard({
                title: 'Tickets shift ending',
                message: 'Your tickets shift ends in ~10 min.\nFinish any in-progress replies.',
                imgURL: gifs.ticketsEnd
            });
        }

        // Generic fallback
        return maybeShowCard({
            title: 'Shift update',
            message: 'Heads up about your shift.',
            imgURL: null
        });
    }

    // Public API
    window.ZDNotifications = {
        showShiftNotification,
        playShiftSound,
        showCenteredNotification,
        versionUpdate,
        firstTimeUserAlert
    };
})();
