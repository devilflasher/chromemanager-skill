import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { desktopCapturesDir } from './config.js';

const execFileAsync = promisify(execFile);

function sanitizePrefix(value) {
  return String(value || 'desktop')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'desktop';
}

function buildDesktopCapturePath(payload = {}) {
  const outputDir = path.resolve(payload.outDir || desktopCapturesDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const prefix = sanitizePrefix(payload.prefix || payload.filenamePrefix || 'desktop');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(outputDir, `${prefix}-${timestamp}.png`);
}

function fileLooksValid(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function captureWindowsDesktop(filePath) {
  const script = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$outPath = $env:CHROMEMANAGER_CAPTURE_OUT
if ([string]::IsNullOrWhiteSpace($outPath)) { throw "Missing capture output path" }
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bitmap.Size)
  $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`.trim();

  const command = process.env.ComSpec
    ? 'powershell.exe'
    : 'powershell';

  return execFileAsync(
    command,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    {
      env: {
        ...process.env,
        CHROMEMANAGER_CAPTURE_OUT: filePath
      },
      windowsHide: true
    }
  );
}

async function captureMacDesktop(filePath) {
  return execFileAsync('screencapture', ['-x', '-t', 'png', filePath], {
    env: process.env
  });
}

function buildDesktopCaptureFailure(platform, filePath, error) {
  const stderr = String(error?.stderr || '').trim();
  const stdout = String(error?.stdout || '').trim();
  const detail = stderr || stdout || error?.message || 'Unknown desktop screenshot failure';

  if (platform === 'darwin') {
    return {
      ok: false,
      action: 'desktop-screenshot',
      mode: 'local',
      platform,
      filePath,
      mediaPath: `MEDIA:${filePath}`,
      reason: 'macOS desktop screenshot failed',
      retryable: true,
      userHint: 'Please allow the current terminal or host app in System Settings > Privacy & Security > Screen & System Audio Recording, then retry.',
      details: detail
    };
  }

  return {
    ok: false,
    action: 'desktop-screenshot',
    mode: 'local',
    platform,
    filePath,
    mediaPath: `MEDIA:${filePath}`,
    reason: `Desktop screenshot failed on ${platform}`,
    retryable: true,
    userHint: 'Please verify the screenshot command can access the desktop and that the output directory is writable, then retry.',
    details: detail
  };
}

export async function captureDesktopScreenshot(payload = {}) {
  const platform = os.platform();
  const filePath = buildDesktopCapturePath(payload);

  try {
    if (platform === 'win32') {
      await captureWindowsDesktop(filePath);
    } else if (platform === 'darwin') {
      await captureMacDesktop(filePath);
    } else {
      return {
        ok: false,
        action: 'desktop-screenshot',
        mode: 'local',
        platform,
        filePath,
        mediaPath: `MEDIA:${filePath}`,
        reason: `Desktop screenshot is not implemented for platform: ${platform}`,
        retryable: false,
        userHint: 'This helper currently supports Windows and macOS only.'
      };
    }

    if (!fileLooksValid(filePath)) {
      return buildDesktopCaptureFailure(platform, filePath, new Error('Screenshot file was not created or is empty'));
    }

    return {
      ok: true,
      action: 'desktop-screenshot',
      mode: 'local',
      platform,
      filePath,
      mediaPath: `MEDIA:${filePath}`,
      reason: 'Desktop screenshot captured',
      retryable: false
    };
  } catch (error) {
    return buildDesktopCaptureFailure(platform, filePath, error);
  }
}
