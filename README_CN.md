<div align="center">

# ChromeManager Skill

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-43853D.svg?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Supported-111111.svg?style=flat)](./chromemanager-skill-openclaw/)
[![Hermes](https://img.shields.io/badge/Hermes-Supported-6C47FF.svg?style=flat)](./chromemanager-skill-hermes/)
[![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](../LICENSE)

<strong>作者：Devilflasher</strong>
[![X](https://img.shields.io/badge/X-1DA1F2.svg?style=flat&logo=x&logoColor=white)](https://x.com/DevilflasherX)
[![微信](https://img.shields.io/badge/微信-7BB32A.svg?style=flat&logo=wechat&logoColor=white)](https://x.com/DevilflasherX/status/1781563666485448736 "Devilflasherx")
[![XChat群组](https://img.shields.io/badge/XChat群组-000000.svg?style=flat&logo=x&logoColor=white)](https://x.com/i/chat/group_join/g2043878131141095639/HSWv2DsC7g)

</div>

Other languages: [English](./README.md)

> ## 免责声明
>
> 1. **本项目为开源项目，仅供学习交流使用，不得用于任何闭源商业用途**
> 2. **使用者应遵守当地法律法规，禁止用于任何非法用途**
> 3. **开发者不对因使用本项目导致的直接或间接损失承担任何责任**
> 4. **使用本项目即表示你已阅读并同意本免责声明**

## 工具介绍

`chromemanager-skill` 用于把 **ChromeManager** 接入外部 AI Agent（如 OpenClaw、Hermes），让 Agent 可以通过本地 API 调用窗口管理能力，并基于 `debugPort` 执行网页自动化动作。

当前仓库包含两个独立目录：
- `chromemanager-skill-openclaw`
- `chromemanager-skill-hermes`

两套 skill 的核心能力一致，区别主要在接入方式和触发机制。

## 主要能力

- 调用 ChromeManager 批量打开、导入、选择、导航、关闭窗口
- 基于 `debugPort` 执行网页级 `click/fill/press/extract/screenshot`
- 支持多窗口任务编排与并发控制
- 支持 `run-plan` 多步骤流程执行与自动进度回传

共同支持的基础动作：
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

## 安装说明

无论使用 OpenClaw 版还是 Hermes 版，都需要：

1. 将对应 skill 文件夹放入目标 Agent 的 `skills` 目录
2. 进入对应 skill 目录
3. 执行：
```bash
npm install
```
4. 打开 `config.json`，填写：
   - `api_token`：你在 ChromeManager 里生成的 API Token
   - `api_host`：API 主机地址（通常为 `127.0.0.1`）
   - `api_port`：API 端口（默认 `18923`）
   - `software_path`：本地 ChromeManager 可执行文件安装路径（推荐格式：`D:/code/Program/ChromeDuo V4.0/bin/ChromeManager.exe`）
   - `autoStart`：当 ChromeManager 未运行时是否自动拉起（`true`/`false`）
5. 在 ChromeManager 中启用本地 API，并确认其 Token 与 `api_token` 一致

## OpenClaw 与 Hermes

### OpenClaw

- Windows（本地安装 OpenClaw）：
  - `C:\Users\<你的用户名>\.openclaw\workspace\skills\`
- Windows（OpenClaw 运行在 WSL）：
  - `~/.openclaw/workspace/skills/`
- macOS：
  - `~/.openclaw/workspace/skills/`
- 触发方式：支持 `/cm` 或 `/chromemanager`

### Hermes

- Windows（本地安装 Hermes）：
  - `C:\Users\<你的用户名>\.hermes\skills\`
  - 或 Hermes 外部 skills 扫描目录
- Windows（Hermes 运行在 WSL）：
  - `~/.hermes/skills/`
  - 或 Hermes 外部 skills 扫描目录
- macOS：
  - `~/.hermes/skills/`
  - 或 Hermes 外部 skills 扫描目录
- 触发方式：推荐自然语言触发（依赖记忆中的触发词）

## 命令示例

> [!IMPORTANT]
> **首次接入前，请先完成触发词设置：**
> - **OpenClaw**：
>   1. 先读取并加载 `chromemanager-skill-openclaw/SKILL.md`，再将 `/cm` 和 `/chromemanager` 绑定到 `chromemanager-skill-openclaw` 作为触发词
> - **Hermes**：
>   1. 先读取并加载 `chromemanager-skill-hermes/SKILL.md`，再把 `cm`、`ChromeManager`、`chromemanager` 写入记忆并作为触发词，并优先路由到 `chromemanager-skill-hermes`。

示例命令：

```text
/cm 准备 1-5，打开 https://example.com，点击“签到”按钮，关闭所有网页
```

也可以拆分步骤：

```text
/cm 准备 1-5
/cm 打开 https://example.com
/cm 点击“签到”按钮
/cm 关闭所有网页
```

## 并行控制

如果用户希望控制并发数量，可以在任务里直接描述：

- “分 2 个窗口一批执行”
- “分 3 个窗口一批执行”
- “全部并行执行”
- “串行执行”

建议：
- “打开网页”“关闭网页”可提高并发
- “点击”“输入”建议更保守，避免页面状态分叉

## run-plan

`run-plan` 用于执行较长流程，推荐在以下场景优先使用：
- 需要多步骤串联（如：准备窗口 -> 导航 -> 输入 -> 提交 -> 校验）
- 需要步骤间引用上一步结果
- 需要条件分支、失败策略、并发控制

默认行为：
- `run-plan` 结束时会自动追加一次 `report-progress` 回传
- `autoReportOnPlanEnd` 默认 `true`
- `autoReportCapture` 默认 `desktop`（设为 `none` 可禁用截图）
- `autoReportStrict` 默认 `false`（自动回传失败不阻断整条计划）
- `autoReportFailedQuestion` 可自定义阻塞时的追问文案

建议实践：
- 关键阶段完成后，主动回传一次 `report-progress`
- 发生校验失败、恢复失败、钱包确认阻塞时，优先截图并回传
- 回传内容尽量包含：当前阶段、受影响窗口、结果状态、下一步问题

**欢迎加入NoBiggie的XChat群组讨论交流：** [![XChat群组](https://img.shields.io/badge/XChat群组-000000.svg?style=flat&logo=x&logoColor=white)](https://x.com/i/chat/group_join/g2043878131141095639/HSWv2DsC7g)
