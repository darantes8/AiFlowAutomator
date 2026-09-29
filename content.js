/*
 * AI Flow Automator content invariant:
 * - Rule matching reads rendered DOM text only; HTML tags and attributes are never matched.
 * - The on-page widget is hidden on first use and appears only after Ctrl+Alt+A
 *   or a click on the extension toolbar action; visibility survives a reload in the same tab.
 * - Automation is independent from widget visibility. ON/OFF is explicit.
 * - Existing page text is baselined when automation is enabled; old answers never fire a rule.
 * - The first configured matching rule wins.
 * - User-typed composer text is never overwritten.
 * - A reply is sent only after the matched response is stable and generation is not active.
 * - Known AI providers use provider-specific selectors. Unknown AI sites use a conservative
 *   mutation-based text fallback.
 * - Rules/theme/send delay persist across tabs; runtime UI state, counters, position and generation times survive reloads in the same tab.
 */

(() => {
    'use strict';

    if (window.top !== window) {
        return;
    }

    const VERSION = '2.4.0';
    const ROOT_ID = 'aiflow-root';
    const MESSAGE_TOGGLE_WIDGET = 'AIFLOW_TOGGLE_WIDGET';

    const CONFIG = {
        stabilityMs: 1400,
        defaultSendDelayMs: 350,
        sendAttempts: 24,
        sendAttemptIntervalMs: 180,
        observerDelayMs: 120,
        fallbackMs: 2000,
        timerIntervalMs: 250,
        maxTimeHistory: 8,
        genericSurfaceMaxAgeMs: 45000,
        genericSurfaceLimit: 16,
        visibilityToggleDebounceMs: 600,
        generationQuietMs: 2800,
        generationMinimumMs: 700,
        counterLabelMaxChars: 20,
    };

    const STORAGE = {
        rules: 'ai_flow_automator_rules_v2',
        preferences: 'ai_flow_automator_preferences_v2',
        enabled: 'ai_flow_automator_enabled_v2',
        visible: 'ai_flow_automator_visible_v2',
        settingsOpen: 'ai_flow_automator_settings_open_v2',
        position: 'ai_flow_automator_position_v2',
        responseCounts: 'ai_flow_automator_response_counts_v2',
        timeHistory: 'ai_flow_automator_time_history_v2',
        generationStartedAt: 'ai_flow_automator_generation_started_at_v2',
        sentMatchFingerprints: 'ai_flow_automator_sent_match_fingerprints_v2',
    };

    const DEFAULT_PREFERENCES = {
        theme: 'light',
        accent: 'green',
        sendDelayMs: CONFIG.defaultSendDelayMs,
    };

    const DEFAULT_RULES = [
        {
            id: 'default-next',
            expectedText: 'Aguardando proximo',
            responseText: 'proximo',
        },
        {
            id: 'default-resume-stream',
            expectedText: 'Resume stream unavailable',
            responseText: 'continue',
        },
        {
            id: 'default-stream-timeout',
            expectedText: 'ChatGPT stream recovery polling timed out',
            responseText: 'continue',
        },
        {
            id: 'default-generation-error',
            expectedText: 'There was an error generating a response',
            responseText: 'continue',
        },
    ];

    const GENERIC_COMPOSER_SELECTORS = [
        'textarea:not([disabled]):not([readonly])',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"][data-lexical-editor="true"]',
        '.ProseMirror[contenteditable="true"]',
        '.ql-editor[contenteditable="true"]',
        '[contenteditable="true"]',
    ];

    const GENERIC_SEND_SELECTORS = [
        'button[type="submit"]',
        'button[data-testid*="send" i]',
        'button[data-test-id*="send" i]',
        'button[aria-label*="send" i]',
        'button[aria-label*="submit" i]',
        'button[aria-label*="enviar" i]',
        'button[aria-label*="envoyer" i]',
        'button[aria-label*="senden" i]',
        'button[aria-label*="invia" i]',
        'button[aria-label*="gonder" i]',
        'button[title*="send" i]',
        'button[title*="submit" i]',
    ];

    const GENERIC_STOP_SELECTORS = [
        'button[data-testid*="stop" i]',
        'button[data-test-id*="stop" i]',
        'button[aria-label*="stop" i]',
        'button[aria-label*="cancel response" i]',
        'button[aria-label*="stop generating" i]',
        'button[title*="stop" i]',
    ];

    const PROVIDERS = [
        {
            id: 'chatgpt',
            name: 'ChatGPT',
            hosts: ['chatgpt.com'],
            assistantSelectors: [
                '[data-content-search-unit-key$=":assistant"]',
                '[data-chatgpt-search-unit-key$=":assistant"]',
                '[data-message-author-role="assistant"]',
                'article[data-turn="assistant"]',
                'section[data-turn="assistant"]',
            ],
            composerSelectors: [
                '#prompt-textarea[contenteditable="true"]',
                '[data-testid="prompt-textarea"][contenteditable="true"]',
                '[contenteditable="true"][data-lexical-editor="true"]',
            ],
            sendSelectors: [
                '#composer-submit-button',
                '[data-testid="send-button"]',
                'button[aria-label="Send prompt"]',
                'button[aria-label="Enviar prompt"]',
            ],
            stopSelectors: [
                '[data-testid="stop-button"]',
                '[data-testid="composer-stop-button"]',
            ],
        },
        {
            id: 'claude',
            name: 'Claude',
            hosts: ['claude.ai'],
            assistantSelectors: [
                'div.font-claude-response',
                '[data-testid="assistant-message"]',
                '[data-testid*="assistant-message"]',
                '[data-message-author-role="assistant"]',
            ],
            composerSelectors: [
                '[data-testid="chat-input"][contenteditable="true"]',
                '.ProseMirror[contenteditable="true"]',
                'div[data-placeholder][contenteditable="true"]',
            ],
            sendSelectors: [
                'button[data-testid="send-button"]',
                'button[aria-label*="Send message" i]',
                'button[aria-label="Send"]',
            ],
            stopSelectors: [
                'button[data-testid="stop-button"]',
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'gemini',
            name: 'Gemini',
            hosts: ['gemini.google.com'],
            assistantSelectors: [
                'model-response',
                'model-response message-content',
                '.model-response-text',
                '.response-content',
            ],
            composerSelectors: [
                'rich-textarea .ql-editor[contenteditable="true"]',
                'rich-textarea [contenteditable="true"][role="textbox"]',
                '.ql-editor[contenteditable="true"]',
                'div[contenteditable="true"][aria-label*="prompt" i]',
            ],
            sendSelectors: [
                '[data-test-id="send-button-container"] button',
                'button[aria-label*="Send message" i]',
                'button.send-button',
                'button[mattooltip*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
                'button[mattooltip*="Stop" i]',
            ],
        },
        {
            id: 'google-ai-studio',
            name: 'Google AI Studio',
            hosts: ['aistudio.google.com'],
            assistantSelectors: [
                '[data-role="model"]',
                '[data-message-author="model"]',
                'ms-chat-turn[role="model"]',
                'main [class*="model-response"]',
            ],
            composerSelectors: [
                'textarea[placeholder*="prompt" i]',
                'textarea[aria-label*="prompt" i]',
                'footer textarea',
            ],
            sendSelectors: [
                'footer button[type="submit"]',
                'button[aria-label*="Run" i]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'copilot',
            name: 'Microsoft Copilot',
            hosts: ['copilot.com', 'copilot.microsoft.com', 'copilot.cloud.microsoft'],
            assistantSelectors: [
                'cib-message-group[source="bot"]',
                '[data-testid*="assistant" i]',
                '[data-content="ai-message"]',
                '[class*="assistant-message"]',
            ],
            composerSelectors: [
                'textarea[placeholder*="message" i]',
                'textarea[aria-label*="message" i]',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[aria-label*="Send" i]',
                'button[type="submit"]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'perplexity',
            name: 'Perplexity',
            hosts: ['perplexity.ai'],
            assistantSelectors: [
                '[data-testid="answer"]',
                '[data-testid*="answer" i]',
                'main [class*="prose"]',
            ],
            composerSelectors: [
                '#ask-input[contenteditable="true"]',
                '#ask-input[role="textbox"]',
                'div[role="textbox"][contenteditable="true"]',
                'div[contenteditable="true"][data-lexical-editor="true"]',
            ],
            sendSelectors: [
                'button[aria-label="Submit"]',
                'button[aria-label="Send"]',
                'button[type="submit"]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'grok',
            name: 'Grok',
            hosts: ['grok.com'],
            assistantSelectors: [
                '[data-testid*="assistant" i]',
                '[data-testid*="message" i] [class*="markdown"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'div.ProseMirror[contenteditable="true"][role="textbox"]',
                'div.tiptap.ProseMirror[contenteditable="true"]',
                'textarea',
            ],
            sendSelectors: [
                'button[data-testid="chat-submit"]',
                'button[type="submit"][aria-label="Submit"]',
                'button[type="submit"][aria-label="Send"]',
                'button[type="submit"][aria-label="Enviar"]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
                'button[data-testid*="stop" i]',
            ],
        },
        {
            id: 'deepseek',
            name: 'DeepSeek',
            hosts: ['chat.deepseek.com'],
            assistantSelectors: [
                '.ds-markdown',
                '[class*="ds-markdown"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'textarea',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'mistral',
            name: 'Mistral Vibe',
            hosts: ['chat.mistral.ai'],
            assistantSelectors: [
                '[data-message-author-role="assistant"]',
                'main [class*="prose"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'textarea[name="message.text"]',
                'textarea[placeholder*="Ask" i]',
                'div.ProseMirror[contenteditable="true"]',
                'textarea',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'meta-ai',
            name: 'Meta AI',
            hosts: ['meta.ai'],
            assistantSelectors: [
                '[data-testid*="assistant" i]',
                '[data-message-author-role="assistant"]',
                'main [role="article"]',
            ],
            composerSelectors: [
                'textarea',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'kimi',
            name: 'Kimi',
            hosts: ['kimi.com'],
            assistantSelectors: [
                '.segment-assistant',
                '[data-role="assistant"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                '.chat-input-editor[contenteditable="true"]',
                'div[contenteditable="true"][data-lexical-editor="true"]',
                'textarea[placeholder*="Ask" i]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'qwen',
            name: 'Qwen Chat',
            hosts: ['qwen.ai', 'chat.qwen.ai'],
            assistantSelectors: [
                '[data-role="assistant"]',
                '[data-message-author-role="assistant"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'textarea',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'poe',
            name: 'Poe',
            hosts: ['poe.com'],
            assistantSelectors: [
                '[data-testid*="bot-message" i]',
                '[data-message-author-role="assistant"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'textarea',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
        {
            id: 'you',
            name: 'You.com',
            hosts: ['you.com'],
            assistantSelectors: [
                '[data-testid*="assistant" i]',
                '[data-message-author-role="assistant"]',
                'main [class*="markdown"]',
            ],
            composerSelectors: [
                'textarea',
                '[contenteditable="true"][role="textbox"]',
            ],
            sendSelectors: [
                'button[type="submit"]',
                'button[aria-label*="Send" i]',
            ],
            stopSelectors: [
                'button[aria-label*="Stop" i]',
            ],
        },
    ];

    let rules = [];
    let preferences = { ...DEFAULT_PREFERENCES };
    let processing = false;
    let scheduledCheck = null;
    let generationStartedAt = null;
    let generationObservedResponse = false;
    let generationLastResponseChangeAt = null;
    let generationLastSurfaceSignature = '';
    let generationSawActiveSignal = false;
    let widgetVisible = false;
    let lastVisibilityToggleAt = 0;
    let elementSequence = 0;

    const elementIds = new WeakMap();
    const surfaceStates = new Map();
    const processedMatches = new Set();
    const completedSurfaceStates = new Set();
    const sentMatchFingerprints = new Set();
    const recentGenericElements = new Map();

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function createId() {
        if (globalThis.crypto?.randomUUID) {
            return globalThis.crypto.randomUUID();
        }

        return `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function normalizeText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
    }

    function normalizeForMatch(value) {
        return normalizeText(value)
            .replace(/\s+/g, ' ')
            .toLocaleLowerCase('en-US');
    }

    function hashText(text) {
        let hash = 2166136261;

        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }

        return (hash >>> 0).toString(36);
    }

    function getElementId(element, prefix) {
        if (elementIds.has(element)) {
            return elementIds.get(element);
        }

        elementSequence += 1;
        const id = `${prefix}:${elementSequence}`;
        elementIds.set(element, id);
        return id;
    }

    function isInsideExtension(element) {
        return Boolean(element?.closest?.(`#${ROOT_ID}`));
    }

    function isVisible(element) {
        if (!element?.isConnected || isInsideExtension(element)) {
            return false;
        }

        const style = window.getComputedStyle(element);

        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity) === 0
        ) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function readRenderedText(element) {
        if (!element) {
            return '';
        }

        if (
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLInputElement
        ) {
            return normalizeText(element.value);
        }

        return normalizeText(
            element.innerText ||
            element.textContent ||
            ''
        );
    }

    function hostMatches(hostname, host) {
        return hostname === host || hostname.endsWith(`.${host}`);
    }

    function getProvider() {
        const hostname = window.location.hostname.toLowerCase();

        return PROVIDERS.find(provider =>
            provider.hosts.some(host => hostMatches(hostname, host))
        ) || {
            id: 'generic',
            name: 'Generic AI page',
            hosts: [],
            assistantSelectors: [],
            composerSelectors: [],
            sendSelectors: [],
            stopSelectors: [],
        };
    }

    const provider = getProvider();

    function safeSessionGet(key) {
        try {
            return window.sessionStorage.getItem(key);
        } catch (error) {
            return null;
        }
    }

    function safeSessionSet(key, value) {
        try {
            window.sessionStorage.setItem(key, value);
        } catch (error) {
            console.warn('[AI Flow Automator] Session storage unavailable.', error);
        }
    }

    function safeSessionRemove(key) {
        try {
            window.sessionStorage.removeItem(key);
        } catch (error) {
            console.warn('[AI Flow Automator] Session storage unavailable.', error);
        }
    }

    function chromeStorageGet(key) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get([key], result => {
                    const lastError = chrome.runtime.lastError;

                    if (lastError) {
                        reject(new Error(lastError.message));
                        return;
                    }

                    resolve(result[key]);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function chromeStorageSet(key, value) {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.set({ [key]: value }, () => {
                    const lastError = chrome.runtime.lastError;

                    if (lastError) {
                        reject(new Error(lastError.message));
                        return;
                    }

                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function sanitizeRules(value) {
        if (!Array.isArray(value)) {
            return [];
        }

        return value
            .map(rule => ({
                id: String(rule?.id || createId()),
                expectedText: normalizeText(rule?.expectedText),
                responseText: normalizeText(rule?.responseText),
            }))
            .filter(rule => rule.expectedText && rule.responseText);
    }

    async function loadRules() {
        try {
            const stored = await chromeStorageGet(STORAGE.rules);

            if (stored === undefined) {
                rules = DEFAULT_RULES.map(rule => ({ ...rule }));
                await chromeStorageSet(STORAGE.rules, rules);
                return;
            }

            rules = sanitizeRules(stored);
        } catch (error) {
            console.warn(
                '[AI Flow Automator] Could not load saved rules. Using defaults for this page.',
                error
            );
            rules = DEFAULT_RULES.map(rule => ({ ...rule }));
        }
    }

    async function saveRules(nextRules) {
        const sanitized = sanitizeRules(nextRules);
        rules = sanitized;

        try {
            await chromeStorageSet(STORAGE.rules, sanitized);
        } catch (error) {
            console.error('[AI Flow Automator] Could not save rules.', error);
            throw error;
        }

        resetDetectionState();
        markCurrentSurfacesAsProcessed();
        updateInterface();
    }

    function sanitizePreferences(value) {
        const theme = value?.theme === 'dark' ? 'dark' : 'light';
        const allowedAccents = new Set([
            'green',
            'blue',
            'violet',
            'rose',
            'orange',
            'cyan',
            'indigo',
        ]);
        const accent = allowedAccents.has(value?.accent)
            ? value.accent
            : DEFAULT_PREFERENCES.accent;
        const sendDelayCandidate = Number(value?.sendDelayMs);
        const sendDelayMs = Number.isFinite(sendDelayCandidate)
            ? Math.min(60000, Math.max(0, Math.round(sendDelayCandidate)))
            : CONFIG.defaultSendDelayMs;

        return { theme, accent, sendDelayMs };
    }

    async function loadPreferences() {
        try {
            const stored = await chromeStorageGet(STORAGE.preferences);
            preferences = stored === undefined
                ? { ...DEFAULT_PREFERENCES }
                : sanitizePreferences(stored);

            if (stored === undefined) {
                await chromeStorageSet(STORAGE.preferences, preferences);
            }
        } catch (error) {
            console.warn(
                '[AI Flow Automator] Could not load preferences. Using defaults for this page.',
                error
            );
            preferences = { ...DEFAULT_PREFERENCES };
        }
    }

    async function savePreferences(nextPreferences) {
        const sanitized = sanitizePreferences(nextPreferences);
        preferences = sanitized;

        try {
            await chromeStorageSet(STORAGE.preferences, sanitized);
        } catch (error) {
            console.error('[AI Flow Automator] Could not save preferences.', error);
            throw error;
        }

        applyTheme();
        renderPreferencesEditor();
        updateInterface();
    }

    function isEnabled() {
        return safeSessionGet(STORAGE.enabled) === '1';
    }

    function setEnabled(value) {
        safeSessionSet(STORAGE.enabled, value ? '1' : '0');
        updateInterface();
    }

    function readResponseCounts() {
        const raw = safeSessionGet(STORAGE.responseCounts);

        if (!raw) {
            return {};
        }

        try {
            const value = JSON.parse(raw);
            return value && typeof value === 'object' && !Array.isArray(value)
                ? value
                : {};
        } catch (error) {
            return {};
        }
    }

    function writeResponseCounts(value) {
        safeSessionSet(STORAGE.responseCounts, JSON.stringify(value));
    }

    function incrementResponseCount(responseText) {
        const counts = readResponseCounts();
        const key = normalizeText(responseText);
        counts[key] = Number(counts[key] || 0) + 1;
        writeResponseCounts(counts);
        updateInterface();
    }

    function readTimeHistory() {
        const raw = safeSessionGet(STORAGE.timeHistory);

        if (!raw) {
            return [];
        }

        try {
            const value = JSON.parse(raw);
            return Array.isArray(value)
                ? value.filter(item => Number.isFinite(item) && item >= 0)
                : [];
        } catch (error) {
            return [];
        }
    }

    function writeTimeHistory(value) {
        safeSessionSet(STORAGE.timeHistory, JSON.stringify(value));
    }

    function recordGenerationTime(durationMs) {
        const history = readTimeHistory();
        history.unshift(Math.max(0, Math.round(durationMs)));
        writeTimeHistory(history.slice(0, CONFIG.maxTimeHistory));
    }

    function clearMetrics() {
        safeSessionRemove(STORAGE.responseCounts);
        safeSessionRemove(STORAGE.timeHistory);
        updateInterface();
    }

    function restoreSentMatchFingerprints() {
        sentMatchFingerprints.clear();
        const raw = safeSessionGet(STORAGE.sentMatchFingerprints);

        if (!raw) {
            return;
        }

        try {
            const values = JSON.parse(raw);

            if (!Array.isArray(values)) {
                return;
            }

            for (const value of values.slice(-300)) {
                if (typeof value === 'string' && value) {
                    sentMatchFingerprints.add(value);
                }
            }
        } catch (error) {
            safeSessionRemove(STORAGE.sentMatchFingerprints);
        }
    }

    function persistSentMatchFingerprints() {
        const values = [...sentMatchFingerprints].slice(-300);
        safeSessionSet(STORAGE.sentMatchFingerprints, JSON.stringify(values));
    }

    function markSentMatchFingerprint(value) {
        sentMatchFingerprints.add(value);
        persistSentMatchFingerprints();
    }

    function unmarkSentMatchFingerprint(value) {
        sentMatchFingerprints.delete(value);
        persistSentMatchFingerprints();
    }

    function formatDuration(durationMs) {
        const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function truncateLabel(value, maxChars = CONFIG.counterLabelMaxChars) {
        const text = normalizeText(value).replace(/\s+/g, ' ');

        if (text.length <= maxChars) {
            return text;
        }

        return `${text.slice(0, Math.max(1, maxChars - 1))}…`;
    }

    function queryVisible(selectors, scope = document) {
        const results = [];
        const seen = new Set();

        for (const selector of selectors) {
            let elements = [];

            try {
                elements = [...scope.querySelectorAll(selector)];
            } catch (error) {
                continue;
            }

            for (const element of elements) {
                if (seen.has(element) || !isVisible(element)) {
                    continue;
                }

                seen.add(element);
                results.push(element);
            }
        }

        results.sort((a, b) => {
            if (a === b) {
                return 0;
            }

            return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
                ? -1
                : 1;
        });

        return results;
    }

    function getStableAssistantSurfaceId(element, index) {
        const owner = element.closest?.([
            '[data-message-id]',
            '[data-chatgpt-selection-message-id]',
            '[data-content-search-unit-key]',
            '[data-chatgpt-search-unit-key]',
            '[data-testid^="conversation-turn-"]',
        ].join(',')) || element;
        const attributeNames = [
            'data-message-id',
            'data-chatgpt-selection-message-id',
            'data-content-search-unit-key',
            'data-chatgpt-search-unit-key',
            'data-testid',
        ];

        for (const attributeName of attributeNames) {
            const value = normalizeText(owner.getAttribute?.(attributeName));

            if (value) {
                return `${provider.id}:${attributeName}:${value}`;
            }
        }

        return `${provider.id}:assistant-index:${index}`;
    }

    function getKnownAssistantSurface() {
        if (!provider.assistantSelectors.length) {
            return null;
        }

        const elements = queryVisible(provider.assistantSelectors)
            .filter(element => readRenderedText(element));

        if (!elements.length) {
            return null;
        }

        const index = elements.length - 1;
        const element = elements[index];
        const text = readRenderedText(element);

        return {
            id: getElementId(element, `${provider.id}-assistant`),
            stableId: getStableAssistantSurfaceId(element, index),
            type: 'assistant',
            element,
            text,
        };
    }

    function getVisibleAlerts() {
        return queryVisible([
            'aside[role="alert"]',
            '[role="alert"]',
        ])
            .map(element => ({
                id: getElementId(element, 'alert'),
                type: 'alert',
                element,
                text: readRenderedText(element),
            }))
            .filter(surface => surface.text);
    }

    function isForbiddenGenericContainer(element) {
        if (!element || isInsideExtension(element)) {
            return true;
        }

        if (
            element.closest('textarea, input, select, button, nav, form') ||
            element.closest('[contenteditable="true"]')
        ) {
            return true;
        }

        return false;
    }

    function deriveGenericSurfaceElement(startElement) {
        if (!(startElement instanceof Element)) {
            return null;
        }

        if (isForbiddenGenericContainer(startElement)) {
            return null;
        }

        const preferredSelector = [
            'article',
            '[role="article"]',
            '[role="listitem"]',
            '[data-message-id]',
            '[data-testid*="message" i]',
            '[data-testid*="response" i]',
            '[class*="assistant" i]',
            '[class*="response" i]',
            '[class*="message" i]',
            '[class*="markdown" i]',
            '[class*="prose" i]',
        ].join(',');

        let current = startElement;
        let fallback = null;

        for (let depth = 0; current && depth < 7; depth += 1) {
            if (
                current === document.body ||
                current === document.documentElement ||
                isForbiddenGenericContainer(current)
            ) {
                break;
            }

            const text = readRenderedText(current);

            if (text.length >= 4 && text.length <= 60000 && isVisible(current)) {
                fallback = current;

                try {
                    if (current.matches(preferredSelector)) {
                        return current;
                    }
                } catch (error) {
                    return fallback;
                }
            }

            if (current.tagName === 'MAIN') {
                break;
            }

            current = current.parentElement;
        }

        return fallback;
    }

    function rememberGenericElement(element) {
        const surfaceElement = deriveGenericSurfaceElement(element);

        if (!surfaceElement) {
            return;
        }

        const id = getElementId(surfaceElement, 'generic');
        recentGenericElements.set(id, {
            element: surfaceElement,
            changedAt: Date.now(),
        });

        if (recentGenericElements.size > CONFIG.genericSurfaceLimit * 3) {
            pruneGenericElements();
        }
    }

    function rememberMutation(mutation) {
        if (mutation.type === 'characterData') {
            rememberGenericElement(mutation.target.parentElement);
            return;
        }

        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                rememberGenericElement(node.parentElement);
                continue;
            }

            if (node instanceof Element) {
                rememberGenericElement(node);
            }
        }

        if (mutation.target instanceof Element) {
            rememberGenericElement(mutation.target);
        }
    }

    function pruneGenericElements() {
        const cutoff = Date.now() - CONFIG.genericSurfaceMaxAgeMs;

        for (const [id, entry] of recentGenericElements.entries()) {
            if (
                entry.changedAt < cutoff ||
                !entry.element?.isConnected
            ) {
                recentGenericElements.delete(id);
            }
        }

        const ordered = [...recentGenericElements.entries()]
            .sort((a, b) => b[1].changedAt - a[1].changedAt)
            .slice(0, CONFIG.genericSurfaceLimit);

        recentGenericElements.clear();

        for (const [id, entry] of ordered) {
            recentGenericElements.set(id, entry);
        }
    }

    function getGenericSurfaces() {
        pruneGenericElements();

        return [...recentGenericElements.entries()]
            .sort((a, b) => b[1].changedAt - a[1].changedAt)
            .map(([id, entry]) => ({
                id,
                type: 'generic',
                element: entry.element,
                text: readRenderedText(entry.element),
            }))
            .filter(surface => surface.text && isVisible(surface.element));
    }

    function getTextSurfaces() {
        const surfaces = [...getVisibleAlerts()];
        const assistant = getKnownAssistantSurface();

        if (assistant) {
            surfaces.push(assistant);
            return surfaces;
        }

        surfaces.push(...getGenericSurfaces());
        return surfaces;
    }

    function updateSurfaceStability(surface) {
        const now = Date.now();
        const previous = surfaceStates.get(surface.id);

        if (!previous || previous.text !== surface.text) {
            surfaceStates.set(surface.id, {
                text: surface.text,
                stableSince: now,
            });
            return false;
        }

        return now - previous.stableSince >= CONFIG.stabilityMs;
    }

    function buildSurfaceStateKey(surface) {
        return `${surface.id}|${hashText(surface.text)}`;
    }

    function buildProcessedKey(surface, rule) {
        return `${buildSurfaceStateKey(surface)}|${rule.id}`;
    }

    function buildStableMatchFingerprint(surface, rule) {
        return [
            rule.id,
            surface.stableId || surface.id,
            hashText(normalizeForMatch(rule.expectedText)),
            hashText(normalizeForMatch(rule.responseText)),
            hashText(normalizeForMatch(surface.text)),
        ].join('|');
    }

    function ruleMatchesSurface(rule, surface) {
        const expected = normalizeForMatch(rule.expectedText);
        const visibleText = normalizeForMatch(surface.text);
        return Boolean(expected && visibleText.includes(expected));
    }

    function findFirstMatch(surfaces) {
        for (const rule of rules) {
            for (const surface of surfaces) {
                const stateKey = buildSurfaceStateKey(surface);

                if (completedSurfaceStates.has(stateKey)) {
                    continue;
                }

                if (!ruleMatchesSurface(rule, surface)) {
                    continue;
                }

                const processedKey = buildProcessedKey(surface, rule);
                const stableFingerprint = buildStableMatchFingerprint(surface, rule);

                if (
                    processedMatches.has(processedKey) ||
                    sentMatchFingerprints.has(stableFingerprint)
                ) {
                    continue;
                }

                return {
                    rule,
                    surface,
                    processedKey,
                    stableFingerprint,
                };
            }
        }

        return null;
    }

    function resetDetectionState() {
        surfaceStates.clear();
        processedMatches.clear();
        completedSurfaceStates.clear();
        recentGenericElements.clear();
    }

    function markCurrentSurfacesAsProcessed() {
        const surfaces = getTextSurfaces();
        const now = Date.now();

        for (const surface of surfaces) {
            surfaceStates.set(surface.id, {
                text: surface.text,
                stableSince: now,
            });

            completedSurfaceStates.add(buildSurfaceStateKey(surface));
        }
    }

    function firstVisibleElement(selectors, scope = document) {
        const elements = queryVisible(selectors, scope);
        return elements[0] || null;
    }

    function isGenerating() {
        const selectors = [
            ...provider.stopSelectors,
            ...GENERIC_STOP_SELECTORS,
        ];

        return Boolean(firstVisibleElement(selectors));
    }

    function getLatestResponseSignature() {
        const assistant = getKnownAssistantSurface();

        if (assistant?.text) {
            return hashText(assistant.text);
        }

        const generic = getGenericSurfaces()[0];
        return generic?.text ? hashText(generic.text) : '';
    }

    function persistGenerationStart() {
        if (generationStartedAt === null) {
            safeSessionRemove(STORAGE.generationStartedAt);
            return;
        }

        safeSessionSet(STORAGE.generationStartedAt, String(generationStartedAt));
    }

    function restoreGenerationTimer() {
        const raw = Number(safeSessionGet(STORAGE.generationStartedAt));
        const now = Date.now();

        if (!Number.isFinite(raw) || raw <= 0 || raw > now || now - raw > 86400000) {
            safeSessionRemove(STORAGE.generationStartedAt);
            generationStartedAt = null;
            generationObservedResponse = false;
            generationLastResponseChangeAt = null;
            generationLastSurfaceSignature = getLatestResponseSignature();
            generationSawActiveSignal = false;
            return;
        }

        generationStartedAt = raw;
        generationObservedResponse = false;
        generationLastResponseChangeAt = null;
        generationLastSurfaceSignature = getLatestResponseSignature();
        generationSawActiveSignal = isGenerating();
    }

    function startGenerationTimer(startedAt = Date.now()) {
        if (generationStartedAt !== null) {
            return;
        }

        generationStartedAt = startedAt;
        generationObservedResponse = false;
        generationLastResponseChangeAt = null;
        generationLastSurfaceSignature = getLatestResponseSignature();
        generationSawActiveSignal = isGenerating();
        persistGenerationStart();
        updateInterface();
    }

    function noteGenerationResponseProgress(allowStart = false) {
        const signature = getLatestResponseSignature();

        if (!signature || signature === generationLastSurfaceSignature) {
            return;
        }

        const now = Date.now();

        if (generationStartedAt === null) {
            generationLastSurfaceSignature = signature;

            if (!allowStart) {
                return;
            }

            generationStartedAt = now;
            generationSawActiveSignal = isGenerating();
            persistGenerationStart();
        } else {
            generationLastSurfaceSignature = signature;
        }

        generationObservedResponse = true;
        generationLastResponseChangeAt = now;
        updateInterface();
    }

    function finishGenerationTimer(finishedAt = Date.now()) {
        if (generationStartedAt === null) {
            return;
        }

        const safeFinishedAt = Math.max(generationStartedAt, finishedAt);
        const durationMs = safeFinishedAt - generationStartedAt;
        generationStartedAt = null;
        generationObservedResponse = false;
        generationLastResponseChangeAt = null;
        generationSawActiveSignal = false;
        safeSessionRemove(STORAGE.generationStartedAt);

        if (durationMs >= CONFIG.generationMinimumMs) {
            recordGenerationTime(durationMs);
        }

        updateInterface();
    }

    function monitorGenerationTime() {
        const now = Date.now();
        const generating = isGenerating();

        if (generating && generationStartedAt === null) {
            startGenerationTimer(now);
        }

        if (generationStartedAt === null) {
            generationLastSurfaceSignature = getLatestResponseSignature();
            return;
        }

        if (generating) {
            generationSawActiveSignal = true;
        }

        noteGenerationResponseProgress(false);
        updateInterface();

        if (generating) {
            return;
        }

        if (
            generationObservedResponse &&
            generationLastResponseChangeAt !== null &&
            now - generationLastResponseChangeAt >= CONFIG.generationQuietMs
        ) {
            finishGenerationTimer(generationLastResponseChangeAt);
            return;
        }

        if (
            generationSawActiveSignal &&
            generationObservedResponse &&
            generationLastResponseChangeAt !== null &&
            now - generationLastResponseChangeAt >= 700
        ) {
            finishGenerationTimer(generationLastResponseChangeAt);
        }
    }

    function isComposerCandidate(element) {
        if (!element || !isVisible(element) || isInsideExtension(element)) {
            return false;
        }

        if (
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLInputElement
        ) {
            return !element.disabled && !element.readOnly;
        }

        return element.getAttribute('contenteditable') === 'true';
    }

    function composerScore(element) {
        if (!isComposerCandidate(element)) {
            return -1000;
        }

        let score = 0;
        const rect = element.getBoundingClientRect();
        const label = normalizeForMatch([
            element.getAttribute('placeholder'),
            element.getAttribute('aria-label'),
            element.getAttribute('data-placeholder'),
        ].filter(Boolean).join(' '));

        if (element.closest('form')) {
            score += 8;
        }

        if (element.getAttribute('role') === 'textbox') {
            score += 4;
        }

        if (element.getAttribute('contenteditable') === 'true') {
            score += 3;
        }

        if (rect.width >= 240) {
            score += 4;
        }

        if (rect.bottom >= window.innerHeight * 0.45) {
            score += 5;
        }

        if (/prompt|message|ask|chat|write|type|question/.test(label)) {
            score += 8;
        }

        if (/search|filter|find/.test(label)) {
            score -= 15;
        }

        return score;
    }

    function getComposer() {
        const providerCandidates = queryVisible(provider.composerSelectors)
            .filter(isComposerCandidate)
            .map(element => ({
                element,
                score: composerScore(element) + 20,
            }))
            .sort((a, b) => b.score - a.score);

        if (providerCandidates[0]?.score >= 0) {
            return providerCandidates[0].element;
        }

        const candidates = queryVisible(GENERIC_COMPOSER_SELECTORS)
            .filter(isComposerCandidate)
            .map(element => ({
                element,
                score: composerScore(element),
            }))
            .sort((a, b) => b.score - a.score);

        return candidates[0]?.score >= 0
            ? candidates[0].element
            : null;
    }

    function getComposerText(composer) {
        return readRenderedText(composer);
    }

    function setNativeValue(element, text) {
        const prototype = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;

        const setter = Object.getOwnPropertyDescriptor(
            prototype,
            'value'
        )?.set;

        if (setter) {
            setter.call(element, text);
        } else {
            element.value = text;
        }
    }

    function fillComposer(composer, text) {
        composer.focus({ preventScroll: true });

        if (
            composer instanceof HTMLTextAreaElement ||
            composer instanceof HTMLInputElement
        ) {
            setNativeValue(composer, text);
            composer.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                composed: true,
                inputType: 'insertText',
                data: text,
            }));
            composer.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection.removeAllRanges();
        selection.addRange(range);

        let inserted = false;

        try {
            inserted = document.execCommand('insertText', false, text);
        } catch (error) {
            inserted = false;
        }

        if (!inserted) {
            composer.textContent = text;
        }

        composer.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertText',
            data: text,
        }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function buttonLooksLikeSend(button) {
        if (!(button instanceof HTMLButtonElement) || !isVisible(button)) {
            return false;
        }

        if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        const descriptor = normalizeForMatch([
            button.getAttribute('aria-label'),
            button.getAttribute('title'),
            button.getAttribute('data-testid'),
            button.getAttribute('data-test-id'),
            button.innerText,
        ].filter(Boolean).join(' '));

        if (/stop|cancel|attach|upload|microphone|voice|record/.test(descriptor)) {
            return false;
        }

        return (
            button.type === 'submit' ||
            /send|submit|enviar|envoyer|senden|invia|gonder/.test(descriptor)
        );
    }

    function getSendButton(composer) {
        const form = composer.closest('form');

        if (form) {
            const formButton = queryVisible([
                ...provider.sendSelectors,
                ...GENERIC_SEND_SELECTORS,
            ], form).find(buttonLooksLikeSend);

            if (formButton) {
                return formButton;
            }
        }

        const providerButton = queryVisible(provider.sendSelectors)
            .find(buttonLooksLikeSend);

        if (providerButton) {
            return providerButton;
        }

        return queryVisible(GENERIC_SEND_SELECTORS)
            .filter(buttonLooksLikeSend)
            .map(button => {
                const buttonRect = button.getBoundingClientRect();
                const composerRect = composer.getBoundingClientRect();
                const distance = Math.abs(buttonRect.left - composerRect.right) +
                    Math.abs(buttonRect.top - composerRect.top);
                return { button, distance };
            })
            .sort((a, b) => a.distance - b.distance)[0]?.button || null;
    }

    async function sendMessage(message) {
        for (
            let attempt = 1;
            attempt <= CONFIG.sendAttempts;
            attempt += 1
        ) {
            if (!isEnabled()) {
                return false;
            }

            if (isGenerating()) {
                await sleep(CONFIG.sendAttemptIntervalMs);
                continue;
            }

            const composer = getComposer();

            if (!composer) {
                await sleep(CONFIG.sendAttemptIntervalMs);
                continue;
            }

            const currentText = getComposerText(composer);

            if (
                currentText &&
                normalizeForMatch(currentText) !== normalizeForMatch(message)
            ) {
                console.warn(
                    '[AI Flow Automator] Composer contains user text. Automation turned OFF.'
                );
                setEnabled(false);
                return false;
            }

            if (!currentText) {
                fillComposer(composer, message);
                await sleep(160);
            }

            if (
                normalizeForMatch(getComposerText(composer)) !==
                normalizeForMatch(message)
            ) {
                await sleep(CONFIG.sendAttemptIntervalMs);
                continue;
            }

            const sendButton = getSendButton(composer);

            if (sendButton) {
                const sentAt = Date.now();
                startGenerationTimer(sentAt);
                sendButton.click();
                await sleep(220);
                return true;
            }

            const form = composer.closest('form');

            if (form && typeof form.requestSubmit === 'function') {
                try {
                    const sentAt = Date.now();
                    startGenerationTimer(sentAt);
                    form.requestSubmit();
                    await sleep(220);
                    return true;
                } catch (error) {
                    console.warn('[AI Flow Automator] requestSubmit failed.', error);
                }
            }

            await sleep(CONFIG.sendAttemptIntervalMs);
        }

        console.error(
            `[AI Flow Automator] Could not send configured response: ${message}`
        );
        setEnabled(false);
        return false;
    }

    async function checkFlow() {
        if (!isEnabled() || processing) {
            return;
        }

        processing = true;

        try {
            if (isGenerating()) {
                return;
            }

            const surfaces = getTextSurfaces();

            if (!surfaces.length || !rules.length) {
                return;
            }

            const stableSurfaces = surfaces.filter(updateSurfaceStability);

            if (!stableSurfaces.length) {
                return;
            }

            const match = findFirstMatch(stableSurfaces);

            if (!match) {
                return;
            }

            processedMatches.add(match.processedKey);

            console.info('[AI Flow Automator] Rule matched.', {
                provider: provider.name,
                expectedText: match.rule.expectedText,
                responseText: match.rule.responseText,
                surface: match.surface.type,
            });

            await sleep(preferences.sendDelayMs);

            if (!isEnabled() || isGenerating()) {
                processedMatches.delete(match.processedKey);
                return;
            }

            if (generationStartedAt !== null) {
                finishGenerationTimer(
                    generationLastResponseChangeAt || Date.now()
                );
            }

            markSentMatchFingerprint(match.stableFingerprint);
            const sent = await sendMessage(match.rule.responseText);

            if (sent) {
                completedSurfaceStates.add(buildSurfaceStateKey(match.surface));
                incrementResponseCount(match.rule.responseText);
            } else {
                unmarkSentMatchFingerprint(match.stableFingerprint);

                if (isEnabled()) {
                    processedMatches.delete(match.processedKey);
                }
            }
        } catch (error) {
            console.error('[AI Flow Automator] Internal error.', error);
        } finally {
            processing = false;
        }
    }

    function scheduleCheck() {
        if (scheduledCheck) {
            return;
        }

        scheduledCheck = window.setTimeout(() => {
            scheduledCheck = null;
            void checkFlow();
        }, CONFIG.observerDelayMs);
    }

    function mutationTouchesAssistantResponse(mutation) {
        const rawTarget = mutation?.target;
        const target = rawTarget instanceof Element
            ? rawTarget
            : rawTarget?.parentElement;

        if (!target || isInsideExtension(target)) {
            return false;
        }

        for (const selector of provider.assistantSelectors) {
            try {
                if (target.matches?.(selector) || target.closest?.(selector)) {
                    return true;
                }
            } catch (error) {
                continue;
            }
        }

        const genericSurface = deriveGenericSurfaceElement(target);
        return Boolean(genericSurface && readRenderedText(genericSurface));
    }

    function noteGenerationMutation(mutations) {
        if (generationStartedAt === null) {
            noteGenerationResponseProgress(Boolean(getKnownAssistantSurface()));
            return;
        }

        const touchedResponse = mutations.some(mutationTouchesAssistantResponse);

        if (touchedResponse) {
            noteGenerationResponseProgress(false);
            return;
        }

        noteGenerationResponseProgress(false);
    }

    function startObserver() {
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                rememberMutation(mutation);
            }

            noteGenerationMutation(mutations);

            if (isEnabled()) {
                scheduleCheck();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        return observer;
    }

    function trashIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<path d="M3.8 6.5h16.4M9 3.5h6l.9 3H8.1l.9-3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
            '<path d="m6.8 6.5.8 13a1.7 1.7 0 0 0 1.7 1.5h5.4a1.7 1.7 0 0 0 1.7-1.5l.8-13M10 10.5v6.5M14 10.5v6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
            '</svg>',
        ].join('');
    }

    function gearIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h7M15 18h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
            '<circle cx="15" cy="6" r="2" stroke="currentColor" stroke-width="1.8"/>',
            '<circle cx="9" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/>',
            '<circle cx="13" cy="18" r="2" stroke="currentColor" stroke-width="1.8"/>',
            '</svg>',
        ].join('');
    }

    function playIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<path d="M8.2 6.2v11.6c0 .9 1 1.4 1.8.9l8.1-5.8a1.1 1.1 0 0 0 0-1.8L10 5.3c-.8-.5-1.8 0-1.8.9Z" fill="currentColor"/>',
            '</svg>',
        ].join('');
    }

    function stopIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<rect x="7" y="7" width="10" height="10" rx="1.7" fill="currentColor"/>',
            '</svg>',
        ].join('');
    }

    function clockIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/>',
            '<path d="M12 7.5v5l3.3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
            '</svg>',
        ].join('');
    }

    function dragHandleSvg() {
        return [
            '<svg viewBox="0 0 20 12" fill="currentColor" aria-hidden="true">',
            '<circle cx="6" cy="2" r="1.15"/><circle cx="10" cy="2" r="1.15"/><circle cx="14" cy="2" r="1.15"/>',
            '<circle cx="6" cy="6" r="1.15"/><circle cx="10" cy="6" r="1.15"/><circle cx="14" cy="6" r="1.15"/>',
            '<circle cx="6" cy="10" r="1.15"/><circle cx="10" cy="10" r="1.15"/><circle cx="14" cy="10" r="1.15"/>',
            '</svg>',
        ].join('');
    }

    function removeIconSvg() {
        return [
            '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">',
            '<path d="m7 7 10 10M17 7 7 17" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
            '</svg>',
        ].join('');
    }

    function makeRuleRow(rule = {}) {
        const row = document.createElement('tr');
        row.dataset.ruleId = rule.id || createId();

        const expectedCell = document.createElement('td');
        const expectedInput = document.createElement('textarea');
        expectedInput.rows = 2;
        expectedInput.className = 'aiflow-rule-input';
        expectedInput.dataset.field = 'expectedText';
        expectedInput.placeholder = 'Text to find in the AI response';
        expectedInput.value = rule.expectedText || '';
        expectedCell.appendChild(expectedInput);

        const responseCell = document.createElement('td');
        const responseInput = document.createElement('textarea');
        responseInput.rows = 2;
        responseInput.className = 'aiflow-rule-input';
        responseInput.dataset.field = 'responseText';
        responseInput.placeholder = 'Text to send';
        responseInput.value = rule.responseText || '';
        responseCell.appendChild(responseInput);

        const actionCell = document.createElement('td');
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'aiflow-icon-button';
        removeButton.title = 'Remove rule';
        removeButton.setAttribute('aria-label', 'Remove rule');
        removeButton.innerHTML = removeIconSvg();
        removeButton.addEventListener('click', () => row.remove());
        actionCell.appendChild(removeButton);

        row.appendChild(expectedCell);
        row.appendChild(responseCell);
        row.appendChild(actionCell);
        return row;
    }

    function renderRulesEditor() {
        const body = document.getElementById('aiflow-rules-body');

        if (!body) {
            return;
        }

        body.replaceChildren();

        const rows = rules.length ? rules : [{}];

        for (const rule of rows) {
            body.appendChild(makeRuleRow(rule));
        }
    }

    function readRulesFromEditor() {
        const rows = [
            ...document.querySelectorAll('#aiflow-rules-body tr'),
        ];

        return rows.map(row => ({
            id: row.dataset.ruleId || createId(),
            expectedText: row.querySelector('[data-field="expectedText"]')?.value || '',
            responseText: row.querySelector('[data-field="responseText"]')?.value || '',
        }));
    }

    function renderPreferencesEditor() {
        const theme = document.getElementById('aiflow-theme');
        const accent = document.getElementById('aiflow-accent');
        const sendDelay = document.getElementById('aiflow-send-delay');

        if (theme) {
            theme.value = preferences.theme;
        }

        if (accent) {
            accent.value = preferences.accent;
        }

        if (sendDelay) {
            sendDelay.value = String(preferences.sendDelayMs / 1000);
        }
    }

    function readPreferencesFromEditor() {
        const theme = document.getElementById('aiflow-theme')?.value || 'light';
        const accent = document.getElementById('aiflow-accent')?.value || 'green';
        const delaySeconds = Number(document.getElementById('aiflow-send-delay')?.value);
        const sendDelayMs = Number.isFinite(delaySeconds)
            ? Math.round(Math.max(0, Math.min(60, delaySeconds)) * 1000)
            : preferences.sendDelayMs;

        return { theme, accent, sendDelayMs };
    }

    function applyTheme(
        theme = preferences.theme,
        accent = preferences.accent
    ) {
        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
            root.dataset.accent = accent || DEFAULT_PREFERENCES.accent;
        }
    }

    function setSettingsStatus(text, isError = false) {
        const status = document.getElementById('aiflow-settings-status');

        if (!status) {
            return;
        }

        status.textContent = text;
        status.dataset.error = isError ? '1' : '0';

        window.setTimeout(() => {
            if (status.textContent === text) {
                status.textContent = '';
            }
        }, 1800);
    }

    function chooseSettingsPlacement() {
        const root = document.getElementById(ROOT_ID);

        if (!root || !widgetVisible) {
            return 'below';
        }

        const rect = root.getBoundingClientRect();
        const spaceAbove = Math.max(0, rect.top - 8);
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);

        return spaceBelow >= 430 || spaceBelow >= spaceAbove
            ? 'below'
            : 'above';
    }

    function placeSettings(placement) {
        const shell = document.getElementById('aiflow-shell');
        const settings = document.getElementById('aiflow-settings');
        const topBar = document.getElementById('aiflow-topbar');

        if (!shell || !settings || !topBar) {
            return;
        }

        if (placement === 'above') {
            shell.insertBefore(settings, topBar);
        } else {
            shell.appendChild(settings);
        }
    }

    function setSettingsOpen(value, persist = true) {
        const root = document.getElementById(ROOT_ID);
        const settings = document.getElementById('aiflow-settings');
        const open = Boolean(value);

        if (root && settings) {
            if (open) {
                const placement = chooseSettingsPlacement();
                root.dataset.settingsPlacement = placement;
                root.dataset.settingsOpen = '1';
                placeSettings(placement);
                settings.hidden = false;
                window.requestAnimationFrame(ensureWidgetInViewport);
            } else {
                settings.hidden = true;
                root.dataset.settingsOpen = '0';
                window.requestAnimationFrame(ensureWidgetInViewport);
            }
        }

        if (persist) {
            safeSessionSet(STORAGE.settingsOpen, open ? '1' : '0');
        }
    }

    function readStoredPosition() {
        const raw = safeSessionGet(STORAGE.position);

        if (!raw) {
            return null;
        }

        try {
            const value = JSON.parse(raw);
            const left = Number(value?.left);
            const top = Number(value?.top);

            if (!Number.isFinite(left) || !Number.isFinite(top)) {
                return null;
            }

            return { left, top };
        } catch (error) {
            return null;
        }
    }

    function persistWidgetPosition(left, top) {
        safeSessionSet(STORAGE.position, JSON.stringify({
            left: Math.round(left),
            top: Math.round(top),
        }));
    }

    function setWidgetPosition(left, top, persist = false) {
        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const shell = document.getElementById('aiflow-shell');
        const width = shell?.offsetWidth || 350;
        const height = shell?.offsetHeight || 150;
        const safeLeft = Math.max(6, Math.min(window.innerWidth - width - 6, left));
        const safeTop = Math.max(6, Math.min(window.innerHeight - height - 6, top));

        root.style.setProperty('left', `${safeLeft}px`, 'important');
        root.style.setProperty('top', `${safeTop}px`, 'important');
        root.style.setProperty('right', 'auto', 'important');
        root.style.setProperty('bottom', 'auto', 'important');
        root.dataset.positioned = '1';

        if (persist) {
            persistWidgetPosition(safeLeft, safeTop);
        }
    }

    function applyStoredPosition() {
        const position = readStoredPosition();

        if (position) {
            setWidgetPosition(position.left, position.top, false);
        }
    }

    function ensureWidgetInViewport() {
        const root = document.getElementById(ROOT_ID);

        if (!root || root.dataset.positioned !== '1') {
            return;
        }

        const rect = root.getBoundingClientRect();
        setWidgetPosition(rect.left, rect.top, true);
    }

    function installDragHandle(handle, root) {
        let drag = null;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) {
                return;
            }

            const rect = root.getBoundingClientRect();
            drag = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };

            root.dataset.dragging = '1';
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            setWidgetPosition(
                event.clientX - drag.offsetX,
                event.clientY - drag.offsetY,
                false
            );
            event.preventDefault();
        });

        const finish = event => {
            if (!drag || drag.pointerId !== event.pointerId) {
                return;
            }

            const rect = root.getBoundingClientRect();
            persistWidgetPosition(rect.left, rect.top);
            root.dataset.dragging = '0';
            drag = null;
            handle.releasePointerCapture?.(event.pointerId);
        };

        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
    }

    function createInterface() {
        if (document.getElementById(ROOT_ID)) {
            return;
        }

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.dataset.visible = '0';
        root.dataset.theme = preferences.theme;
        root.dataset.accent = preferences.accent || DEFAULT_PREFERENCES.accent;
        root.dataset.settingsOpen = '0';
        root.dataset.settingsPlacement = 'below';

        const shell = document.createElement('div');
        shell.id = 'aiflow-shell';

        const dragHandle = document.createElement('button');
        dragHandle.id = 'aiflow-drag-handle';
        dragHandle.type = 'button';
        dragHandle.title = 'Drag AI Flow Automator';
        dragHandle.setAttribute('aria-label', 'Drag AI Flow Automator');
        dragHandle.innerHTML = dragHandleSvg();

        const topBar = document.createElement('div');
        topBar.id = 'aiflow-topbar';

        const toggle = document.createElement('button');
        toggle.id = 'aiflow-toggle';
        toggle.type = 'button';
        toggle.innerHTML = [
            '<span id="aiflow-toggle-icon" aria-hidden="true"></span>',
            '<span id="aiflow-toggle-label">AI Flow Automator: OFF</span>',
            '<span id="aiflow-live-timer" hidden>',
            clockIconSvg(),
            '<span id="aiflow-live-timer-text">00:00</span>',
            '</span>',
        ].join('');
        toggle.addEventListener('click', () => {
            const enable = !isEnabled();

            if (enable) {
                resetDetectionState();
                markCurrentSurfacesAsProcessed();
            }

            setEnabled(enable);

            if (enable) {
                scheduleCheck();
            }
        });

        const settingsToggle = document.createElement('button');
        settingsToggle.id = 'aiflow-settings-toggle';
        settingsToggle.type = 'button';
        settingsToggle.title = 'Settings';
        settingsToggle.setAttribute('aria-label', 'Open settings');
        settingsToggle.innerHTML = gearIconSvg();
        settingsToggle.addEventListener('click', () => {
            const settings = document.getElementById('aiflow-settings');
            const willOpen = Boolean(settings?.hidden);

            if (willOpen) {
                renderRulesEditor();
                renderPreferencesEditor();
                applyTheme();
            }

            setSettingsOpen(willOpen);
        });

        topBar.appendChild(toggle);
        topBar.appendChild(settingsToggle);
        topBar.appendChild(dragHandle);

        const counters = document.createElement('div');
        counters.id = 'aiflow-counters';

        const history = document.createElement('div');
        history.id = 'aiflow-history';

        const historyText = document.createElement('span');
        historyText.id = 'aiflow-history-text';

        const trash = document.createElement('button');
        trash.id = 'aiflow-trash';
        trash.type = 'button';
        trash.title = 'Clear response counters and generation times';
        trash.setAttribute('aria-label', 'Clear response counters and generation times');
        trash.innerHTML = trashIconSvg();
        trash.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            clearMetrics();
        });

        history.appendChild(historyText);
        history.appendChild(trash);
        shell.appendChild(topBar);
        shell.appendChild(counters);
        shell.appendChild(history);

        const settings = document.createElement('div');
        settings.id = 'aiflow-settings';
        settings.hidden = true;
        settings.innerHTML = `
            <div class="aiflow-settings-header">
                <div class="aiflow-settings-title">Rules</div>
                <div class="aiflow-settings-meta">
                    <span>Provider: <strong id="aiflow-provider"></strong></span>
                    <span>Shortcut: <strong>Ctrl+Alt+A</strong></span>
                </div>
            </div>
            <div class="aiflow-preferences">
                <label class="aiflow-field">
                    <span>Theme</span>
                    <select id="aiflow-theme">
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                    </select>
                </label>
                <label class="aiflow-field">
                    <span>Accent</span>
                    <select id="aiflow-accent">
                        <option value="green">Green</option>
                        <option value="blue">Blue</option>
                        <option value="violet">Violet</option>
                        <option value="rose">Rose</option>
                        <option value="orange">Orange</option>
                        <option value="cyan">Cyan</option>
                        <option value="indigo">Indigo</option>
                    </select>
                </label>
                <label class="aiflow-field">
                    <span>Send delay</span>
                    <div class="aiflow-delay-input">
                        <input id="aiflow-send-delay" type="number" min="0" max="60" step="0.1" inputmode="decimal">
                        <span>seconds</span>
                    </div>
                </label>
            </div>
            <div class="aiflow-settings-help">
                Only rendered DOM text is inspected. Rules are evaluated from top to bottom; the first match wins.
            </div>
            <div class="aiflow-table-wrap">
                <table id="aiflow-rules-table">
                    <thead>
                        <tr>
                            <th>Expected text</th>
                            <th>Response text</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody id="aiflow-rules-body"></tbody>
                </table>
            </div>
            <div class="aiflow-settings-actions">
                <button type="button" id="aiflow-add-rule">+ Add rule</button>
                <span id="aiflow-settings-status" aria-live="polite"></span>
                <div class="aiflow-settings-actions-right">
                    <button type="button" id="aiflow-back-settings">Back</button>
                    <button type="button" id="aiflow-save-rules">Save</button>
                </div>
            </div>
        `;

        shell.appendChild(settings);
        root.appendChild(shell);
        document.body.appendChild(root);
        installDragHandle(dragHandle, root);
        applyStoredPosition();
        applyTheme();

        const providerLabel = document.getElementById('aiflow-provider');
        if (providerLabel) {
            providerLabel.textContent = provider.name;
        }

        document.getElementById('aiflow-add-rule')?.addEventListener('click', () => {
            document.getElementById('aiflow-rules-body')?.appendChild(makeRuleRow());
        });

        document.getElementById('aiflow-theme')?.addEventListener('change', event => {
            applyTheme(event.target?.value, document.getElementById('aiflow-accent')?.value);
        });

        document.getElementById('aiflow-accent')?.addEventListener('change', event => {
            applyTheme(document.getElementById('aiflow-theme')?.value, event.target?.value);
        });

        document.getElementById('aiflow-back-settings')?.addEventListener('click', () => {
            renderRulesEditor();
            renderPreferencesEditor();
            applyTheme();
            setSettingsStatus('');
            setSettingsOpen(false);
        });

        document.getElementById('aiflow-save-rules')?.addEventListener('click', async () => {
            try {
                await saveRules(readRulesFromEditor());
                await savePreferences(readPreferencesFromEditor());
                renderRulesEditor();
                renderPreferencesEditor();
                setSettingsOpen(false);
            } catch (error) {
                setSettingsStatus('Save failed', true);
            }
        });

        renderRulesEditor();
        renderPreferencesEditor();
        setSettingsOpen(safeSessionGet(STORAGE.settingsOpen) === '1', false);
        updateInterface();
    }

    function getConfiguredResponses() {
        const seen = new Set();
        const responses = [];

        for (const rule of rules) {
            const response = normalizeText(rule.responseText);
            const key = normalizeForMatch(response);

            if (!response || seen.has(key)) {
                continue;
            }

            seen.add(key);
            responses.push(response);
        }

        return responses;
    }

    function updateCounters() {
        const container = document.getElementById('aiflow-counters');

        if (!container) {
            return;
        }

        const counts = readResponseCounts();
        const responses = getConfiguredResponses();
        container.replaceChildren();

        if (!responses.length) {
            const empty = document.createElement('span');
            empty.className = 'aiflow-empty';
            empty.textContent = 'No response rules configured';
            container.appendChild(empty);
            return;
        }

        for (const response of responses) {
            const badge = document.createElement('span');
            badge.className = 'aiflow-counter';
            badge.title = response;
            badge.textContent = `${truncateLabel(response)}: ${Number(counts[response] || 0)}`;
            container.appendChild(badge);
        }
    }

    function updateHistory() {
        const historyText = document.getElementById('aiflow-history-text');

        if (!historyText) {
            return;
        }

        const history = readTimeHistory();
        historyText.textContent = history.length
            ? `Last: ${history.map(formatDuration).join(' | ')}`
            : 'Last: -';
    }

    function updateToggle() {
        const button = document.getElementById('aiflow-toggle');
        const icon = document.getElementById('aiflow-toggle-icon');
        const label = document.getElementById('aiflow-toggle-label');
        const liveTimer = document.getElementById('aiflow-live-timer');
        const liveTimerText = document.getElementById('aiflow-live-timer-text');

        if (!button || !icon || !label) {
            return;
        }

        const enabled = isEnabled();
        button.dataset.enabled = enabled ? '1' : '0';
        icon.innerHTML = enabled ? stopIconSvg() : playIconSvg();
        label.textContent = enabled
            ? 'AI Flow Automator: ON'
            : 'AI Flow Automator: OFF';

        if (liveTimer && liveTimerText) {
            liveTimer.hidden = generationStartedAt === null;

            if (generationStartedAt !== null) {
                liveTimerText.textContent = formatDuration(Date.now() - generationStartedAt);
            }
        }
    }

    function updateInterface() {
        updateToggle();
        updateCounters();
        updateHistory();
    }

    function setWidgetVisible(value, persist = true) {
        widgetVisible = Boolean(value);
        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.dataset.visible = widgetVisible ? '1' : '0';
        }

        if (persist) {
            safeSessionSet(STORAGE.visible, widgetVisible ? '1' : '0');
        }

        if (widgetVisible) {
            window.requestAnimationFrame(ensureWidgetInViewport);
        }
    }

    function toggleWidgetVisibility() {
        const now = Date.now();

        if (now - lastVisibilityToggleAt < CONFIG.visibilityToggleDebounceMs) {
            return;
        }

        lastVisibilityToggleAt = now;
        setWidgetVisible(!widgetVisible);
    }

    function isShortcut(event) {
        if (event.code !== 'KeyA' || event.shiftKey) {
            return false;
        }

        if (event.getModifierState?.('AltGraph')) {
            return false;
        }

        if (navigator.platform.toLowerCase().includes('mac')) {
            return event.metaKey && event.altKey && !event.ctrlKey;
        }

        return event.ctrlKey && event.altKey && !event.metaKey;
    }

    function installShortcutFallback() {
        document.addEventListener('keydown', event => {
            if (!isShortcut(event)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            toggleWidgetVisibility();
        }, true);
    }

    function installGenerationHooks() {
        document.addEventListener('click', event => {
            const button = event.target instanceof Element
                ? event.target.closest('button')
                : null;
            const composer = getComposer();
            const composerText = composer ? getComposerText(composer) : '';

            if (button && buttonLooksLikeSend(button)) {
                startGenerationTimer();
                return;
            }

            if (!button || !composer || !composerText) {
                return;
            }

            const buttonRect = button.getBoundingClientRect();
            const composerRect = composer.getBoundingClientRect();
            const nearComposer = Math.abs(buttonRect.left - composerRect.right) <= 220 &&
                Math.abs(buttonRect.top - composerRect.top) <= 140;

            if (!nearComposer) {
                return;
            }

            window.setTimeout(() => {
                if (!getComposerText(composer) || isGenerating()) {
                    startGenerationTimer();
                }
            }, 80);
        }, true);

        document.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
                return;
            }

            const target = event.target instanceof Element
                ? event.target.closest('textarea, input, [contenteditable="true"]')
                : null;

            if (target && isComposerCandidate(target) && getComposerText(target)) {
                startGenerationTimer();
            }
        }, true);

        document.addEventListener('submit', event => {
            const form = event.target instanceof HTMLFormElement
                ? event.target
                : null;
            const composer = getComposer();

            if (form && composer && form.contains(composer)) {
                startGenerationTimer();
            }
        }, true);
    }

    function installRuntimeMessageListener() {
        chrome.runtime.onMessage.addListener(message => {
            if (message?.type === MESSAGE_TOGGLE_WIDGET) {
                toggleWidgetVisibility();
            }
        });
    }

    async function start() {
        createInterface();
        installShortcutFallback();
        installGenerationHooks();
        installRuntimeMessageListener();

        await Promise.all([
            loadRules(),
            loadPreferences(),
        ]);

        renderRulesEditor();
        renderPreferencesEditor();
        applyTheme();
        setSettingsOpen(safeSessionGet(STORAGE.settingsOpen) === '1', false);
        setWidgetVisible(safeSessionGet(STORAGE.visible) === '1', false);

        restoreSentMatchFingerprints();
        resetDetectionState();
        markCurrentSurfacesAsProcessed();
        restoreGenerationTimer();
        updateInterface();
        startObserver();
        monitorGenerationTime();

        window.setInterval(monitorGenerationTime, CONFIG.timerIntervalMs);
        window.setInterval(() => {
            if (isEnabled()) {
                void checkFlow();
            }
        }, CONFIG.fallbackMs);

        window.addEventListener('resize', ensureWidgetInViewport, { passive: true });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') {
                return;
            }

            if (changes[STORAGE.rules]) {
                rules = sanitizeRules(changes[STORAGE.rules].newValue);
                resetDetectionState();
                markCurrentSurfacesAsProcessed();
                renderRulesEditor();
            }

            if (changes[STORAGE.preferences]) {
                preferences = sanitizePreferences(changes[STORAGE.preferences].newValue);
                renderPreferencesEditor();
                applyTheme();
            }

            updateInterface();
        });

        console.info(
            `[AI Flow Automator] v${VERSION} loaded on ${provider.name}. Press Ctrl+Alt+A to show the widget.`
        );
    }

    function boot() {
        void start().catch(error => {
            console.error('[AI Flow Automator] Startup failed.', error);

            try {
                createInterface();
                setWidgetVisible(safeSessionGet(STORAGE.visible) === '1', false);
                installShortcutFallback();
                installGenerationHooks();
                installRuntimeMessageListener();
            } catch (fallbackError) {
                console.error('[AI Flow Automator] Fallback startup failed.', fallbackError);
            }
        });
    }

    if (document.body) {
        boot();
    } else {
        window.addEventListener('DOMContentLoaded', boot, { once: true });
    }
})();
