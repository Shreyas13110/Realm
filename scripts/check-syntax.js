import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})('src');
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { bad++; console.error(r.stderr); }
}
console.log(`${files.length} files checked, ${bad} failed`);
process.exit(bad ? 1 : 0);
