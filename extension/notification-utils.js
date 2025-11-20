// Toast notifications: lightweight top-right info/warning messages

(function () {
    const NOTIF_CONTAINER_ID = 'zd-notification-container';

    // Create or get toast container
    function ensureContainer() {
        let container = document.getElementById(NOTIF_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = NOTIF_CONTAINER_ID;
            container.style.position = 'fixed';
            container.style.top = '20px';
            container.style.right = '20px';
            container.style.zIndex = '999999';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.gap = '10px';
            document.body.appendChild(container);
        }
        return container;
    }

    // Build notification card
    function createNotificationCard(title, message, options = {}) {
        const card = document.createElement('div');
        card.className = 'zd-notification-card';

        const titleEl = document.createElement('div');
        titleEl.className = 'zd-notification-title';
        titleEl.textContent = title;

        const msgEl = document.createElement('div');
        msgEl.className = 'zd-notification-message';
        msgEl.innerHTML = message;

        if (options.gifURL) {
            const gif = document.createElement('img');
            gif.className = 'zd-notification-gif';
            gif.src = options.gifURL;
            gif.alt = '';
            msgEl.appendChild(gif);
        }

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.className = 'zd-notification-close';
        closeBtn.textContent = '✕';
        closeBtn.addEventListener('click', () => removeNotification(card));

        const wrapper = document.createElement('div');
        wrapper.className = 'zd-notification-wrapper';
        wrapper.appendChild(closeBtn);
        wrapper.appendChild(titleEl);
        wrapper.appendChild(msgEl);

        card.appendChild(wrapper);
        return card;
    }

    // Show toast notification
    function showNotification(title, message, options = {}) {
        const container = ensureContainer();
        const card = createNotificationCard(title, message, options);
        container.appendChild(card);

        // Trigger slide-in animation
        requestAnimationFrame(() => {
            card.style.animation = 'slideInRight 0.3s ease-out forwards';
            card.style.opacity = '1';
        });

        const timeout = options.timeout || 8000;
        if (timeout > 0) {
            setTimeout(() => {
                removeNotification(card);
            }, timeout);
        }

        return card;
    }

    function removeNotification(card) {
        if (!card) return;
        card.style.opacity = '0';
        setTimeout(() => {
            card.remove();
        }, 200);
    }

    // Info notification
    function info(title, msg, options = {}) {
        return showNotification(title, msg, {
            ...options,
            color: '#0073aa'
        });
    }

    // Warning notification
    function warn(title, msg, options = {}) {
        return showNotification(title, msg, {
            ...options,
            color: '#d63638'
        });
    }

    // Clear all notifications
    function clearAll() {
        const container = document.getElementById(NOTIF_CONTAINER_ID);
        if (container) container.innerHTML = '';
    }

    // Quick toast notification (simple version)
    function showToast(message, type = 'info', timeout = 3000) {
        const title = type === 'success' ? 'Success' :
                      type === 'error' ? 'Error' :
                      type === 'warning' ? 'Warning' : 'Info';
        return showNotification(title, message, { timeout });
    }

    // Public API
    window.ZDNotifyUtils = {
        showNotification,
        info,
        warn,
        clearAll,
        showToast
    };
})();
