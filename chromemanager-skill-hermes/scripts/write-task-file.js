import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

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

const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.outDir || path.join(process.cwd(), 'tmp'));
fs.mkdirSync(outDir, { recursive: true });

const payload = { ...args };
delete payload.outDir;

const filePath = path.join(outDir, `cm-task-${randomUUID()}.json`);
fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      filePath,
      platform: os.platform()
    },
    null,
    2
  )
);
