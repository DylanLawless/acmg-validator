import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise, validate, CRITERIA } from '../src/core.js';
import { toTSV, fromTSV, blankTSV, parseTSV } from '../src/formats.js';
import { qemReferenceTSV, QEM_RULES, ruleForCriterion } from '../src/qem-catalogue.js';
import { toQEM } from '../src/qem.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = name => JSON.parse(readFileSync(resolve(root, 'examples', name), 'utf8'));
const complete = () => load('completed.json');

test('every QEM rule ID is generated and matched to the negative question in the catalogue', () => {
  const template = parseTSV(blankTSV());
  assert.equal(template.length, 28);
  for (const [i, row] of template.entries()) {
    const rule = ruleForCriterion(CRITERIA[i].code);
    assert.equal(row.criterion, rule.criterion);
    assert.equal(row.qem_rule_id, undefined); // generated on import, not entered manually
    assert.match(rule.invalidating_question, /^Is /);
    assert.equal(row.qem_raw_outcome, 'NA');
    assert.equal(row.qem_verified, 'false');
    assert.equal(row.qem_source_ref, '');
  }
  const imported = fromTSV(blankTSV());
  for (const [i, row] of imported.records[0].criteria.entries()) {
    assert.equal(row.qem_rule_id, ruleForCriterion(CRITERIA[i].code).id);
  }
  assert.deepEqual(QEM_RULES.map(rule => rule.id), CRITERIA.map(x => `criterion_${x.code}_evidence_unqualified`));
});

test('QEM reference TSV contains all 28 invalidating questions and outcome meanings', () => {
  const downloaded = readFileSync(resolve(root, 'examples/qem-rules.tsv'), 'utf8');
  assert.equal(downloaded, qemReferenceTSV());
  const rows = parseTSV(downloaded, ['criterion', 'qem_rule_id', 'invalidating_question']);
  assert.equal(rows.length, 28);
  assert.equal(rows[0].invalidating_question, QEM_RULES[0].invalidating_question);
  assert.match(rows[0].raw_TRUE, /maps to 0/);
  assert.match(rows[0].raw_FALSE, /maps to 1/);
  assert.match(rows[0].raw_NA, /maps to 0/);
  assert.match(rows.find(x => x.criterion === 'PP5').raw_FALSE, /Not available/);
});

test('ACMG and QEM verification and sources are independently recorded', () => {
  const input = complete();
  const row = input.records[0].criteria.find(c => c.code === 'PVS1');
  row.verified = false;
  row.source_ref = '';
  row.qem_verified = true;
  row.qem_source_ref = 'synthetic:qem-specific-source';
  const record = normalise(input);
  const criterion = record.records[0].criteria.find(c => c.code === 'PVS1');
  assert.equal(criterion.qem_source_ref, 'synthetic:qem-specific-source');
  assert.equal(criterion.source_ref, '');
  assert.equal(criterion.verified, false);
  assert.equal(validate(input).summary.errors, 0);
  assert.equal(parseTSV(toQEM(record).matrix, ['item_id'])[0].criterion_PVS1_evidence_unqualified, '1');
  assert.deepEqual(fromTSV(toTSV(record)), record);
});

test('incorrect supplied qem_rule_id blocks QEM export, without auto-correction', () => {
  const input = complete();
  input.records[0].criteria[0].qem_rule_id = 'criterion_PS1_evidence_unqualified';
  assert.equal(normalise(input).records[0].criteria[0].qem_rule_id, 'criterion_PS1_evidence_unqualified');
  assert(validate(input).issues.some(i => i.level === 'error' && i.path.endsWith('.qem_rule_id')));
  assert.throws(() => toQEM(input), /invalid ACMG records/);
  const tsv = toTSV(input);
  assert(validate(fromTSV(tsv)).summary.errors > 0);
});

test('QEM source is required even when ACMG evidence has a source and has been verified', () => {
  const input = complete(), criterion = input.records[0].criteria[0];
  criterion.qem_source_ref = '';
  assert(criterion.source_ref);
  assert.equal(criterion.verified, true);
  assert(validate(input).issues.some(i => i.level === 'error' && i.path.endsWith('.qem_source_ref')));
  criterion.qem_verified = false;
  assert(validate(input).issues.some(i => i.level === 'error' && i.path.endsWith('.qem_raw_outcome')));
});

test('clearing a visible TSV QEM source and verification overrides stale criterion_json metadata', () => {
  const input = complete();
  const lines = toTSV(input).split('\n'), columns = lines[0].split('\t');
  const cells = lines[1].split('\t');
  assert.equal(cells[columns.indexOf('criterion')], 'PVS1');
  cells[columns.indexOf('qem_source_ref')] = '';
  cells[columns.indexOf('qem_verified')] = 'false';
  lines[1] = cells.join('\t');
  const row = fromTSV(lines.join('\n')).records[0].criteria[0];
  assert.equal(row.qem_source_ref, '');
  assert.equal(row.qem_verified, false);
  assert.equal(row.qem_raw_outcome, 'FALSE');
  assert(validate(fromTSV(lines.join('\n'))).summary.errors > 0);
});

test('upper-case spreadsheet boolean values for review and QEM attestation import correctly', () => {
  const upper = toTSV(complete()).replace(/\ttrue\t/g, '\tTRUE\t').replace(/\tfalse\t/g, '\tFALSE\t');
  const input = fromTSV(upper);
  assert.equal(input.records[0].review.signoff, true);
  assert.equal(input.records[0].criteria[0].qem_verified, true);
  assert.equal(input.records[0].criteria[1].qem_verified, false);
  assert.equal(validate(input).summary.errors, 0);
});

test('QEM verification is never inferred from ACMG fields', () => {
  const input = complete();
  const original = input.records[0].criteria[0];
  delete original.qem_source_ref;
  delete original.qem_verified;
  const result = normalise(input);
  const row = result.records[0].criteria[0];
  assert.equal(row.qem_source_ref, '');
  assert.equal(row.qem_verified, false);
  assert.equal(row.source_ref, original.source_ref);
  assert.equal(row.verified, true);
  assert(validate(result).summary.errors > 0);
});

test('explicit QEM fields are never replaced from ACMG fields', () => {
  const input = complete();
  const row = input.records[0].criteria[0];
  row.qem_source_ref = '';
  row.qem_verified = false;
  assert.equal(normalise(input).records[0].criteria[0].qem_verified, false);
  assert.equal(normalise(input).records[0].criteria[0].qem_source_ref, '');
});

test('reference page is local, names all three outcomes and renders rule data from the catalogue', () => {
  const html = readFileSync(resolve(root, 'web/qem.html'), 'utf8');
  const script = readFileSync(resolve(root, 'web/qem-reference.js'), 'utf8');
  const home = readFileSync(resolve(root, 'web/index.html'), 'utf8');
  const server = readFileSync(resolve(root, 'bin/acmg-validator.js'), 'utf8');
  for (const outcome of ['TRUE', 'FALSE', 'NA']) assert.match(html, new RegExp(outcome));
  for (const path of ['/qem.html', '/qem-reference.js', '/examples/qem-rules.tsv', '/src/qem-catalogue.js']) assert(server.includes(path), path);
  assert.match(html, /qem_source_ref/);
  assert.match(html, /qem_verified/);
  assert.match(home, /QEM criteria and outcome meanings/);
  assert.match(script, /QEM_RULES/);
  assert.doesNotMatch(script, /qem-rules\.json/);
});
