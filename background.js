/*
 * AI Flow Automator background invariant:
 * - Clicking the extension toolbar action only requests a visibility toggle.
 * - The background never reads page content and never sends AI messages.
 * - Rule notifications are created only when the content script reports a triggered rule.
 * - Ctrl+Alt+A is intentionally handled by the content script because Chrome's
 *   extension Commands API does not allow Ctrl+Alt combinations.
 * - Restricted Chrome pages fail silently because content scripts cannot run there.
 */

'use strict';

const MESSAGE_TOGGLE_WIDGET = 'AIFLOW_TOGGLE_WIDGET';
const MESSAGE_NOTIFY_RULE = 'AIFLOW_NOTIFY_RULE';

function toggleWidgetInTab(tab) {
    const tabId = tab?.id;

    if (!Number.isInteger(tabId)) {
        return;
    }

    chrome.tabs.sendMessage(
        tabId,
        { type: MESSAGE_TOGGLE_WIDGET },
        () => {
            void chrome.runtime.lastError;
        }
    );
}

function truncateNotificationText(value, maxLength = 180) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(1, maxLength - 1))}…`;
}

function notifyRuleTriggered(expectedText) {
    const text = truncateNotificationText(expectedText) || 'Configured rule';

    chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/notification-128.png'),
        title: 'AI Flow Automator',
        message: `Rule triggered: ${text}`,
        priority: 1,
    }, () => {
        void chrome.runtime.lastError;
    });
}

chrome.action.onClicked.addListener(tab => {
    toggleWidgetInTab(tab);
});

chrome.runtime.onMessage.addListener(message => {
    if (message?.type === MESSAGE_NOTIFY_RULE) {
        notifyRuleTriggered(message.expectedText);
    }
});
