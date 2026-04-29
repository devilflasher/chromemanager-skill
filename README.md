<div align="center">

# ChromeManager Skill

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-43853D.svg?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Supported-111111.svg?style=flat)](./chromemanager-skill-openclaw/)
[![Hermes](https://img.shields.io/badge/Hermes-Supported-6C47FF.svg?style=flat)](./chromemanager-skill-hermes/)
[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](../LICENSE)

<strong>Author: Devilflasher</strong>
[![X](https://img.shields.io/badge/X-1DA1F2.svg?style=flat&logo=x&logoColor=white)](https://x.com/DevilflasherX)
[![WeChat](https://img.shields.io/badge/WeChat-7BB32A.svg?style=flat&logo=wechat&logoColor=white)](https://x.com/DevilflasherX/status/1781563666485448736 "Devilflasherx")
[![XChat Group](https://img.shields.io/badge/XChat%20Group-000000.svg?style=flat&logo=x&logoColor=white)](https://x.com/i/chat/group_join/g2043878131141095639/HSWv2DsC7g)

</div>

Other languages: [中文](./README_CN.md)

> ## Disclaimer
>
> 1. **This project is open source and intended for learning and communication only. Closed-source commercial use is prohibited.**
> 2. **Users must comply with local laws and regulations. Any illegal use is prohibited.**
> 3. **The developer is not liable for any direct or indirect loss caused by using this project.**
> 4. **Using this project means you have read and agreed to this disclaimer.**

## Overview

`chromemanager-skill` connects **ChromeManager** to external AI agents (such as OpenClaw and Hermes), so agents can call local APIs for window management and run webpage automation actions through `debugPort`.

This repository includes two standalone folders:
- `chromemanager-skill-openclaw`
- `chromemanager-skill-hermes`

Both skills provide the same core capabilities. The main differences are integration and trigger behavior.

## Core Capabilities

- Use ChromeManager to batch open/import/select/navigate/close windows
- Execute webpage actions via `debugPort`: `click/fill/press/extract/screenshot`
- Support multi-window task orchestration and concurrency control
- Support multi-step `run-plan` workflows with automatic progress reporting

Shared base actions:
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

## Installation

For both OpenClaw and Hermes editions:

1. Place the target skill folder under the agent `skills` directory
2. Enter that skill directory
3. Run:
```bash
npm install
```
4. Edit `config.json` and set:
   - `api_token`: API token generated in ChromeManager
   - `api_host`: API host address (usually `127.0.0.1`)
   - `api_port`: API port (default `18923`)
   - `software_path`: local install path of ChromeManager executable (Windows example: `D:/***/***/ChromeManager.exe`; macOS example: `/Applications/***/ChromeManager.app`)
   - `autoStart`: whether to auto-launch ChromeManager when not running (`true`/`false`)
5. Enable local API in ChromeManager and make sure the token matches `api_token`

## OpenClaw and Hermes

### OpenClaw

- Windows (local OpenClaw):
  - `C:\Users\<your-username>\.openclaw\workspace\skills\`
- Windows (OpenClaw running in WSL):
  - `~/.openclaw/workspace/skills/`
- macOS:
  - `~/.openclaw/workspace/skills/`
- Trigger style: supports `/cm` and `/chromemanager`

### Hermes

- Windows (local Hermes):
  - `C:\Users\<your-username>\.hermes\skills\`
  - or Hermes external skills scan directory
- Windows (Hermes running in WSL):
  - `~/.hermes/skills/`
  - or Hermes external skills scan directory
- macOS:
  - `~/.hermes/skills/`
  - or Hermes external skills scan directory
- Trigger style: natural-language trigger (via memory keywords) is recommended

## Command Examples

> [!IMPORTANT]
> **For first-time setup, configure triggers first:**
> - **OpenClaw**:
>   1. Read and load `chromemanager-skill-openclaw/SKILL.md`, then bind `/cm` and `/chromemanager` to `chromemanager-skill-openclaw` as triggers
> - **Hermes**:
>   1. Read and load `chromemanager-skill-hermes/SKILL.md`, then save `cm`, `ChromeManager`, and `chromemanager` as memory triggers, and route them to `chromemanager-skill-hermes` with priority

Single-line task example:

```text
/cm prepare 1-5, open https://example.com, click "Check in", then close all pages
```

You can also split into steps:

```text
/cm prepare 1-5
/cm open https://example.com
/cm click "Check in"
/cm close all pages
```

## Concurrency Control

If users need to control concurrency, they can describe it directly in natural language:

- "run in batches of 2 windows"
- "run in batches of 3 windows"
- "run all in parallel"
- "run serially"

Recommendations:
- Increase concurrency for "open page" and "close page"
- Keep "click" and "input" more conservative to reduce page-state divergence

## run-plan

Use `run-plan` for longer workflows, especially when you need:
- multi-step chains (for example: prepare -> navigate -> fill -> submit -> validate)
- step-to-step result reuse
- conditional branches, failure policies, and concurrency control

Default behavior:
- `run-plan` appends an automatic `report-progress` at the end
- `autoReportOnPlanEnd` default: `true`
- `autoReportCapture` default: `desktop` (set `none` to disable screenshots)
- `autoReportStrict` default: `false` (auto-report failure does not fail the whole plan)
- `autoReportFailedQuestion` lets you customize the follow-up question when blocked

Recommended practice:
- send one `report-progress` after each key stage
- when validation/recovery fails or wallet confirmation is blocked, screenshot first and report
- include: current stage, affected windows, result status, and next-step question

**Join the NoBiggie XChat group for discussion:** [![XChat Group](https://img.shields.io/badge/XChat%20Group-000000.svg?style=flat&logo=x&logoColor=white)](https://x.com/i/chat/group_join/g2043878131141095639/HSWv2DsC7g)
