import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const zipPath = path.resolve(root, 'realm-unified-production.zip');
const artifactZipPath = 'C:\\Users\\Gayatri\\.gemini\\antigravity\\brain\\3f7b4fe5-7966-4862-ae79-523e8a640768\\realm-unified-production.zip';

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const staging = path.resolve(root, '.staging');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const exclude = new Set(['node_modules', '.git', '.env', '.staging', 'realm-unified-production.zip', '.DS_Store']);

function copy(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (exclude.has(name)) continue;
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) {
      copy(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

copy(root, staging);
console.log('Staged files successfully.');

const psScript = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("${staging.replace(/\\/g, '\\\\')}", "${zipPath.replace(/\\/g, '\\\\')}")
`;

const res = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf8' });
if (res.stderr && res.stderr.trim()) console.error('PowerShell error:', res.stderr);

fs.rmSync(staging, { recursive: true, force: true });

if (fs.existsSync(zipPath)) {
  const size = fs.statSync(zipPath).size;
  console.log(`Generated realm-unified-production.zip (${size} bytes)`);
  // Also copy to artifacts directory
  fs.copyFileSync(zipPath, artifactZipPath);
  console.log('Copied to artifact directory.');
} else {
  console.error('Failed to create archive.');
  process.exit(1);
}
