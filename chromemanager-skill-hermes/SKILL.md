---
name: chromemanager-skill-hermes
description: Control ChromeManager browser fleets through its local API, then run a ref-first multi-window webpage engine for Hermes.
---

# ChromeManager Skill (Hermes)

This rebuilt Hermes edition uses the same execution philosophy as the OpenClaw edition, but keeps a fully independent folder so Hermes users can download only what they need.

## Execution Model

Layer 1: ChromeManager API
- open windows
- import windows
- select windows
- arrange layout
- batch navigate
- close windows

Layer 2: Runtime Fleet Engine
- attach to each window by `debugPort`
- build structured snapshots
- resolve refs from page state
- run ref-first webpage actions
- validate and recover failing windows

The second layer is intentionally rebuilt in an agent-browser-style direction:

- snapshot first
- refs as the primary action target
- page-state boundaries treated seriously
- multi-window orchestration wrapped around a single-window executor

## Mandatory Workflow

For every task in Hermes that targets ChromeManager:

1. ensure ChromeManager API is reachable
2. read current managed windows and `debugPort` values
3. prepare the requested window set when needed
4. enter the runtime engine only after preparation
5. whenever the page state changes, snapshot before the next action

## Invocation Contract

Hermes should primarily trigger this skill by intent and memory keywords, not by assuming custom slash commands are always available.

First-use bootstrap:

- ask Hermes to write trigger keywords into memory and map them to this skill:
  - `cm`
  - `ChromeManager`
  - `chromemanager`
  - `浏览器窗口`
  - `多窗口`
  - `窗口同步`
  - `批量窗口`
- once memory is set, prefer natural-language task routing through those keywords
- if the host platform later provides slash aliases, treat them as optional compatibility entry points

Typical task shapes include:

- `使用 ChromeManager 准备 1-5，打开 https://example.com，点击“签到”按钮，关闭所有网页`

The same task can also be split into smaller steps:

- `先准备 1-5`
- `再打开 https://example.com`
- `再点击“签到”按钮`
- `最后关闭所有网页`

Concurrency can also be described in natural language.

Typical forms include:

- `准备 1-5，分 2 个窗口一批打开 https://example.com`
- `打开 https://example.com，分 3 个窗口一批执行`
- `点击“签到”按钮，串行执行`
- `关闭所有网页，全部并行执行`

Interpretation guide:

- `分 2 个窗口一批` -> `concurrency: 2`
- `分 3 个窗口一批` -> `concurrency: 3`
- `全部并行执行` -> `concurrency: "all"`
- `串行执行` -> `concurrency: 1`

## Help Response

When the user asks for help with phrases such as `cm help`, `cm 帮助`, `ChromeManager help`, `ChromeManager 帮助`, `chromemanager help`, `chromemanager 帮助`, `/cm help`, or `/cm 帮助`, reply with the fixed concise help message below.

Rules:
- Do not call ChromeManager API for help requests.
- Do not run `runtime-runner.js` for help requests.
- If the user's request is mainly Chinese, reply with the Chinese help message.
- If the user's request is mainly English, reply with the English help message.
- Keep the response concise and close to the fixed text.

Chinese help message:

```text
ChromeManager Skill 简明帮助

安装：
1. 将 chromemanager-skill-hermes 文件夹放入 Hermes 的 skills 目录或外部 skills 扫描目录。
2. 进入 chromemanager-skill-hermes 目录，执行 npm install。
3. 打开 config.json，填写 api_token、api_host、api_port、software_path、autoStart。
4. software_path 示例：
   - Windows: D:/***/***/ChromeManager.exe
   - macOS: /Applications/***/ChromeManager.app
5. 在 ChromeManager 中启用本地 API，并确认 Token 与 config.json 中的 api_token 一致。

命令示例：
使用 ChromeManager 准备 1-5，打开 https://example.com，点击“签到”按钮，关闭所有网页

也可以拆分步骤：
先准备 1-5
再打开 https://example.com
再点击“签到”按钮
最后关闭所有网页
```

English help message:

```text
ChromeManager Skill Quick Help

Installation:
1. Put the chromemanager-skill-hermes folder into the Hermes skills directory or an external skills scan directory.
2. Enter the chromemanager-skill-hermes directory and run npm install.
3. Open config.json and set api_token, api_host, api_port, software_path, and autoStart.
4. software_path examples:
   - Windows: D:/***/***/ChromeManager.exe
   - macOS: /Applications/***/ChromeManager.app
5. Enable the local API in ChromeManager and make sure its token matches api_token in config.json.

Command example:
Use ChromeManager to prepare 1-5, open https://example.com, click "Check in", then close all pages

You can also split it into steps:
prepare 1-5 first
then open https://example.com
then click "Check in"
finally close all pages
```

## Runtime Actions

Core actions:

- `prepare`
- `snapshot`
- `click`
- `fill`
- `press`
- `extract`
- `screenshot`
- `desktop-screenshot`
- `report-progress`
- `validate-stage`
- `recover`
- `run-plan`

These actions are the intended contract between Hermes and the runtime engine.

## Runtime Entry

Primary script:

- `node scripts/runtime-runner.js`

Examples:

```bash
node scripts/runtime-runner.js --action prepare --windows 1-3 --arrange grid --navigateUrl https://example.com
node scripts/runtime-runner.js --action snapshot --windows 1,2,3
node scripts/runtime-runner.js --action click --windows 1,2,3 --hint "Sign in"
node scripts/runtime-runner.js --action fill --windows 1,2,3 --hint "Email" --text hello@example.com
node scripts/runtime-runner.js --action validate-stage --windows 1,2,3 --expectedUrlPrefix https://example.com/app
```

Example `run-plan`:

```bash
node scripts/runtime-runner.js --action run-plan --planJson "{\"steps\":[{\"action\":\"prepare\",\"windows\":\"1-3\",\"arrange\":\"grid\",\"navigateUrl\":\"https://example.com/login\"},{\"action\":\"snapshot\",\"windows\":\"1-3\"},{\"action\":\"fill\",\"windows\":\"1-3\",\"hint\":\"Email\",\"text\":\"hello@example.com\"},{\"action\":\"press\",\"windows\":\"1-3\",\"key\":\"Enter\"},{\"action\":\"validate-stage\",\"windows\":\"1-3\",\"expectedUrlPrefix\":\"https://example.com/app\"}]}"
```

Example `report-progress`:

```bash
node scripts/runtime-runner.js --action report-progress --status blocked --stage wallet-confirmation --message "Wallet popup is waiting for user confirmation" --windows 1-5 --nextQuestion "Do you want me to retry after confirmation?"
```

When payloads contain special characters, prefer:

```bash
node scripts/write-task-file.js --action click --windows 1,2,3 --hint "Continue"
node scripts/runtime-runner.js --taskFile .\\tmp\\cm-task-xxxx.json
```

For multi-step Hermes workflows, prefer a task file with:

```json
{
  "action": "run-plan",
  "mode": "balanced",
  "windows": "1-3",
  "steps": [
    { "name": "prepare-login", "action": "prepare", "arrange": "grid", "navigateUrl": "https://example.com/login" },
    { "name": "snapshot-login", "action": "snapshot" },
    { "name": "fill-email", "action": "fill", "hint": "Email", "text": "hello@example.com" },
    { "name": "submit-login", "action": "press", "key": "Enter" },
    { "name": "validate-home", "action": "validate-stage", "expectedUrlPrefix": "https://example.com/app" }
  ]
}
```

`run-plan` rules:
- each step must contain `action`
- top-level defaults can flow into steps
- step-level values override inherited defaults
- `stopOnFailure` defaults to `true`
- each step may also set `onFailure` to `stop`, `continue`, or `skipRemaining`
- `concurrency` defaults to `1`
- nested `run-plan` is intentionally not supported

`run-plan` automatic end report:
- `autoReportOnPlanEnd` defaults to `true`
- `autoReportCapture` defaults to `desktop` (`none` disables screenshot capture)
- `autoReportStrict` defaults to `false` (report failure does not fail the whole plan)
- `autoReportFailedQuestion` can override the default follow-up question text

Disable automatic end report example:

```bash
node scripts/runtime-runner.js --action run-plan --autoReportOnPlanEnd false --planJson "{\"steps\":[{\"action\":\"prepare\",\"windows\":\"1-3\"}]}"
```

Step output references are supported through template placeholders.

Examples:

- `{{steps.fill-email.result.ok}}`
- `{{steps.extract-code.result.firstValue}}`
- `{{steps.extract-code.result.valuesByWindow.1}}`
- `{{last.result.firstValue}}`

Example:

```json
{
  "action": "run-plan",
  "windows": "1-3",
  "steps": [
    { "name": "extract-code", "action": "extract", "hint": "Verification Code" },
    { "name": "fill-code", "action": "fill", "hint": "Enter Code", "text": "{{steps.extract-code.result.firstValue}}" },
    { "name": "submit", "action": "press", "key": "Enter" }
  ]
}
```

Per-window expansion is also supported.

If a placeholder resolves to a window map such as `valuesByWindow`, later steps can consume it directly.

Example:

```json
{
  "action": "run-plan",
  "windows": "1-3",
  "steps": [
    { "name": "extract-codes", "action": "extract", "hint": "Verification Code" },
    { "name": "fill-codes", "action": "fill", "hint": "Enter Code", "text": "{{steps.extract-codes.result.valuesByWindow}}" },
    { "name": "submit", "action": "press", "key": "Enter" }
  ]
}
```

When `text`, `hint`, `expectedUrl`, `expectedUrlPrefix`, `key`, or similar fields receive an object such as:

```json
{
  "1": "alpha",
  "2": "bravo",
  "default": "fallback"
}
```

the runtime automatically picks the matching value for each window number.

Simple conditional execution is also supported through `when`.

Examples:

```json
{
  "name": "recover-if-validate-failed",
  "action": "recover",
  "navigateUrl": "https://example.com/app",
  "when": {
    "path": "steps.validate-home.result.ok",
    "equals": false
  }
}
```

Supported `when` styles:

- string template:
  - `"when": "{{steps.extract-code.result.ok}}"`
- object checks:
  - `exists`
  - `truthy`
  - `equals`
  - `notEquals`
  - `includes`

When a step condition is not met, the step is returned as `skipped` instead of failed.

Failure handling is step-aware.

Examples:

```json
{
  "name": "extract-otp",
  "action": "extract",
  "hint": "Verification Code",
  "onFailure": "continue"
}
```

```json
{
  "name": "recovery-gate",
  "action": "validate-stage",
  "expectedUrlPrefix": "https://example.com/app",
  "onFailure": "skipRemaining"
}
```

Failure policy behavior:

- `stop`: stop the plan immediately after this failed step
- `continue`: record the failure and continue with later steps
- `skipRemaining`: keep this step as failed, then mark all later steps as `skipped`

Progress reporting can also be inserted directly into a plan.

Example:

```json
{
  "action": "run-plan",
  "windows": "1-5",
  "steps": [
    {
      "name": "prepare-site",
      "action": "prepare",
      "arrange": "grid",
      "navigateUrl": "https://example.com"
    },
    {
      "name": "click-checkin",
      "action": "click",
      "hint": "签到"
    },
    {
      "name": "report-success",
      "action": "report-progress",
      "status": "completed",
      "stage": "checkin-finished",
      "message": "1-5 windows completed the check-in flow",
      "windows": "1-5"
    }
  ]
}
```

Blocked-state example:

```json
{
  "action": "report-progress",
  "status": "blocked",
  "stage": "wallet-confirmation",
  "message": "Wallet popup is waiting for user confirmation",
  "windows": "1-5",
  "nextQuestion": "Do you want me to retry after confirmation?"
}
```

Controlled concurrency is supported.

Examples:

```json
{
  "name": "snapshot-batch",
  "action": "snapshot",
  "concurrency": 4
}
```

```json
{
  "name": "extract-batch",
  "action": "extract",
  "hint": "Verification Code",
  "concurrency": "all"
}
```

Recommended guidance:
- keep `click`, `fill`, `press`, and `recover` conservative unless the target site is already verified as stable
- raise concurrency first for `snapshot`, `extract`, `screenshot`, and `validate-stage`

## Mode Guidance

Default: `balanced`

Balanced mode means:
- primary window first
- primary snapshot first
- primary target resolution first
- reuse target signatures when possible
- allow per-window fresh snapshots when the page diverges

Other modes:
- `fast`
- `strict`

## Validation and Recovery

After important stages, validate all target windows.

Important stages include:
- after navigation
- after login
- after menu or drawer transitions
- after important page changes

Recovery order:

1. reload
2. re-check
3. re-navigate when target URL is known
4. re-snapshot
5. stop after the recovery limit

Hermes should receive structured failure output with explicit window numbers when recovery is exhausted.

## Operator Feedback

When a meaningful workflow is completed:
- capture at least one representative desktop screenshot with `desktop-screenshot` or `report-progress`
- report the completed stage, affected window numbers, and current result

When execution is blocked or a key step fails:
- capture a desktop screenshot or representative page screenshots before asking the user how to continue
- include exact window numbers, current URL or stage, and the blocking reason
- ask the user a clear next-step question when manual intervention is needed

Important:
- `desktop-screenshot` captures the full desktop and returns both `filePath` and `MEDIA:<path>` style output for chat delivery
- `report-progress` wraps status, message, window scope, next question, and desktop screenshot into one structured result
- on macOS, if screenshot capture fails, treat Screen & System Audio Recording permission as the first thing to check

## Default Escalation Rules

Unless the user explicitly asked for silent execution, prefer `report-progress` in these situations:

- after a meaningful milestone is completed
- when `validate-stage` fails on any important step
- when `recover` is attempted and still does not restore the expected stage
- when a wallet confirmation, login approval, CAPTCHA, or other manual confirmation blocks the flow
- when different windows diverge into inconsistent states and the user needs to decide how to continue

Recommended behavior:

1. capture a desktop screenshot with `report-progress`
2. state the current stage and the affected window numbers
3. explain whether the task is completed, blocked, or partially failed
4. if blocked, ask one clear next-step question

Recommended status values:

- `completed`
- `in_progress`
- `blocked`
- `failed`

Examples of when to escalate:

- `validate-stage` says the target URL or expected text was not reached
- `recover` finished all rounds and the page still did not return to the expected state
- a wallet popup is waiting for manual confirmation
- only some windows succeeded and others stayed behind

## What This Skill Should Avoid

- do not use coordinate clicking for webpage tasks
- do not overgrow website-specific mega-actions in the runtime core
- do not keep stale refs across page states
- do not mix Chrome shell UI control into this webpage execution layer

## Summary

This Hermes skill should behave as:

- ChromeManager outside
- ref-first runtime engine inside
- multi-window orchestration above a single-window executor

That is the intended shape of this rebuilt edition.
