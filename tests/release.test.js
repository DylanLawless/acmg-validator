import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise, validate } from '../src/core.js';
import { toTSV, fromTSV, parseTSV, blankTSV } from '../src/formats.js';
import { toQEM, QEM_RULE_SET } from '../src/qem.js';
import { QUANTBAYES_RUNNER } from '../src/qem-bundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = name => JSON.parse(readFileSync(resolve(root, 'examples', name), 'utf8'));
const fixture = () => dataFile('completed.json');
const changeColumn = (tsv, name, callback) => {
  const lines = tsv.trimEnd().split('\n');
  const column = lines[0].split('\t').indexOf(name);
  assert(column >= 0, `Unknown column: ${name}`);
  for (let index = 1; index < lines.length; index++) {
    const cells = lines[index].split('\t');
    cells[column] = callback(cells[column], index);
    lines[index] = cells.join('\t');
  }
  return lines.join('\n') + '\n';
};

test('runtime rejects empty datasets, invalid gene types and impossible review dates', () => {
  const input = fixture();
  assert(validate({ ...input, records: [] }).issues.some(x => x.level === 'error' && x.path === 'dataset.records'));
  const badGene = structuredClone(input);
  badGene.records[0].variant.gene = 123;
  assert(validate(badGene).issues.some(x => x.level === 'error' && x.path === 'dataset.records[0].variant.gene'));
  for (const value of ['november', '2026-02-31']) {
    const invalid = structuredClone(input);
    invalid.records[0].review.date = value;
    assert(validate(invalid).issues.some(x => x.level === 'error' && x.path === 'dataset.records[0].review.date'));
  }
});

test('canonical source is schema-checked before normalisation fills absent fields', () => {
  const input = fixture();
  delete input.records[0].review.signoff;
  assert(validate(input).issues.some(x => x.level === 'error' && x.path === 'dataset.records[0].review.signoff'));
  const malformed = fixture();
  malformed.records[0].criteria[0].notes = 123;
  assert(validate(malformed).issues.some(x => x.level === 'error' && x.path.endsWith('.notes')));
});

test('all-not-applicable dispositions trigger a review warning without fabricating QEM evidence', () => {
  const input = fixture();
  for (const row of input.records[0].criteria) {
    row.status = 'not_applicable';
    row.evidence_status = 'not_applicable';
    row.qem_raw_outcome = 'NA';
    row.qem_verified = false;
    row.qem_source_ref = '';
    row.verified = false;
    row.source_ref = '';
  }
  const outcome = validate(input);
  assert.equal(outcome.summary.errors, 0);
  assert(outcome.summary.warnings > 0);
  assert.equal(outcome.summary.review.records_with_gaps, 1);
  assert.equal(outcome.summary.review.qem_na, 28);
  assert.match(outcome.issues.map(x => x.message).join(' '), /All 28 criteria/);
});

test('blank spreadsheet cells clear embedded JSON values, including gene, disease and date', () => {
  let tsv = toTSV(fixture());
  for (const name of ['gene', 'disease', 'review_date', 'source_ref']) {
    tsv = changeColumn(tsv, name, () => '');
  }
  const record = fromTSV(tsv).records[0];
  assert.equal(record.variant.gene, '');
  assert.equal(record.case_context.disease, '');
  assert.equal(record.review.date, '');
  assert.equal(record.criteria[0].source_ref, '');
  assert(validate(fromTSV(tsv)).summary.errors > 0);
});

test('inconsistent TSV values across rows, even a blank, are rejected', () => {
  let tsv = changeColumn(toTSV(fixture()), 'gene', (text, i) => i === 1 ? '' : text);
  assert.throws(() => fromTSV(tsv), /inconsistent gene/);
  tsv = changeColumn(toTSV(fixture()), 'record_json', (text, i) => i === 1 ? '' : text);
  assert.throws(() => fromTSV(tsv), /inconsistent record_json/);
});

test('QEM rule-set identifier is pinned in JSON, TSV, template and source bundle', () => {
  assert.equal(fixture().qem_rule_set, QEM_RULE_SET);
  assert.equal(parseTSV(toTSV(fixture()))[0].qem_rule_set, QEM_RULE_SET);
  assert.equal(parseTSV(blankTSV())[0].qem_rule_set, QEM_RULE_SET);
  const input = fixture();
  input.qem_rule_set = 'switzerlandomics.acmg-evidence-availability.v2';
  assert.throws(() => normalise(input), /Unknown QEM rule set/);
  const invalidTsv = changeColumn(toTSV(fixture()), 'qem_rule_set', () => 'outdated.rules.v1');
  assert.throws(() => fromTSV(invalidTsv), /Unknown QEM rule set/);
  assert.equal(toQEM(fixture()).metadata.rule_set, QEM_RULE_SET);
});

test('versionless legacy files are inspectable, clearly warned and blocked from QEM export', () => {
  const input = fixture();
  delete input.qem_rule_set;
  const record = normalise(input);
  assert.equal(record.metadata.qem_rule_set_inferred, true);
  assert(validate(input).issues.some(x => /QEM export is blocked/.test(x.message)));
  assert.throws(() => toQEM(input), /explicitly confirmed qem_rule_set/);
  const tsv = toTSV(input);
  assert.equal(parseTSV(tsv)[0].qem_rule_set, QEM_RULE_SET);
  assert.equal(parseTSV(tsv)[0].qem_rule_set_inferred, 'true');
  assert.throws(() => toQEM(fromTSV(tsv)), /explicitly confirmed qem_rule_set/);
  assert.throws(() => toQEM(record), /explicitly confirmed qem_rule_set/);
});

test('browser exports only canonical JSON while CLI retains the legacy adapter', () => {
  const html = readFileSync(resolve(root, 'web/index.html'), 'utf8');
  const app = readFileSync(resolve(root, 'web/app.js'), 'utf8');
  const cli = readFileSync(resolve(root, 'bin/acmg-validator.js'), 'utf8');
  const version = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
  assert.match(html, /id="json"[^>]*>Canonical JSON/);
  assert.doesNotMatch(html, /id="site-json"|Website JSON/);
  assert.doesNotMatch(app, /toSiteJSON|site-json/);
  assert.match(cli, /'site-json'/);
  assert.match(html, new RegExp(`v${version.replaceAll('.', '\\.')}`));
  for (const url of ['https://cran.r-project.org/web/packages/quantbayes/index.html',
    'https://switzerlandomics.ch/technologies/quantbayes/',
    'https://www.swissgenomicsassociation.ch/pages/sga_qem/']) {
    assert(html.includes(url), `Missing user-supplied link: ${url}`);
  }
});

test('R runner prints overlay interactively and saves nothing unless user uncomments TSV recipes', () => {
  assert.match(QUANTBAYES_RUNNER, /if \(interactive\(\)\) print\(plots\$p_overlay\)/);
  assert.match(QUANTBAYES_RUNNER, /# write\.table\(res\$variants/);
  assert.match(QUANTBAYES_RUNNER, /# write\.table\(data\.frame\(metric = names\(res\$global\)/);
  assert.doesNotMatch(QUANTBAYES_RUNNER, /^(?!\s*#).*\b(?:write\.table|write\.csv|dir\.create|ggsave)\s*\(/m);
});
