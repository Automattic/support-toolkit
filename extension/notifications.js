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
        const title = 'Toolkit updated';
        const message = `You're now on <strong>${newVersion}</strong>.<br>Enjoy the latest fixes and features.`;
        info(title, message, { timeout: 12000 });
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
            chatStart:    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZDZ4ZjhybjQ0MTFqMzNkc3htdzExa2xyNzRyN3NpMm5tczczdTE2diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/HBMCmtsPEUShG/giphy.gif',
            chatEnd:      'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNDc0cHpzN25rZmJxN2RhMTd6cmR0c3h3MXR6Y3JjcDUxaHk2dmYwayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4ZtzlT61uOzFtN7hBG/giphy.gif',
            ticketsStart: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzBzdDJtZGFtdjFhdXlvYzZxcnZrMzJ0c2lsenEyY3l2OW9rYWlhZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/SbblchRKdkG7YR6U8L/giphy.gif',
            ticketsEnd:   'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzU2bDhsZ2RpZW11YXZzY3ZhOWx2YWdyeDIzc2RvaGdvdzR5N3hiayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/D28t0Rto3daKI/giphy.gif'
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
                message: 'Your chat shift starts soon.\nLet’s go!',
                imgURL: gifs.chatStart
            });
        }

        if (type === 'start' && normalized === 'tickets') {
            return maybeShowCard({
                title: 'Tickets shift starting',
                message: 'Your tickets shift starts soon.\nGet in the queue mindset.',
                imgURL: gifs.ticketsStart
            });
        }

        if (type === 'end' && normalized === 'chat') {
            return maybeShowCard({
                title: 'Chat shift ending',
                message: 'Your chat shift ends soon.\nWrap up current convos.',
                imgURL: gifs.chatEnd
            });
        }

        if (type === 'end' && normalized === 'tickets') {
            return maybeShowCard({
                title: 'Tickets shift ending',
                message: 'Your tickets shift ends soon.\nFinish any in-progress replies.',
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
