#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '..', 'out');

if (!fs.existsSync(outDir)) {
  console.error('[test-unit] out/ not found — run `npm run compile` first.');
  process.exit(1);
}

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${e instanceof Error ? e.message : e}`);
  }
}

const { pathMatchesAllowedGlobs, resolveDiaryPath } = await import(
  pathToFileURL(path.join(outDir, 'penetration', 'paths.js')).href
);
const { formatDiaryEntry, summarizeDiaryForMemory } = await import(
  pathToFileURL(path.join(outDir, 'penetration', 'templates.js')).href
);

console.log('penetration paths');
await test('resolveDiaryPath substitutes roleId', () => {
  const p = resolveDiaryPath('C:\\ws', 'mumu', '.oclive/{roleId}/diary.md');
  assert.match(p.replace(/\\/g, '/'), /\/\.oclive\/mumu\/diary\.md$/);
});

await test('pathMatchesAllowedGlobs accepts .oclive/**', () => {
  assert.equal(pathMatchesAllowedGlobs('.oclive/mumu/diary.md', ['.oclive/**']), true);
  assert.equal(pathMatchesAllowedGlobs('src/main.ts', ['.oclive/**']), false);
});

await test('resolveDiaryPath rejects .. traversal', () => {
  assert.throws(
    () => resolveDiaryPath('C:\\ws', 'mumu', '../outside/diary.md'),
    /非法渗透路径/,
  );
});

console.log('formatDiaryEntry');
await test('formatDiaryEntry includes user and role lines', () => {
  const entry = formatDiaryEntry({
    userText: '你好',
    assistantText: '嗨',
    roleName: '木木',
    headerLine: '今日片段',
  });
  assert.match(entry, /\*\*你\*\*：你好/);
  assert.match(entry, /\*\*木木\*\*：嗨/);
});

console.log('summarizeDiaryForMemory');
await test('summarizeDiaryForMemory prefers today sections', () => {
  const today = new Date().toISOString().slice(0, 10);
  const md = `## ${today}T10:00:00.000Z\nline one\n\n## 2020-01-01T00:00:00.000Z\nold`;
  const summary = summarizeDiaryForMemory(md);
  assert.match(summary, /工作区日记摘要/);
  assert.match(summary, /line one/);
});

if (failures > 0) {
  console.error(`\n[test-unit] ${failures} test(s) failed.`);
  process.exit(1);
}
console.log('\n[test-unit] all unit tests passed.');
