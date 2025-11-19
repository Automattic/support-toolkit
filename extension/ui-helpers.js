// UI helper utilities: loading spinner, confetti, etc.

(function () {
    'use strict';

    /**
     * Show a loading spinner overlay
     * @returns {HTMLElement} The overlay element (for later removal)
     */
    function showLoadingSpinner() {
        const overlay = document.createElement('div');
        overlay.className = 'zd-loading-overlay';
        overlay.innerHTML = `<div class="zd-loading-ball"></div>`;
        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * Hide and remove a loading spinner overlay
     * @param {HTMLElement} overlay - The overlay to remove
     */
    function hideLoadingSpinner(overlay) {
        if (!overlay) return;
        overlay.classList.add('fade-out');
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }

    /**
     * Trigger confetti celebration effect
     * Only triggers once per page load to avoid overwhelming the user
     */
    function triggerConfetti() {
        // Check state to ensure one-time trigger
        if (window.ZDState && window.ZDState.get('confettiTriggered')) return;

        if (window.ZDState) {
            window.ZDState.set('confettiTriggered', true);
        }

        const colors = ['#a91b1b', '#165c3a', '#ffd700', '#4caf50', '#ff6b6b'];
        const confettiCount = 50;

        // Create container for easier cleanup
        const container = document.createElement('div');
        container.className = 'zd-confetti-container';
        document.body.appendChild(container);

        for (let i = 0; i < confettiCount; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'zd-confetti';
            confetti.style.left = Math.random() * 100 + '%';
            confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
            container.appendChild(confetti);
        }

        // Single cleanup for all confetti
        setTimeout(() => {
            container.remove();
        }, 4000);

        // Reset state after 30 seconds to allow re-triggering
        setTimeout(() => {
            if (window.ZDState) {
                window.ZDState.set('confettiTriggered', false);
            }
        }, 30000);
    }

    /**
     * Create a modal overlay container
     * @param {string} className - CSS class for the overlay
     * @returns {HTMLElement} The overlay element
     */
    function createOverlay(className) {
        const overlay = document.createElement('div');
        overlay.className = className;
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
        return overlay;
    }

    /**
     * Show a modal overlay
     * @param {HTMLElement} overlay - The overlay to show
     */
    function showOverlay(overlay) {
        if (!overlay) return;
        overlay.style.display = 'flex';
    }

    /**
     * Hide a modal overlay
     * @param {HTMLElement} overlay - The overlay to hide
     */
    function hideOverlay(overlay) {
        if (!overlay) return;
        overlay.style.display = 'none';
    }

    /**
     * Create a close button for modals
     * @param {Function} onClose - Click handler
     * @returns {HTMLElement} The close button
     */
    function createCloseButton(onClose) {
        const btn = document.createElement('button');
        btn.className = 'zd-modal-close';
        btn.textContent = '✕';
        btn.addEventListener('click', onClose);
        return btn;
    }

    // Public API
    window.ZDUIHelpers = {
        showLoadingSpinner,
        hideLoadingSpinner,
        triggerConfetti,
        createOverlay,
        showOverlay,
        hideOverlay,
        createCloseButton
    };
})();
