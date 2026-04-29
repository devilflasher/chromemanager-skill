import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function headers(config) {
  return {
    Authorization: `Bearer ${config.api_token}`,
    'Content-Type': 'application/json'
  };
}

function baseUrl(config) {
  return `http://${config.api_host}:${config.api_port}`;
}

function looksLikeWindowsPath(value) {
  return /^[A-Za-z]:\\/.test(String(value || ''));
}

function toWindowsPath(value) {
  const raw = String(value || '');
  if (looksLikeWindowsPath(raw)) {
    return raw;
  }
  const mntMatch = raw.match(/^\/mnt\/([a-zA-Z])\/(.+)$/);
  if (!mntMatch) {
    return raw;
  }
  const drive = mntMatch[1].toUpperCase();
  const rest = mntMatch[2].replace(/\//g, '\\');
  return `${drive}:\\${rest}`;
}

function escapeForPowershellSingleQuoted(value) {
  return String(value || '').replace(/'/g, "''");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`ChromeManager API ${response.status}: ${text || 'empty response'}`);
  }
  return body;
}

function normalizeWindowsPayload(json) {
  if (Array.isArray(json)) {
    return json;
  }
  if (Array.isArray(json?.data)) {
    return json.data;
  }
  if (Array.isArray(json?.data?.data)) {
    return json.data.data;
  }
  return [];
}

function normalizeWindow(windowInfo) {
  return {
    number: Number(windowInfo.number),
    title: windowInfo.title || '',
    hwnd: Number(windowInfo.hwnd || 0),
    pid: Number(windowInfo.pid || 0),
    debugPort: Number(windowInfo.debugPort || 0),
    userDataDir: windowInfo.userDataDir || '',
    isRunning: windowInfo.isRunning !== false
  };
}

export class ChromeManagerClient {
  constructor(config) {
    this.config = config;
  }

  async ping() {
    try {
      const url = `${baseUrl(this.config)}${this.config.api_endpoints.windows}`;
      const response = await fetch(url, {
        headers: headers(this.config)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  startService() {
    if (!this.config.software_path) {
      throw new Error('config.software_path is empty');
    }

    if (process.platform === 'linux') {
      const windowsPath = toWindowsPath(this.config.software_path);
      if (looksLikeWindowsPath(windowsPath)) {
        const psCommand = `Start-Process -FilePath '${escapeForPowershellSingleQuoted(windowsPath)}'`;
        spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        return;
      }
    }

    spawn(this.config.software_path, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
  }

  async ensureReady() {
    if (await this.ping()) {
      return;
    }

    if (!this.config.autoStart) {
      throw new Error('ChromeManager API is unreachable and autoStart is disabled');
    }

    this.startService();

    const deadline = Date.now() + this.config.startup_wait_ms;
    while (Date.now() < deadline) {
      if (await this.ping()) {
        return;
      }
      await delay(1000);
    }

    throw new Error('ChromeManager API did not become reachable in time');
  }

  async getWindows() {
    const url = `${baseUrl(this.config)}${this.config.api_endpoints.windows}`;
    const json = await requestJson(url, {
      headers: headers(this.config)
    });
    return normalizeWindowsPayload(json).map(normalizeWindow).filter(w => w.number > 0);
  }

  async post(endpoint, payload = {}) {
    const url = `${baseUrl(this.config)}${endpoint}`;
    return requestJson(url, {
      method: 'POST',
      headers: headers(this.config),
      body: JSON.stringify(payload)
    });
  }

  async openWindows(numbers) {
    return this.post(this.config.api_endpoints.open_window, { numbers });
  }

  async importWindows() {
    return this.post(this.config.api_endpoints.import_windows, {});
  }

  async selectAll(selected = true) {
    return this.post(this.config.api_endpoints.select_all, { selected });
  }

  async arrangeWindows(mode = 'grid') {
    return this.post(this.config.api_endpoints.arrange_windows, { mode });
  }

  async navigateAll(url, numbers = '') {
    return this.post(this.config.api_endpoints.navigate_all, {
      url,
      numbers
    });
  }

  async zoomWindows(numbers, level) {
    return this.post(this.config.api_endpoints.zoom_windows, {
      numbers,
      target: numbers,
      level
    });
  }

  async closeWindows(numbers = '') {
    return this.post(this.config.api_endpoints.close_windows, {
      numbers
    });
  }
}
