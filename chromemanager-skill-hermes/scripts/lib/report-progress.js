import { captureDesktopScreenshot } from './desktop-capture.js';

function normalizeStatus(value) {
  const normalized = String(value || 'info').trim().toLowerCase();
  return normalized || 'info';
}

function toWindowList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function buildSummary({ status, stage, message, windows }) {
  const parts = [];
  if (status) {
    parts.push(`status=${status}`);
  }
  if (stage) {
    parts.push(`stage=${stage}`);
  }
  if (windows.length > 0) {
    parts.push(`windows=${windows.join(',')}`);
  }
  if (message) {
    parts.push(`message=${message}`);
  }
  return parts.join(' | ');
}

export async function createProgressReport(payload = {}) {
  const status = normalizeStatus(payload.status);
  const stage = String(payload.stage || '').trim();
  const message = String(payload.message || payload.text || '').trim();
  const nextQuestion = String(payload.nextQuestion || payload.ask || '').trim();
  const windows = toWindowList(payload.windows || payload.numbers);
  const captureMode = String(payload.capture || 'desktop').trim().toLowerCase();

  const base = {
    action: 'report-progress',
    mode: 'local',
    status,
    stage,
    message,
    nextQuestion,
    windows,
    summary: buildSummary({ status, stage, message, windows })
  };

  if (captureMode === 'false' || captureMode === 'none' || captureMode === 'off') {
    return {
      ok: true,
      ...base,
      reason: 'Progress report generated without screenshot',
      retryable: false
    };
  }

  if (captureMode !== 'desktop') {
    return {
      ok: false,
      ...base,
      reason: `Unsupported capture mode: ${payload.capture}`,
      retryable: false,
      userHint: 'Use capture=desktop or capture=none.'
    };
  }

  const screenshot = await captureDesktopScreenshot(payload);
  return {
    ok: screenshot.ok,
    ...base,
    screenshot,
    filePath: screenshot.filePath || '',
    mediaPath: screenshot.mediaPath || '',
    reason: screenshot.ok ? 'Progress report generated' : screenshot.reason,
    retryable: screenshot.retryable,
    userHint: screenshot.userHint || ''
  };
}
