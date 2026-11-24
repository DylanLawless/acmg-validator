import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TSV_COLUMNS } from '../src/formats.js';
import { CRITERIA } from '../src/core.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = path => readFileSync(resolve(root, path), 'utf8');

test('TSV guide covers all exported columns and groups them for practical entry', () => {
  const page = file('web/columns.html');
  const documented = Array.from(page.matchAll(/<tr data-column="([^"]+)">/g), match => match[1]);
  assert.deepEqual([...documented].sort(), [...TSV_COLUMNS].sort());
  assert.deepEqual(documented.slice(0, 4), ['item_id', 'criterion', 'status', 'evidence_status']);
  assert(documented.indexOf('coordinate') < documented.indexOf('gene'));
  assert(documented.indexOf('gene') < documented.indexOf('qem_raw_outcome'));
  assert.match(page, /<th scope="col">Requirement<\/th>/);
  assert.match(page, /The four TSV headers that must be present/);
  assert.match(page, /<tr data-column="gene">[^\n]*Recommended/);
  assert.match(page, /<tr data-column="coordinate">[^\n]*Conditional/);
  assert.equal(new Set(documented).size, TSV_COLUMNS.length);
  for (const field of ['criterion', 'status', 'evidence_status', 'qem_rule_id',
    'qem_raw_outcome', 'qem_source_ref', 'qem_verified', 'record_json', 'criterion_json']) {
    assert(page.includes(`<code>${field}</code>`));
  }
});

test('human-readable ACMG reference uses authoritative criterion catalogue', () => {
  assert.equal(CRITERIA.length, 28);
  const html = file('web/acmg.html'), script = file('web/acmg-reference.js');
  assert.match(script, /fetch\('\/src\/criteria\.json'\)/);
  assert.match(script, /catalogue\.criteria/);
  assert.match(script, /def\.caveats/);
  assert.match(script, /def\.deprecated/);
  assert.match(script, /def\.requires_notes/);
  assert.match(html, /id="pathogenic-rows"/);
  assert.match(html, /id="benign-rows"/);
  assert.match(html, /acmg-reference\.js/);
  assert.match(html, /current ClinGen or gene-specific expert-panel guidance/);
});

test('reference links and explicit server routes work without changing import controls', () => {
  const index = file('web/index.html');
  const qem = file('web/qem.html');
  const server = file('bin/acmg-validator.js');
  for (const path of ['/acmg.html', '/columns.html', '/qem.html']) {
    assert(index.includes(`href="${path}"`), path);
    assert(server.includes(`['${path}'`), path);
  }
  for (const path of ['/acmg-reference.js', '/src/criteria.json']) assert(server.includes(`['${path}'`));
  assert(qem.includes('href="/acmg.html"'));
  assert(qem.includes('href="/columns.html"'));
  for (const id of ['file', 'template', 'example', 'cohort-example', 'json', 'tsv', 'html', 'qem', 'results', 'feedback']) {
    assert(index.includes(`id="${id}"`), id);
  }
  assert.match(index, /To assess a genetic variant reliably/);
  assert.match(index, /QEM rules ask whether qualifying evidence is invalidated or weakened/);
});
