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

test('QEM rule catalogue is pinned in canonical JSON and bundle, not duplicated in TSV', () => {
  assert.equal(fixture().qem_rule_set, QEM_RULE_SET);
  const fullHeaders = Object.keys(parseTSV(toTSV(fixture()))[0]);
  const templateHeaders = Object.keys(parseTSV(blankTSV())[0]);
  assert(!fullHeaders.includes('qem_rule_set'));
  assert(!templateHeaders.includes('qem_rule_set'));
  assert(!fullHeaders.includes('qem_rule_set_inferred'));
  assert(!templateHeaders.includes('qem_rule_set_inferred'));
  assert.equal(fromTSV(toTSV(fixture())).qem_rule_set, QEM_RULE_SET);
  assert.equal(toQEM(fixture()).metadata.rule_set, QEM_RULE_SET);
  const changed = fixture();
  changed.qem_rule_set = 'wrong.catalogue';
  assert.throws(() => normalise(changed), /Canonical JSON requires QEM rule set/);
  const missing = fixture();
  delete missing.qem_rule_set;
  assert.throws(() => normalise(missing), /Canonical JSON requires QEM rule set/);
  const extraColumn = blankTSV().split('\n').filter(row => row.length)
    .map((row, index) => `${index ? 'v' : 'obsolete_version'}\t${row}`).join('\n') + '\n';
  assert.throws(() => fromTSV(extraColumn), /Unknown TSV column/);
});

test('review and export sections are visible before import, with disabled outputs', () => {
  const html = readFileSync(resolve(root, 'web/index.html'), 'utf8');
  const app = readFileSync(resolve(root, 'web/app.js'), 'utf8');
  assert.match(html, /<div id="results">/);
  assert.match(html, /No variants imported yet/);
  assert.match(html, /No file loaded/);
  for (const id of ['json', 'tsv', 'html', 'qem']) {
    assert.match(html, new RegExp(`<button id="${id}" disabled`));
  }
  assert(!app.includes("element('results').hidden"));
  assert.match(app, /element\(id\)\.disabled = true/);
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
  assert(!html.includes(`v${version}`), 'Displayed version should not be hard-coded in HTML');
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


test('all page footers use a single package-manifest display name and version', () => {
  const packageInfo = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(typeof packageInfo.displayName, 'string');
  assert(packageInfo.displayName.trim());
  assert.match(packageInfo.version, /^\d+\.\d+\.\d+$/);
  const client = readFileSync(resolve(root, 'web/site-meta.js'), 'utf8');
  const server = readFileSync(resolve(root, 'bin/acmg-validator.js'), 'utf8');
  assert.match(client, /fetch\('\/package\.json'\)/);
  assert.match(client, /displayName, version/);
  for (const page of ['index.html', 'columns.html', 'qem.html', 'acmg.html']) {
    const html = readFileSync(resolve(root, 'web', page), 'utf8');
    assert.match(html, /<script type="module" src="\/site-meta\.js"><\/script>/);
    assert.match(html, /<footer[^>]*>[\s\S]*data-project-meta[\s\S]*<\/footer>/);
    assert.doesNotMatch(html, /ACMG Validator v\d+\.\d+\.\d+/);
    assert(!html.includes(packageInfo.displayName), `Duplicate display name in ${page}`);
  }
  assert.match(server, /\['\/site-meta\.js','web\/site-meta\.js'\]/);
  assert.match(server, /\['\/package\.json','package\.json'\]/);
});
