// GridBoard - .env loader helper.
// Reads KEY=VALUE lines from a .env file (with # comments and basic quoting)
// and prints shell-executable statements (`set KEY=VALUE` for cmd.exe on
// Windows, `export KEY='VALUE'` for POSIX shells). The caller is expected
// to `eval` or `source` the output in the parent shell.
//
// Usage:
//   Windows:  for /f "usebackq tokens=*" %i in (`node scripts\load-env.mjs`) do %i
//   POSIX:    eval "$(node scripts/load-env.mjs)"
//
// The script also exits 0 if the file is missing (it's optional) so callers
// can unconditionally invoke it.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? '.env');
const shell = process.argv[3] ?? (process.platform === 'win32' ? 'cmd' : 'sh');

if (!existsSync(file)) {
  process.exit(0);
}

const raw = readFileSync(file, 'utf8');

function quoteForShell(value, mode) {
  if (mode === 'cmd') {
    // cmd.exe: wrap in double quotes; escape embedded double quotes.
    return '"' + value.replace(/"/g, '""') + '"';
  }
  // POSIX single-quote, escape embedded single quotes by closing+escaping+reopening.
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

for (const rawLine of raw.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq <= 0) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  if (shell === 'cmd') {
    process.stdout.write(`set "${key}=${value}"\r\n`);
  } else {
    process.stdout.write(`export ${key}=${quoteForShell(value, 'sh')}\n`);
  }
}
