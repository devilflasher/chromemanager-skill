import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { readConfig, ensureRuntimeDirs, refsDir } from './lib/config.js';
import { ChromeManagerClient } from './lib/chromemanager-client.js';
import { withWindowPage } from './lib/cdp-session.js';
import { captureDesktopScreenshot } from './lib/desktop-capture.js';
import { createProgressReport } from './lib/report-progress.js';
import { captureSnapshot, loadSnapshot, saveSnapshot } from './lib/snapshot-engine.js';
import { resolveRef, buildTemplateDescriptor } from './lib/ref-resolver.js';
import { inspectStage, matchesStage } from './lib/stage-validator.js';
import { createWindowResult, summarizeFleetResults } from './lib/result.js';
import { jitterBetween, parseWindowSpec, resolveConcurrency, selectWindows } from './lib/window-orchestrator.js';
import { createSkippedStepResult, parsePlanInput, buildStepArgs, createPlanContext, resolveFailurePolicy, resolveStepTemplates, shouldRunStep, summarizePlanResults } from './lib/plan-runner.js';

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    i++;
  }
  return result;
}

function toArray(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value == null) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function looksFillable(item) {
  if (!item) {
    return false;
  }
  const tag = String(item.tag || '').toLowerCase();
  const role = String(item.role || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    return true;
  }
  if (role.includes('textbox') || role.includes('searchbox')) {
    return true;
  }
  return ['text', 'search', 'email', 'password', 'number', 'tel', 'url'].includes(type);
}

function resolveFillRef(snapshot, query, preferred) {
  if (looksFillable(preferred)) {
    return preferred;
  }

  const variants = [
    { ...query, role: query.role || 'textbox' },
    { ...query, tag: query.tag || 'textarea' },
    { ...query, tag: 'input' }
  ];

  for (const variant of variants) {
    const candidate = resolveRef(snapshot, variant);
    if (looksFillable(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function getWindowUrl(windowInfo) {
  try {
    return await withWindowPage(windowInfo, async ({ page }) => page.url() || '');
  } catch {
    return '';
  }
}

function urlMatchesTarget(currentUrl, targetUrl) {
  const current = String(currentUrl || '');
  const target = String(targetUrl || '');
  if (!current || !target) {
    return false;
  }
  if (current.startsWith(target)) {
    return true;
  }
  try {
    const targetObj = new URL(target);
    const currentObj = new URL(current);
    return currentObj.origin === targetObj.origin && currentObj.pathname === targetObj.pathname;
  } catch {
    return false;
  }
}

async function waitForNavigationSettle(config, windows, targetUrl, timeoutOverrideMs) {
  if (!targetUrl || windows.length === 0) {
    return { ok: true, pending: [] };
  }

  const timeoutMs = toNumber(timeoutOverrideMs, toNumber(config.execution.navigate_wait_timeout_ms, 15000));
  const pollMs = toNumber(config.execution.navigate_wait_poll_ms, 700);
  const deadline = Date.now() + timeoutMs;
  let lastPending = [];

  while (Date.now() < deadline) {
    const pending = [];
    for (const windowInfo of windows) {
      const url = await getWindowUrl(windowInfo);
      if (!urlMatchesTarget(url, targetUrl)) {
        pending.push({
          windowNumber: windowInfo.number,
          url
        });
      }
    }

    if (pending.length === 0) {
      return { ok: true, pending: [] };
    }

    lastPending = pending;
    await delay(pollMs);
  }

  return { ok: false, pending: lastPending };
}

function mergeTaskFileArgs(rawArgs) {
  if (!rawArgs.taskFile) {
    return rawArgs;
  }
  const taskData = JSON.parse(fs.readFileSync(path.resolve(rawArgs.taskFile), 'utf8'));
  return {
    ...taskData,
    ...rawArgs
  };
}

function cleanupTaskFile(args) {
  if (args.cleanupTaskFile !== 'false' && args.taskFile) {
    fs.rmSync(path.resolve(args.taskFile), { force: true });
  }
}

function resolveWindowValue(value, windowNumber) {
  if (value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    const key = String(windowNumber);
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
    if (Object.prototype.hasOwnProperty.call(value, 'default')) {
      return value.default;
    }
  }

  return value;
}

function resolveWindowArray(value, windowNumber) {
  const scoped = resolveWindowValue(value, windowNumber);
  return toArray(scoped);
}

function buildWindowQuery(payload, windowNumber) {
  return {
    ref: resolveWindowValue(payload.ref, windowNumber),
    hint: resolveWindowValue(payload.hint, windowNumber),
    text: resolveWindowValue(payload.textHint, windowNumber),
    role: resolveWindowValue(payload.role, windowNumber),
    tag: resolveWindowValue(payload.tag, windowNumber),
    type: resolveWindowValue(payload.inputType, windowNumber),
    containerHint: resolveWindowValue(payload.containerHint, windowNumber),
    preferInteractive: true
  };
}

function buildWindowPayload(payload, windowNumber, overrides = {}) {
  return {
    ...payload,
    ...overrides,
    ref: resolveWindowValue(payload.ref, windowNumber),
    hint: resolveWindowValue(payload.hint, windowNumber),
    textHint: resolveWindowValue(payload.textHint, windowNumber),
    role: resolveWindowValue(payload.role, windowNumber),
    tag: resolveWindowValue(payload.tag, windowNumber),
    inputType: resolveWindowValue(payload.inputType, windowNumber),
    containerHint: resolveWindowValue(payload.containerHint, windowNumber),
    text: resolveWindowValue(payload.text, windowNumber),
    key: resolveWindowValue(payload.key, windowNumber),
    outDir: resolveWindowValue(payload.outDir, windowNumber),
    fullPage: resolveWindowValue(payload.fullPage, windowNumber),
    expectedUrl: resolveWindowValue(payload.expectedUrl, windowNumber),
    expectedUrlPrefix: resolveWindowValue(payload.expectedUrlPrefix, windowNumber),
    textHints: resolveWindowArray(payload.textHints, windowNumber),
    navigateUrl: resolveWindowValue(payload.navigateUrl, windowNumber)
  };
}

async function snapshotWindow(windowInfo, config) {
  return withWindowPage(windowInfo, async ({ page }) => {
    const snapshot = await captureSnapshot(page, {
      maxItems: config.snapshot.max_items,
      includeTextBlocks: config.snapshot.include_text_blocks
    });
    snapshot.windowNumber = windowInfo.number;
    const savedPath = saveSnapshot(refsDir, windowInfo.number, snapshot);
    return {
      snapshot,
      savedPath
    };
  });
}

async function postActionSnapshot(windowInfo, config) {
  if (!config.execution.post_action_snapshot) {
    return null;
  }
  const { snapshot } = await snapshotWindow(windowInfo, config);
  return snapshot;
}

async function clickOrFillWindow(windowInfo, config, action, query, payload = {}) {
  return withWindowPage(windowInfo, async ({ page }) => {
    let snapshot = loadSnapshot(refsDir, windowInfo.number);
    if (!snapshot) {
      snapshot = (await snapshotWindow(windowInfo, config)).snapshot;
    }

    let resolved = resolveRef(snapshot, query);
    if (action === 'fill') {
      resolved = resolveFillRef(snapshot, query, resolved);
    }
    if (!resolved) {
      snapshot = (await snapshotWindow(windowInfo, config)).snapshot;
      resolved = resolveRef(snapshot, query);
      if (action === 'fill') {
        resolved = resolveFillRef(snapshot, query, resolved);
      }
    }

    if (!resolved) {
      return createWindowResult(
        {
          action,
          mode: payload.mode,
          windowNumber: windowInfo.number,
          url: page.url(),
          snapshotId: snapshot?.snapshotId || ''
        },
        {
          reason: 'No matching ref found',
          retryable: true
        }
      );
    }

    const locator = page.locator(`xpath=${resolved.xpath}`).first();
    if (action === 'click') {
      await locator.click({ timeout: config.default_timeout_ms });
    } else {
      await locator.fill(String(payload.text ?? ''), { timeout: config.default_timeout_ms });
      if (payload.submit) {
        await locator.press('Enter');
      }
    }

    const latestSnapshot = await postActionSnapshot(windowInfo, config);
    return createWindowResult(
      {
        action,
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: page.url(),
        snapshotId: latestSnapshot?.snapshotId || snapshot.snapshotId,
        usedRef: resolved.ref
      },
      {
        ok: true,
        retryable: false,
        reason: `${action} succeeded`
      }
    );
  });
}

async function clickWindow(windowInfo, config, query, payload) {
  return clickOrFillWindow(windowInfo, config, 'click', query, payload);
}

async function fillWindow(windowInfo, config, query, payload) {
  return clickOrFillWindow(windowInfo, config, 'fill', query, payload);
}

async function pressWindow(windowInfo, config, payload) {
  return withWindowPage(windowInfo, async ({ page }) => {
    await page.keyboard.press(payload.key, { timeout: config.default_timeout_ms });
    const latestSnapshot = await postActionSnapshot(windowInfo, config);
    return createWindowResult(
      {
        action: 'press',
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: page.url(),
        snapshotId: latestSnapshot?.snapshotId || '',
        usedRef: ''
      },
      {
        ok: true,
        reason: `Pressed ${payload.key}`
      }
    );
  });
}

async function extractWindow(windowInfo, config, query, payload) {
  return withWindowPage(windowInfo, async ({ page }) => {
    let snapshot = loadSnapshot(refsDir, windowInfo.number);
    if (!snapshot) {
      snapshot = (await snapshotWindow(windowInfo, config)).snapshot;
    }

    const resolved = resolveRef(snapshot, query);
    if (!resolved) {
      return createWindowResult(
        {
          action: 'extract',
          mode: payload.mode,
          windowNumber: windowInfo.number,
          url: page.url(),
          snapshotId: snapshot.snapshotId
        },
        {
          reason: 'No matching ref found',
          retryable: true
        }
      );
    }

    const locator = page.locator(`xpath=${resolved.xpath}`).first();
    const text = await locator.innerText().catch(async () => locator.textContent().catch(() => ''));
    return createWindowResult(
      {
        action: 'extract',
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: page.url(),
        snapshotId: snapshot.snapshotId,
        usedRef: resolved.ref
      },
      {
        ok: true,
        reason: 'Extract succeeded',
        retryable: false,
        value: text
      }
    );
  });
}

async function screenshotWindow(windowInfo, config, payload) {
  const outputDir = path.resolve(payload.outDir || path.join(process.cwd(), 'captures'));
  fs.mkdirSync(outputDir, { recursive: true });

  return withWindowPage(windowInfo, async ({ page }) => {
    const filePath = path.join(outputDir, `window-${windowInfo.number}-${Date.now()}.png`);
    await page.screenshot({
      path: filePath,
      fullPage: payload.fullPage === true || payload.fullPage === 'true'
    });

    return createWindowResult(
      {
        action: 'screenshot',
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: page.url(),
        snapshotId: '',
        usedRef: ''
      },
      {
        ok: true,
        reason: 'Screenshot captured',
        filePath
      }
    );
  });
}

async function validateWindow(windowInfo, payload) {
  return withWindowPage(windowInfo, async ({ page }) => {
    const stage = await inspectStage(page);
    const validation = matchesStage(stage, {
      expectedUrl: payload.expectedUrl,
      expectedUrlPrefix: payload.expectedUrlPrefix,
      textHints: toArray(payload.textHints)
    });

    return createWindowResult(
      {
        action: 'validate-stage',
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: stage.url,
        snapshotId: '',
        usedRef: ''
      },
      {
        ok: validation.ok,
        reason: validation.reason,
        retryable: !validation.ok,
        stage
      }
    );
  });
}

async function recoverWindow(windowInfo, config, payload) {
  const rounds = toNumber(payload.recoveryRounds, config.execution.default_recovery_rounds);
  return withWindowPage(windowInfo, async ({ page }) => {
    let lastReason = 'Unknown recovery failure';

    for (let round = 1; round <= rounds; round++) {
      try {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: config.default_timeout_ms });
      } catch {
        // continue
      }

      if (payload.navigateUrl) {
        try {
          await page.goto(payload.navigateUrl, {
            waitUntil: 'domcontentloaded',
            timeout: config.default_timeout_ms
          });
        } catch (error) {
          lastReason = error.message;
        }
      }

      const stage = await inspectStage(page);
      const validation = matchesStage(stage, {
        expectedUrl: payload.expectedUrl || payload.navigateUrl,
        expectedUrlPrefix: payload.expectedUrlPrefix,
        textHints: toArray(payload.textHints)
      });

      if (validation.ok) {
        const latestSnapshot = await postActionSnapshot(windowInfo, config);
        return createWindowResult(
          {
            action: 'recover',
            mode: payload.mode,
            windowNumber: windowInfo.number,
            url: stage.url,
            snapshotId: latestSnapshot?.snapshotId || '',
            usedRef: ''
          },
          {
            ok: true,
            reason: `Recovered in round ${round}`,
            stage
          }
        );
      }

      lastReason = validation.reason;
      await delay(300);
    }

    return createWindowResult(
      {
        action: 'recover',
        mode: payload.mode,
        windowNumber: windowInfo.number,
        url: '',
        snapshotId: '',
        usedRef: ''
      },
      {
        reason: lastReason,
        retryable: false
      }
    );
  });
}

async function runActionAcrossWindows(windows, payload, handlerFactory) {
  const config = readConfig();
  const mode = payload.mode || config.execution.default_mode;
  const results = [];
  let template = null;
  const concurrency = resolveConcurrency(payload.concurrency, windows.length);

  async function executeWindow(windowInfo) {
    const query = buildWindowQuery(payload, windowInfo.number);
    const windowPayload = buildWindowPayload(payload, windowInfo.number, { mode, concurrency });

    const effectiveQuery = template && mode !== 'strict'
      ? {
          ...template,
          ...query,
          ref: query.ref || undefined,
          hint: query.hint || template.hint
        }
      : query;

    try {
      const result = await handlerFactory(windowInfo, config, effectiveQuery, windowPayload);

      if (!template && result.ok && effectiveQuery.ref !== query.ref && (query.hint || query.text)) {
        const snapshot = loadSnapshot(refsDir, windowInfo.number);
        const resolved = snapshot ? resolveRef(snapshot, effectiveQuery) : null;
        template = buildTemplateDescriptor(resolved, effectiveQuery);
      }

      return result;
    } catch (error) {
      return createWindowResult(
        {
          action: payload.action,
          mode,
          windowNumber: windowInfo.number,
          url: '',
          snapshotId: '',
          usedRef: ''
        },
        {
          reason: error.message,
          retryable: true
        }
      );
    }
  }

  for (let start = 0; start < windows.length; start += concurrency) {
    const batch = windows.slice(start, start + concurrency);
    const batchResults = await Promise.all(batch.map(executeWindow));
    results.push(...batchResults);

    if (start + concurrency < windows.length) {
      await jitterBetween(
        config.execution.default_jitter_min_ms,
        config.execution.default_jitter_max_ms,
        payload.jitter !== 'false'
      );
    }
  }

  return summarizeFleetResults(payload.action, mode, results);
}

async function executeSingleAction(action, args, config, client) {
  if (action === 'desktop-screenshot') {
    return captureDesktopScreenshot(args);
  }
  if (action === 'report-progress') {
    return createProgressReport(args);
  }

  if (action === 'prepare') {
    const windowsSpec = args.windows || args.numbers || '';
    const targetSpec = parseWindowSpec(windowsSpec);
    if (windowsSpec) {
      await client.openWindows(windowsSpec);
    }
    await client.importWindows();
    await client.selectAll(true);
    await client.arrangeWindows(args.arrange || 'grid');

    let navigationSettle = null;
    if (args.navigateUrl) {
      await client.navigateAll(args.navigateUrl, windowsSpec);
      const imported = await client.getWindows();
      const targets = targetSpec.length > 0 ? selectWindows(imported, targetSpec) : imported;
      navigationSettle = await waitForNavigationSettle(config, targets, args.navigateUrl, args.navigateWaitMs);
    }

    const windows = await client.getWindows();
    return {
      ok: !navigationSettle || navigationSettle.ok,
      action: 'prepare',
      mode: args.mode || config.execution.default_mode,
      totalWindows: windows.length,
      windows,
      navigationSettle,
      reason: navigationSettle && !navigationSettle.ok
        ? 'Navigation request sent, but some windows did not reach target URL in time'
        : 'Prepare completed'
    };
  }

  const allWindows = await client.getWindows();
  const requestedWindows = selectWindows(allWindows, parseWindowSpec(args.windows || args.numbers || ''));
  if (requestedWindows.length === 0) {
    throw new Error('No target windows were resolved');
  }

  if (action === 'snapshot') {
    const results = [];
    for (const windowInfo of requestedWindows) {
      try {
        const { snapshot, savedPath } = await snapshotWindow(windowInfo, config);
        results.push(
          createWindowResult(
            {
              action,
              mode: args.mode || config.execution.default_mode,
              windowNumber: windowInfo.number,
              url: snapshot.url,
              snapshotId: snapshot.snapshotId,
              usedRef: ''
            },
            {
              ok: true,
              reason: 'Snapshot captured',
              retryable: false,
              snapshotPath: savedPath,
              itemCount: snapshot.itemCount
            }
          )
        );
      } catch (error) {
        results.push(
          createWindowResult(
            {
              action,
              mode: args.mode || config.execution.default_mode,
              windowNumber: windowInfo.number,
              url: '',
              snapshotId: '',
              usedRef: ''
            },
            {
              reason: error.message,
              retryable: true
            }
          )
        );
      }
    }

    return summarizeFleetResults(action, args.mode || config.execution.default_mode, results);
  }

  if (action === 'click') {
    return runActionAcrossWindows(requestedWindows, args, clickWindow);
  }
  if (action === 'fill') {
    return runActionAcrossWindows(requestedWindows, args, fillWindow);
  }
  if (action === 'press') {
    return runActionAcrossWindows(requestedWindows, args, (_windowInfo, cfg, _query, payload) => pressWindow(_windowInfo, cfg, payload));
  }
  if (action === 'extract') {
    return runActionAcrossWindows(requestedWindows, args, extractWindow);
  }
  if (action === 'screenshot') {
    return runActionAcrossWindows(requestedWindows, args, (_windowInfo, cfg, _query, payload) => screenshotWindow(_windowInfo, cfg, payload));
  }
  if (action === 'validate-stage') {
    return runActionAcrossWindows(requestedWindows, args, (_windowInfo, _cfg, _query, payload) => validateWindow(_windowInfo, payload));
  }
  if (action === 'recover') {
    return runActionAcrossWindows(requestedWindows, args, (_windowInfo, cfg, _query, payload) => recoverWindow(_windowInfo, cfg, payload));
  }

  throw new Error(`Unsupported action: ${action}`);
}

async function executePlan(args, config, client) {
  const parsedPlan = parsePlanInput(args);
  const mode = args.mode || parsedPlan.meta.mode || config.execution.default_mode;
  const stopOnFailure = String(args.stopOnFailure ?? parsedPlan.meta.stopOnFailure ?? 'true') !== 'false';
  const autoReportOnPlanEnd = toBoolean(args.autoReportOnPlanEnd ?? parsedPlan.meta.autoReportOnPlanEnd, true);
  const autoReportStrict = toBoolean(args.autoReportStrict ?? parsedPlan.meta.autoReportStrict, false);
  const autoReportCapture = args.autoReportCapture ?? parsedPlan.meta.autoReportCapture ?? 'desktop';
  const autoReportWindows = args.windows || parsedPlan.meta.windows || '';
  const autoReportFailedQuestion = args.autoReportFailedQuestion
    ?? parsedPlan.meta.autoReportFailedQuestion
    ?? '检测到部分步骤失败，是否继续执行恢复流程？';
  const stepResults = [];
  let skipRemainingReason = '';

  for (let index = 0; index < parsedPlan.steps.length; index++) {
    const step = parsedPlan.steps[index];
    const preStepName = step.name || `step-${index + 1}`;

    if (skipRemainingReason) {
      stepResults.push(
        createSkippedStepResult(index, preStepName, step.action, `Skipped by previous onFailure=skipRemaining: ${skipRemainingReason}`)
      );
      continue;
    }

    const baseStepArgs = buildStepArgs(
      {
        ...args,
        mode
      },
      parsedPlan.meta,
      step,
      index
    );
    const planContext = createPlanContext(stepResults);
    const stepArgs = resolveStepTemplates(baseStepArgs, planContext);
    const condition = shouldRunStep(stepArgs, planContext);

    if (!condition.run) {
      stepResults.push(
        createSkippedStepResult(index, stepArgs.stepName, step.action, `Skipped by when: ${condition.reason}`)
      );
      continue;
    }

    try {
      const result = await executeSingleAction(step.action, stepArgs, config, client);
      const stepRecord = {
        ok: !!result.ok,
        stepIndex: index,
        stepName: stepArgs.stepName,
        action: step.action,
        result
      };
      stepResults.push(stepRecord);

      if (!result.ok) {
        const policy = resolveFailurePolicy(stepArgs.onFailure, stopOnFailure);
        if (policy === 'stop') {
          break;
        }
        if (policy === 'skipRemaining') {
          skipRemainingReason = result.reason || `${stepArgs.stepName} failed`;
        }
      }
    } catch (error) {
      const stepRecord = {
        ok: false,
        stepIndex: index,
        stepName: stepArgs.stepName,
        action: step.action,
        result: {
          ok: false,
          action: step.action,
          mode,
          reason: error.message,
          retryable: false
        }
      };
      stepResults.push(stepRecord);

      const policy = resolveFailurePolicy(stepArgs.onFailure, stopOnFailure);
      if (policy === 'stop') {
        break;
      }
      if (policy === 'skipRemaining') {
        skipRemainingReason = error.message || `${stepArgs.stepName} failed`;
      }
    }
  }

  if (autoReportOnPlanEnd) {
    const preReportSummary = summarizePlanResults(mode, stepResults);
    const failedStepNames = preReportSummary.failedSteps.map(step => step.stepName).filter(Boolean);
    const reportStatus = preReportSummary.ok ? 'completed' : 'failed';
    const reportStage = preReportSummary.ok ? 'plan-finished' : 'plan-failed';
    const reportMessage = preReportSummary.ok
      ? `run-plan completed. totalSteps=${preReportSummary.totalSteps}`
      : `run-plan failed steps: ${failedStepNames.join(', ') || 'unknown'}`;

    const reportPayload = {
      ...args,
      action: 'report-progress',
      mode,
      capture: autoReportCapture,
      status: reportStatus,
      stage: reportStage,
      message: reportMessage,
      windows: autoReportWindows,
      nextQuestion: preReportSummary.ok ? '' : autoReportFailedQuestion
    };

    const reportIndex = stepResults.length;
    try {
      const reportResult = await executeSingleAction('report-progress', reportPayload, config, client);
      stepResults.push({
        ok: autoReportStrict ? !!reportResult.ok : true,
        stepIndex: reportIndex,
        stepName: 'auto-report-progress',
        action: 'report-progress',
        result: reportResult
      });
    } catch (error) {
      stepResults.push({
        ok: autoReportStrict ? false : true,
        stepIndex: reportIndex,
        stepName: 'auto-report-progress',
        action: 'report-progress',
        result: {
          ok: false,
          action: 'report-progress',
          mode,
          reason: error.message,
          retryable: true
        }
      });
    }
  }

  return summarizePlanResults(mode, stepResults);
}

async function main() {
  ensureRuntimeDirs();
  const rawArgs = parseArgs(process.argv.slice(2));
  const args = mergeTaskFileArgs(rawArgs);
  const config = readConfig();

  const action = args.action;
  if (!action) {
    throw new Error('Missing --action');
  }

  const standaloneActions = new Set(['desktop-screenshot', 'report-progress']);
  const client = standaloneActions.has(action)
    ? null
    : new ChromeManagerClient(config);

  if (client) {
    await client.ensureReady();
  }

  const output = action === 'run-plan'
    ? await executePlan(args, config, client)
    : await executeSingleAction(action, args, config, client);

  cleanupTaskFile(args);

  process.stdout.write(JSON.stringify(output, null, 2));
}

main().catch(error => {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: error.message
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
