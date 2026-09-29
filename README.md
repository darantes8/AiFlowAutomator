# AI Flow Automator

**AI Flow Automator** is a Chrome extension that automates repetitive follow-up messages on supported AI chat pages.

It watches the text actually rendered in the page, checks that text against an ordered list of user-defined rules, and automatically sends the configured response when a rule matches.

This is useful for long-running AI workflows that periodically stop and wait for a simple confirmation such as `continue`, `proximo`, or another predefined response.

> You define the conditions. AI Flow Automator handles the repetitive reply.

---

## What it does

A rule has two parts:

| Field | Meaning |
| --- | --- |
| **Expected text** | Text that should appear in the rendered AI response |
| **Response text** | Message the extension should automatically submit |

Example:

| Expected text | Response text |
| --- | --- |
| `Aguardando proximo` | `proximo` |
| `Resume stream unavailable` | `continue` |

When automation is enabled, the extension continuously observes the rendered conversation. If the page contains text matching one of the configured rules, AI Flow Automator waits for the configured delay and submits that rule's response.

Rules are evaluated **from top to bottom**. The **first matching rule wins**.

---

## Why AI Flow Automator

AI assistants can perform long, multi-step tasks, but some workflows pause waiting for a predictable confirmation before continuing.

Without automation, that often becomes:

1. Wait for the current generation to finish.
2. Notice that the assistant is waiting for confirmation.
3. Type the same reply again.
4. Repeat.

AI Flow Automator turns that repetitive interaction into a configurable rule.

It is intentionally simple: it does not try to understand the conversation semantically. It reacts to the text rendered by the page according to the rules you configure.

---

## Features

- **Rule-based automatic replies** — map expected page text to the response that should be sent.
- **Ordered rule priority** — rules are checked from top to bottom and only the first match is dispatched.
- **Rendered-text matching** — the extension inspects text present in the rendered DOM, not raw HTML tags or attributes.
- **Configurable send delay** — wait before automatically submitting a matched response.
- **Play / Stop control** — enable or disable automation without removing your configuration.
- **Floating draggable widget** — keep the controls available without giving up a fixed area of the page.
- **Keyboard shortcut** — quickly show or hide the widget with `Ctrl+Alt+A`.
- **Light and Dark themes** — choose the appearance that fits the current page.
- **Accent color customization** — personalize the widget without changing its behavior.
- **Live generation timer** — measure how long message generations take.
- **Recent duration history** — quickly compare the latest completed generations.
- **Duplicate-dispatch protection** — avoids sending the same matched rule again when the page rerenders an already-processed response.
- **Persistent configuration** — rules and visual preferences remain available between sessions.
- **Per-tab runtime state** — widget position, visibility, ON/OFF state, counters, and generation history survive reloads in the same tab session.
- **Incognito support** — the manifest uses split incognito mode; Chrome still requires explicit permission from the user.

---

## How it works

At a high level:

```text
AI page renders text
        |
        v
AI Flow Automator inspects rendered DOM text
        |
        v
Rules are checked from top to bottom
        |
        +---- no match ----> keep observing
        |
        v
First matching rule is selected
        |
        v
Configured delay
        |
        v
Response is submitted
        |
        v
Dispatch is fingerprinted to prevent duplicates
```

The extension works with the page content the user can actually render and interact with. HTML tags and attributes are not treated as rule text.

---

## Installation

To load the extension locally in Chrome:

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project directory containing `manifest.json`.
6. Open a supported AI chat page.
7. Use the floating AI Flow Automator widget to configure and enable your rules.

After changing extension source files during development, reload the extension from `chrome://extensions` and refresh the target page.

---

## Using the widget

### Show or hide

Press:

```text
Ctrl+Alt+A
```

to toggle the widget visibility.

### Enable or disable automation

Use the main **Play / Stop** control.

Stopping automation does not remove your saved rules or preferences; it only prevents automatic dispatch while automation is disabled.

### Move the widget

Use the drag control next to **Settings** to reposition the entire widget.

The position is remembered for the current tab session.

---

## Configuring rules

Open **Settings** to manage the automation rules.

Each rule defines:

```text
Expected text  ->  Automatic response
```

For example:

```text
Aguardando proximo  ->  proximo
```

If the rendered AI response contains the condition represented by a configured rule, that rule becomes eligible for dispatch according to the extension's matching logic.

### Rule priority matters

Rules are evaluated in order:

```text
Rule 1
Rule 2
Rule 3
...
```

As soon as one rule matches, lower-priority rules are not used for that dispatch.

Put more specific conditions above more general ones when their expected text can overlap.

---

## Send delay

The automatic reply does not need to be submitted immediately after a match.

The delay setting lets you add a pause between detecting a matching rule and sending its configured response.

This is useful when the target page is still finishing UI updates around the generated message.

The delay is stored with the extension's persistent configuration.

---

## Generation timer

AI Flow Automator includes a live timer for message generations.

The timer starts when a message is submitted, including messages submitted automatically by the extension.

Completed generation durations are kept in a compact history such as:

```text
Last: 00:06 | 00:07 | 00:03
```

This makes it easy to see the duration of recent generations while a longer automated workflow is running.

---

## Duplicate protection

Modern web apps frequently rerender parts of the conversation UI. A previously rendered response can therefore appear in the DOM again even though it is not a new assistant response.

AI Flow Automator protects against this by fingerprinting a successfully dispatched rule within the current tab session.

If the page rerenders the same processed response — for example after a hidden tab becomes visible again — the extension does not automatically send the configured reply a second time for that same dispatch.

This protection is especially important for workflows that remain open for long periods.

---

## Persistence and state

AI Flow Automator separates **persistent configuration** from **per-tab runtime state**.

### Persistent configuration

Stored using Chrome local extension storage:

- Rules
- Theme
- Accent color
- Automatic-send delay

These settings remain available beyond a single page reload or tab session.

### Per-tab runtime state

Stored using session storage:

- Widget visibility
- Automation ON/OFF state
- Widget position
- Runtime counters
- Generation history
- Other current-tab automation state used to prevent duplicate processing

Reloading the same tab preserves this runtime state for the tab session.

---

## Light / Dark mode and accent color

The widget appearance can be customized independently from the automation rules.

In **Settings**, you can choose:

- Light mode
- Dark mode
- Accent color

Visual preferences are stored locally with the extension configuration.

---

## Incognito mode

The extension manifest uses Chrome's **split incognito mode**.

Chrome does not enable extensions in Incognito automatically. To use AI Flow Automator there:

1. Open `chrome://extensions`.
2. Open **Details** for AI Flow Automator.
3. Enable **Allow in Incognito**.

Incognito and regular browsing contexts remain separated according to Chrome's split-incognito behavior.

---

## Privacy and local storage

AI Flow Automator needs to inspect rendered page text in order to evaluate automation rules and interact with the supported chat interface.

Its configuration is stored through Chrome extension storage rather than in the page itself:

- Persistent settings use local extension storage.
- Per-tab runtime state uses session storage.

See `privacy.html` for the project's privacy notice and the exact privacy disclosures shipped with the extension.

---

## Important behavior and limitations

AI Flow Automator is deliberately rule-based. Keep the following in mind:

- It only reacts to text that the target page renders in the DOM.
- Raw HTML tags and element attributes are not matched as rule content.
- Rule order is significant because the first match wins.
- The extension can only automate pages and interfaces it has permission to access.
- Changes to a target website's DOM or message composer can require extension updates.
- Automatic replies are sent on your behalf, so rules should be tested before leaving a workflow unattended.
- Duplicate protection is designed to prevent rerender-related repeats, but rule configuration should still avoid unintended feedback loops.

---

## Project structure

The project is centered around a small Chrome-extension codebase:

```text
.
├── manifest.json     # Chrome extension configuration and permissions
├── content.js        # Page integration, widget, matching and automation behavior
├── background.js     # Background extension logic
├── styles.css        # Widget styling and visual states
├── privacy.html      # Privacy notice
└── README.md         # Project documentation
```

---

## Typical workflow

A practical setup looks like this:

1. Open the AI chat workflow you want to automate.
2. Open AI Flow Automator settings.
3. Add the text that indicates the AI is waiting for your next instruction.
4. Add the response that should be sent when that text appears.
5. Order the rules from most specific to most general.
6. Configure a send delay if needed.
7. Press **Play**.
8. Let the extension watch the conversation and handle matching follow-ups.
9. Use the live timer and recent duration history to monitor progress.
10. Press **Stop** whenever you want to take manual control again.

---

## Example use case

Suppose a long-running AI process periodically ends a step with:

```text
Aguardando proximo
```

Create this rule:

```text
Expected text: Aguardando proximo
Response text: proximo
```

With automation enabled, AI Flow Automator detects the rendered condition, waits for the configured delay, submits `proximo`, and then continues observing the page for the next generation.

The same mechanism can be used for any other predictable rendered-text condition and response pair supported by your workflow.

---

## Development notes

When modifying the extension:

1. Edit the source files.
2. Reload AI Flow Automator from `chrome://extensions`.
3. Refresh the AI chat tab.
4. Verify widget visibility, rule matching, send delay, timer behavior, persistence, and duplicate protection.

Because the extension integrates directly with third-party page DOMs, changes made by those sites may require corresponding selector or interaction updates in the extension.

---

## Safety tip

Before using a new rule in a long unattended workflow, test it with automation enabled while watching the first few matches.

A broad or ambiguous expected-text rule may trigger in more situations than intended. Prefer distinctive text conditions and place the most specific rules first.

---

**AI Flow Automator** is built to remove the repetitive “type the same confirmation again” step from rule-driven AI workflows while keeping the automation visible, configurable, and easy to stop at any time.

