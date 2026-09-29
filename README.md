# AI Flow Automator

AI Flow Automator watches rendered text in AI chat pages and sends a configured response when a rule matches.

## Controls

- Press `Ctrl+Alt+A` to show or hide the widget.
- Use the main Play/Stop button to enable or disable automation.
- Use Settings to edit rules, choose Light/Dark mode, choose an accent color, and configure the delay before an automatic reply is sent.
- Use the drag button next to Settings to move the whole widget.

## Rules

Rules are evaluated from top to bottom. The first matching rule wins.

| Expected text | Response text |
| --- | --- |
| Aguardando proximo | proximo |
| Resume stream unavailable | continue |

Only rendered DOM text is inspected. HTML tags and attributes are not matched.

## Timer

The live timer starts when a message is submitted, including messages sent automatically by the extension. Completed durations are shown as:

`Last: 00:06 | 00:07 | 00:03`

## Duplicate protection

A successfully dispatched rule is fingerprinted in the current tab session. If an AI page rerenders the same response when a hidden tab becomes visible again, the extension does not send the configured response a second time.

## Persistence

Rules, theme, accent color and send delay use Chrome local extension storage. Per-tab runtime state uses session storage, so reloading the same tab preserves widget visibility, ON/OFF state, position, counters and generation history.

## Incognito

The manifest uses split incognito mode. Chrome still requires the user to enable **Allow in Incognito** from the extension details page.
