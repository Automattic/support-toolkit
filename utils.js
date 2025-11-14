// Utility functions: time formatting, math, DOM helpers, throttling

(function () {

    // Date to "2025-10-24"
    function formatYMD(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Date to "10/24/2025" (used for log keys)
    function formatMDYSlash(dateObj) {
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const y = dateObj.getFullYear();
        return `${m}/${d}/${y}`;
    }

    // Date to "09:30" (24-hour)
    function formatHM(dateObj) {
        const hh = String(dateObj.getHours()).padStart(2, '0');
        const mm = String(dateObj.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    // Milliseconds to "MM:SS"
    function formatMMSS(msLeft) {
        if (msLeft < 0) msLeft = 0;
        const totalSec = Math.floor(msLeft / 1000);
        const mm = Math.floor(totalSec / 60);
        const ss = totalSec % 60;
        return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    // Get week range [Monday, Sunday] for given date
    function getWeekRange(dateObj) {
        const d = new Date(dateObj);
        const jsDay = d.getDay();
        const diffToMon = (jsDay + 6) % 7;

        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(d.getDate() - diffToMon);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        return [weekStart, weekEnd];
    }

    // Safe number parsing
    function toNumber(v, fallback = 0) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    }

    // Calculate average per hour
    function avgPerHour(countSoFar, hoursSoFar) {
        if (!hoursSoFar || hoursSoFar <= 0) return "0.00";
        const avg = countSoFar / hoursSoFar;
        return avg.toFixed(2);
    }

    // Calculate percentage of goal
    function pctOfGoal(currentCount, targetCount) {
        if (!targetCount || targetCount <= 0) return 0;
        return Math.round((currentCount / targetCount) * 100);
    }

    // Clamp number between min and max
    function clamp(n, min, max) {
        if (n < min) return min;
        if (n > max) return max;
        return n;
    }

    // Safe JSON parsing
    function safeJSONParse(str, fallback) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    }

    // Run function at most once per interval
    function throttle(fn, ms) {
        let last = 0;
        return function throttled(...args) {
            const now = Date.now();
            if (now - last >= ms) {
                last = now;
                return fn.apply(this, args);
            }
        };
    }

    // Delay function execution until calls stop
    function debounce(fn, ms) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => {
                fn.apply(this, args);
            }, ms);
        };
    }

    // Create element with optional class and HTML
    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    // Toggle CSS class on element
    function toggleClass(elm, className, enabled) {
        if (!elm) return;
        if (enabled) elm.classList.add(className);
        else elm.classList.remove(className);
    }

    // Expose public API
    window.ZDUtils = {
        formatYMD,
        formatMDYSlash,
        formatHM,
        formatMMSS,
        getWeekRange,
        avgPerHour,
        pctOfGoal,
        toNumber,
        clamp,
        safeJSONParse,
        throttle,
        debounce,
        el,
        toggleClass
    };
})();
