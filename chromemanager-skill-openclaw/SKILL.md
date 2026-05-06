---
name: chromemanager-skill-openclaw
description: Control ChromeManager window fleets through its local API, then drive webpage content through a ref-first multi-window runtime inspired by agent-browser.
---

# ChromeManager Skill (OpenClaw)

This edition keeps the same two-layer philosophy, but the second layer has been rebuilt around a **snapshot -> refs -> action -> validate** contract.

## Execution Model

Layer 1: ChromeManager API
- open/import/select/arrange windows
- batch navigate windows
- close windows
- expose runtime `debugPort` values

Layer 2: Runtime Fleet Engine
- attach to each target window through `debugPort`
- create structured page snapshots
- resolve element refs from text hints
- run ref-first actions
- validate and recover abnormal windows

In short:
- ChromeManager manages the window fleet
- the runtime engine manages webpage content inside each window

This skill is for webpage execution, not Chrome shell UI control.

## Mandatory Workflow

For every `/cm` or `/chromemanager` task:

1. Ensure ChromeManager API is reachable
2. Read current managed windows and runtime `debugPort` values
3. Prepare the requested windows through ChromeManager API when needed
4. Enter the runtime engine only after window preparation is complete
5. For every new page state:
   - snapshot first
   - resolve refs
   - execute the action
   - validate the stage

## Invocation Contract

Treat `/cm` and `/chromemanager` as the standard command forms for this skill.

First-use bootstrap:

- ask OpenClaw to bind `/cm` and `/chromemanager` to this skill before running user tasks
- once binding is confirmed, treat both commands as equivalent entry points

Typical task shapes include:

- `/cm 准备 1-5，打开 https://example.com，点击“签到”按钮，关闭所有网页`

The same task can also be split into smaller steps:

- `/cm 准备 1-5`
- `/cm 打开 https://example.com`
- `/cm 点击“签到”按钮`
- `/cm 关闭所有网页`

Concurrency can also be described in natural language.

Typical forms include:

- `/cm 准备 1-5，分 2 个窗口一批打开 https://example.com`
- `/cm 打开 https://example.com，分 3 个窗口一批执行`
- `/cm 点击“签到”按钮，串行执行`
- `/cm 关闭所有网页，全部并行执行`

Interpretation guide:

- `分 2 个窗口一批` -> `concurrency: 2`
- `分 3 个窗口一批` -> `concurrency: 3`
- `全部并行执行` -> `concurrency: "all"`
- `串行执行` -> `concurrency: 1`

## Help Response

When the user asks for help with phrases such as `/cm help`, `/cm 帮助`, `/chromemanager help`, `/chromemanager 帮助`, `cm help`, `cm 帮助`, `ChromeManager help`, or `ChromeManager 帮助`, reply with the fixed concise help message below.

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
1. 将 chromemanager-skill-openclaw 文件夹放入 OpenClaw 的 skills 目录。
2. 进入 chromemanager-skill-openclaw 目录，执行 npm install。
3. 打开 config.json，填写 api_token、api_host、api_port、software_path、autoStart。
4. software_path 示例：
   - Windows: D:/***/***/ChromeManager.exe
   - macOS: /Applications/***/ChromeManager.app
5. 在 ChromeManager 中启用本地 API，并确认 Token 与 config.json 中的 api_token 一致。

命令示例：
/cm 准备 1-5，打开 https://example.com，点击“签到”按钮，关闭所有网页

也可以拆分步骤：
/cm 准备 1-5
/cm 打开 https://example.com
/cm 点击“签到”按钮
/cm 关闭所有网页
```

English help message:

```text
ChromeManager Skill Quick Help

Installation:
1. Put the chromemanager-skill-openclaw folder into the OpenClaw skills directory.
2. Enter the chromemanager-skill-openclaw directory and run npm install.
3. Open config.json and set api_token, api_host, api_port, software_path, and autoStart.
4. software_path examples:
   - Windows: D:/***/***/ChromeManager.exe
   - macOS: /Applications/***/ChromeManager.app
5. Enable the local API in ChromeManager and make sure its token matches api_token in config.json.

Command example:
/cm prepare 1-5, open https://example.com, click "Check in", then close all pages

You can also split it into steps:
/cm prepare 1-5
/cm open https://example.com
/cm click "Check in"
/cm close all pages
```

## Runtime Principles

The runtime engine follows these rules:

- Prefer refs over free-form hint clicking
- Treat snapshots as disposable state, not permanent selectors
- Re-snapshot after navigation, modal changes, or ref invalidation
- Keep a strict boundary between:
  - single-window page execution
  - multi-window orchestration
- Use fallback heuristics only when ref-first execution fails

## Recommended Mode

Default mode: `balanced`

Balanced mode means:
- choose one primary window
- snapshot the primary window first
- resolve the action target there first
- reuse that target signature on other windows when possible
- allow any diverging window to take a fresh local snapshot

Other modes:
- `fast`: lighter validation, fewer fresh snapshots
- `strict`: every target window snapshots and resolves independently

## Supported Runtime Actions

The rebuilt runtime layer exposes these core actions:

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

These actions are intentionally low-level and composable.

Do not try to grow many website-specific mega-actions into the core runtime.
If a workflow is complex, let OpenClaw plan multiple primitive actions instead.

## Runtime Runner

Primary entry:

- `node scripts/runtime-runner.js`

Examples:

```bash
node scripts/runtime-runner.js --action prepare --windows 1-5 --arrange grid --navigateUrl https://example.com
node scripts/runtime-runner.js --action snapshot --windows 1,2,3 --mode balanced
node scripts/runtime-runner.js --action click --windows 1,2,3 --hint "Connect Wallet" --mode balanced
node scripts/runtime-runner.js --action fill --windows 1,2,3 --hint "Email" --text hello@example.com
node scripts/runtime-runner.js --action press --windows 1,2,3 --key Enter
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

For special characters or larger payloads, prefer:

```bash
node scripts/write-task-file.js --action click --windows 1,2,3 --hint "Continue"
node scripts/runtime-runner.js --taskFile .\\tmp\\cm-task-xxxx.json
```

For multi-step workflows, the task file format can be:

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
- top-level values such as `windows`, `mode`, `jitter`, and `navigateUrl` can be inherited by steps
- step-level values override top-level defaults
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

This allows later plan steps to reuse values returned by earlier steps.

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
- keep `click`, `fill`, `press`, and `recover` conservative unless you have already verified the target site is stable
- raise concurrency first for `snapshot`, `extract`, `screenshot`, and `validate-stage`

## Required Inputs

The runtime runner expects:

- `config.json` with API token and ChromeManager path
- reachable ChromeManager local API
- attachable `debugPort` values on target windows

If ChromeManager is not running and `autoStart` is enabled, the runner should try to start it automatically.

## Page-State Discipline

When any of the following happens, treat it as a new page state:

- initial page load
- navigation
- reload
- login redirect
- modal or drawer opened
- stage transition
- unexpected error / challenge page

On a new page state:

1. snapshot
2. inspect the state
3. only then execute the next action

Do not keep using stale refs across page states.

## Validation and Recovery

After important stages, validate all target windows.

Especially validate after:
- batch navigation
- login
- menu expansion
- checkout / confirmation / pricing transitions

Default recovery order:

1. reload
2. re-check
3. re-navigate if target URL is known
4. re-snapshot
5. stop after the configured recovery limit

If windows still fail:
- report exact failing window numbers
- return structured failure output
- let OpenClaw decide whether to continue or stop

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

## Action Contract

Every runtime action should return machine-readable output that includes:

- `ok`
- `action`
- `mode`
- `windowNumber`
- `url`
- `snapshotId`
- `usedRef`
- `reason`
- `retryable`

This contract is more important than pretty logs.

## What This Skill Should Avoid

- do not depend on coordinate clicking for webpage tasks
- do not assume one selector works forever
- do not keep inflating the runtime core with site-specific patches
- do not treat old hint heuristics as the primary strategy
- do not mix Chrome shell UI automation into this runtime layer

## Summary

This OpenClaw skill should behave like:

- ChromeManager API outside
- agent-browser-style runtime logic inside
- multi-window orchestration wrapped around a ref-first single-window executor

That is the intended shape of this rebuilt edition.
