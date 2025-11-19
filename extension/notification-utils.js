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
        card.style.background = '#fff';
        card.style.color = '#222';
        card.style.borderRadius = '12px';
        card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        card.style.padding = '12px 16px';
        card.style.fontSize = '14px';
        card.style.lineHeight = '1.4';
        card.style.maxWidth = '280px';
        card.style.cursor = 'default';
        card.style.opacity = '0';
        card.style.transition = 'opacity 0.2s ease-in-out';
        card.style.borderLeft = '5px solid #0073aa';
        card.style.position = 'relative';

        const titleEl = document.createElement('div');
        titleEl.style.fontWeight = '600';
        titleEl.style.marginBottom = '4px';
        titleEl.textContent = title;

        const msgEl = document.createElement('div');
        msgEl.textContent = message;

        if (options.gifURL) {
            const gif = document.createElement('img');
            gif.src = options.gifURL;
            gif.style.display = 'block';
            gif.style.marginTop = '6px';
            gif.style.width = '100%';
            gif.style.borderRadius = '8px';
            msgEl.appendChild(gif);
        }

        // Close button
        const closeBtn = document.createElement('span');
        closeBtn.textContent = '✕';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '6px';
        closeBtn.style.right = '10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.fontSize = '12px';
        closeBtn.style.opacity = '0.6';
        closeBtn.addEventListener('mouseenter', () => (closeBtn.style.opacity = '1'));
        closeBtn.addEventListener('mouseleave', () => (closeBtn.style.opacity = '0.6'));
        closeBtn.addEventListener('click', () => removeNotification(card));

        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
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

        requestAnimationFrame(() => {
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

    // Public API
    window.ZDNotifyUtils = {
        showNotification,
        info,
        warn,
        clearAll
    };
})();
