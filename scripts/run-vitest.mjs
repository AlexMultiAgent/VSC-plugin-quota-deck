import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest 5 resolves its own runtime from the process working directory, while
// the worker loads the same files through the canonical Windows path. When the
// cwd carries a lowercase drive letter (`d:\...`, as Git Bash often does), the
// two URLs differ only in case, Node evaluates the runtime twice, and
// `describe()` reads an uninitialised runner. Launching the CLI through the
// canonical entry path keeps both sides on one module instance.
const entry = realpathSync.native(resolve('node_modules/vitest/vitest.mjs'));
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
