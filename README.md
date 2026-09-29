# AI Flow Automator

**AI Flow Automator** is a Chrome extension that automatically responds to predefined text in AI conversations.

Create simple rules that tell the extension **what text to watch for** and **what response to send**. When a match appears in the rendered conversation, AI Flow Automator waits for the configured delay and submits the corresponding response automatically.

It is designed for long-running AI workflows where the conversation may repeatedly pause and wait for predictable user input.

---

## What it does

AI Flow Automator uses simple rules that define **what to detect** and **what to send**.

Each rule contains two fields:

| **Field** | **Description** |
| --- | --- |
| **Expected text** | Text the extension should detect in the rendered AI response |
| **Response text** | Message the extension should automatically send when a match is found |

### Example

| **#** | **Expected text** | **Response text** |
| ---: | --- | --- |
| 1 | `Ready for your next instruction` | `Proceed` |
| 2 | `Waiting for your input` | `Go ahead` |
| 3 | `Should I move on to the next step?` | `Yes` |
| 4 | `Let me know when you're ready` | `I'm ready` |

When automation is enabled, AI Flow Automator continuously monitors the rendered conversation.

When one of your configured phrases is detected, the extension:

1. Selects the first matching rule.
2. Waits for the configured delay.
3. Automatically submits the corresponding response.
4. Continues monitoring the conversation for the next match.

Rules are evaluated **from top to bottom**, so their order matters. If more than one rule matches, the **first matching rule takes priority**.

---

## Why use AI Flow Automator?

Some AI workflows can run for a long time but occasionally stop and wait for another message before continuing.

That often means repeatedly returning to the conversation just to send a predictable response.

For example:

1. The AI completes part of a task.
2. The conversation reaches a point where the assistant is waiting for the next input.
3. You send a short response.
4. The AI continues working.
5. The process repeats.

AI Flow Automator can handle those repetitive responses automatically.

You decide exactly which text should trigger an action and exactly what response should be sent.

The extension does not decide what to say on its own.

---

## Features

- **Automatic rule-based responses**
- **Multiple configurable rules**
- **Top-to-bottom rule priority**
- **Configurable send delay**
- **Play / Stop automation control**
- **Floating control widget**
- **Draggable interface**
- **Light and Dark modes**
- **Custom accent color**
- **Live generation timer**
- **Recent generation duration history**
- **Duplicate response protection**
- **Persistent settings**
- **Per-tab runtime state**
- **Keyboard shortcut to show or hide the widget**
- **Incognito support when enabled in Chrome**

---

## Getting started

Install **AI Flow Automator** from the Chrome Web Store and open a supported AI conversation.

The extension adds a floating control widget directly to the page.

### 1. Open Settings

Use the **Settings** button in the widget to configure your automation rules and preferences.

### 2. Create a rule

Enter the text that should trigger the automation:

```text
Expected text: Ready for your next instruction
```

Then enter the response that should be sent:

```text
Response text: Proceed
```

### 3. Configure the delay

Choose how long AI Flow Automator should wait after detecting a match before sending the response.

### 4. Enable automation

Press **Play**.

AI Flow Automator will begin monitoring the conversation for your configured rules.

Press **Stop** whenever you want to disable automatic responses.

---

## Rule priority

Rules are checked **from top to bottom**.

The first matching rule is used.

For example:

```text
1. Ready for the next step
2. Ready
```

If the conversation contains:

```text
Ready for the next step
```

both phrases may match, but Rule 1 is selected because it appears first.

For best results, place **more specific rules above more general rules**.

For example:

```text
More specific rules
        ↓
More general rules
```

This helps prevent a broad rule from triggering before a more precise one.

---

## Text matching

AI Flow Automator monitors the text rendered by the AI conversation.

It matches against **rendered DOM text**.

That means the extension reacts to text displayed by the page rather than HTML code or element attributes.

For example, if your rule expects:

```text
Waiting for your input
```

the extension looks for that text in the rendered conversation.

HTML tags and attributes are not treated as matching text.

---

## Send delay

You can configure a delay between detecting a matching rule and automatically submitting its response.

The flow is:

```text
Matching text detected
        ↓
Configured delay
        ↓
Response submitted
```

The delay gives you control over how quickly automatic responses are sent after a match appears.

Your configured delay is saved with the extension settings.

---

## Play and Stop controls

The main control allows you to enable or disable automation at any time.

### Play

When automation is enabled, AI Flow Automator monitors the conversation and processes matching rules.

### Stop

When automation is stopped, no automatic responses are sent.

Stopping automation does **not** delete your rules or preferences.

You can enable it again whenever you want.

---

## Generation timer

AI Flow Automator includes a built-in timer that tracks how long AI generations take.

The timer starts when a message is submitted, including messages automatically submitted by the extension.

Recent completed durations are displayed in a compact history such as:

```text
Last: 00:06 | 00:07 | 00:03
```

This makes it easier to monitor long-running AI workflows without using a separate timer.

---

## Duplicate protection

AI chat pages can sometimes rerender previously displayed content.

Without protection, a previously matched phrase could potentially trigger the same automation again.

AI Flow Automator keeps track of successfully processed matches within the current tab session.

If previously processed content is rendered again, the extension avoids sending the same automatic response a second time.

For example:

```text
Rule matches
    ↓
Response is sent
    ↓
Match is recorded
    ↓
Page rerenders the same content
    ↓
Duplicate detected
    ↓
No additional response is sent
```

This is especially useful when switching between tabs or when the AI page updates its interface.

---

## Persistent settings

Your main configuration is stored locally by the Chrome extension.

This includes:

- Rules
- Theme
- Accent color
- Send delay

These settings remain available between browser sessions.

---

## Per-tab state

AI Flow Automator also keeps runtime information for the current tab session.

This includes information such as:

- Widget visibility
- Automation ON/OFF state
- Widget position
- Counters
- Generation history
- Duplicate-processing state

Reloading the same tab preserves this runtime state for the session.

---

## Customize the interface

The widget can be customized from **Settings**.

You can choose:

- **Light mode**
- **Dark mode**
- **Accent color**

These appearance settings do not affect your automation rules.

---

## Move the widget

The entire AI Flow Automator widget can be repositioned on the page.

Use the drag control next to **Settings** and move the widget to the most convenient location.

Its position is preserved within the current tab session.

---

## Keyboard shortcut

Press:

```text
Ctrl+Alt+A
```

to show or hide the AI Flow Automator widget.

This allows you to keep the interface out of the way while automation remains active.

---

## Incognito mode

AI Flow Automator supports Chrome's Incognito mode.

Chrome requires extensions to be explicitly allowed to run in Incognito.

To enable it:

1. Open the extension's **Details** page in Chrome.
2. Enable **Allow in Incognito**.

Chrome manages normal and Incognito extension contexts separately.

---

## Privacy

AI Flow Automator needs to inspect rendered conversation text in order to determine whether one of your configured rules matches.

Your extension configuration is stored using Chrome extension storage.

Stored configuration includes:

- Automation rules
- Theme preference
- Accent color
- Send delay

Runtime session information is also stored locally for features such as:

- Widget state
- Automation state
- Generation history
- Duplicate-response protection

For complete information about how the extension handles data, see the **AI Flow Automator Privacy Policy** available from the Chrome Web Store listing.

---

## Example workflow

Suppose an AI workflow performs several tasks sequentially and eventually displays:

```text
Ready for your next instruction
```

You create this rule:

```text
Expected text: Ready for your next instruction
Response text: Proceed
```

With automation enabled, AI Flow Automator detects the matching text.

It then:

```text
Detects the expected text
        ↓
Selects the matching rule
        ↓
Waits for the configured delay
        ↓
Sends "Proceed"
        ↓
The AI continues
        ↓
AI Flow Automator keeps monitoring
```

If another configured condition appears later, the same process happens again.

---

## Tips for better rules

### Use specific phrases

More specific rules reduce accidental matches.

Prefer:

```text
Ready for your next instruction
```

instead of:

```text
Ready
```

---

### Put specific rules first

Because the first matching rule wins, order your rules from the most specific to the most general.

Prefer:

```text
1. Ready for your next instruction
2. Ready
```

rather than:

```text
1. Ready
2. Ready for your next instruction
```

---

### Test your rules

Before leaving a workflow running automatically, test new rules and confirm that:

- The expected text matches at the correct moment.
- The correct response is selected.
- The rule does not match unrelated conversation text.
- The configured delay works as expected.

---

## Important behavior

AI Flow Automator is intentionally rule-based.

Keep the following in mind:

- Only rendered conversation text is evaluated.
- HTML tags and attributes are not matched.
- Rule order matters.
- The first matching rule takes priority.
- Automatic responses are only sent while automation is enabled.
- Responses are based entirely on rules configured by you.
- Broad rules may match more situations than intended.
- Changes to an AI website's interface may affect extension behavior.

AI Flow Automator does not generate responses or decide what should be sent.

It simply executes the rules you configure.

---

## In short

You define:

```text
WHEN this text appears
        ↓
SEND this response
```

AI Flow Automator handles:

```text
Monitoring
    ↓
Matching
    ↓
Waiting
    ↓
Sending
    ↓
Duplicate protection
    ↓
Monitoring again
```

This makes repetitive AI workflows easier to run without constantly returning to the conversation to send the same predictable responses.
