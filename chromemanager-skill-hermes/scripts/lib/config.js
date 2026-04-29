import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const skillDir = path.resolve(__dirname, '..', '..');
export const configPath = path.join(skillDir, 'config.json');
export const refsDir = path.join(skillDir, 'runtime-refs');
export const desktopCapturesDir = path.join(skillDir, 'tmp', 'desktop-captures');

export function readConfig() {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return {
    api_token: raw.api_token || '',
    api_port: Number(raw.api_port || 18923),
    api_host: raw.api_host || '127.0.0.1',
    software_path: raw.software_path || '',
    autoStart: raw.autoStart !== false,
    startup_wait_ms: Number(raw.startup_wait_ms || 30000),
    default_timeout_ms: Number(raw.default_timeout_ms || 30000),
    snapshot: {
      max_items: Number(raw.snapshot?.max_items || 220),
      include_text_blocks: raw.snapshot?.include_text_blocks !== false,
      annotated_screenshot: raw.snapshot?.annotated_screenshot !== false
    },
    execution: {
      default_mode: raw.execution?.default_mode || 'balanced',
      default_jitter_min_ms: Number(raw.execution?.default_jitter_min_ms || 250),
      default_jitter_max_ms: Number(raw.execution?.default_jitter_max_ms || 900),
      default_recovery_rounds: Number(raw.execution?.default_recovery_rounds || 3),
      post_action_snapshot: raw.execution?.post_action_snapshot !== false
    },
    api_endpoints: {
      windows: raw.api_endpoints?.windows || '/api/v1/windows',
      open_window: raw.api_endpoints?.open_window || '/api/v1/windows/open',
      import_windows: raw.api_endpoints?.import_windows || '/api/v1/windows/import',
      arrange_windows: raw.api_endpoints?.arrange_windows || '/api/v1/windows/arrange',
      select_all: raw.api_endpoints?.select_all || '/api/v1/windows/select-all',
      close_windows: raw.api_endpoints?.close_windows || '/api/v1/windows/close',
      navigate_all: raw.api_endpoints?.navigate_all || '/api/v1/tabs/navigate',
      zoom_windows: raw.api_endpoints?.zoom_windows || '/api/v1/windows/zoom'
    }
  };
}

export function ensureRuntimeDirs() {
  fs.mkdirSync(refsDir, { recursive: true });
  fs.mkdirSync(desktopCapturesDir, { recursive: true });
}
