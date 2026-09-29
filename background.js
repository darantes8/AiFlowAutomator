/*
 * AI Flow Automator background invariant:
 * - Clicking the extension toolbar action only requests a visibility toggle.
 * - The background never reads page content and never sends AI messages.
 * - Ctrl+Alt+A is intentionally handled by the content script because Chrome's
 *   extension Commands API does not allow Ctrl+Alt combinations.
 * - Restricted Chrome pages fail silently because content scripts cannot run there.
 */

'use strict';

const MESSAGE_TOGGLE_WIDGET = 'AIFLOW_TOGGLE_WIDGET';

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

chrome.action.onClicked.addListener(tab => {
    toggleWidgetInTab(tab);
});
