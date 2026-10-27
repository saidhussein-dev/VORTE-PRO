// tests/run-all.js — runs every tests/*.e2e.js file one after another and reports which failed.
// Usage: npm test            (set TEST_ONLY=menu to run only files whose name contains "menu")
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const only = process.env.TEST_ONLY || '';
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.e2e.js') && f.includes(only)).sort();
const failed = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 120000 });
  const ok = r.status === 0;
  console.log(`${ok ? '✅' : '❌'} ${f}`);
  if (!ok) { failed.push(f); console.log((r.stdout || '').split('\n').slice(-15).join('\n')); console.log((r.stderr || '').split('\n').slice(-10).join('\n')); }
}
console.log(`\n${files.length - failed.length}/${files.length} test files passed`);
process.exit(failed.length ? 1 : 0);
