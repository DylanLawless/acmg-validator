import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalise, validate } from '../src/core.js';
import { TSV_COLUMNS, TEMPLATE_COLUMNS, parseTSV, fromTSV, toTSV, blankTSV } from '../src/formats.js';
import { toQEM } from '../src/qem.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = name => JSON.parse(readFileSync(resolve(root, 'examples', name), 'utf8'));

const editTSVColumn = (content, column, value) => {
  const headers = content.trimEnd().split('\n')[0].split('\t');
  const col = headers.indexOf(column);
  assert(col !== -1);
  const rows = content.trimEnd().split('\n');
  return rows.map((row, i) => {
    if (i === 0) return row;
    const fields = row.split('\t');
    fields[col] = value;
    return fields.join('\t');
  }).join('\n') + '\n';
};

test('gene is optional but a variant location is necessary', () => {
  const geneFree = fixture('completed.json');
  delete geneFree.records[0].variant.gene;
  delete geneFree.records[0].variant.hgvs_c;
  const result = validate(geneFree);
  assert.equal(result.summary.errors, 0);
  assert(result.issues.some(issue => issue.level === 'warning' && issue.path === 'variant.gene'));
  assert.doesNotThrow(() => toQEM(geneFree));
  const hgvsOnly = structuredClone(geneFree);
  delete hgvsOnly.records[0].variant.coordinate;
  hgvsOnly.records[0].variant.hgvs_c = 'c.68_69del';
  assert.equal(validate(hgvsOnly).summary.errors, 0);
  delete hgvsOnly.records[0].variant.hgvs_c;
  assert(validate(hgvsOnly).issues.some(issue => issue.level === 'error' && issue.path === 'variant'));
  const symbolOnly = fixture('completed.json');
  delete symbolOnly.records[0].variant.hgvs_c;
  delete symbolOnly.records[0].variant.coordinate;
  assert(validate(symbolOnly).issues.some(issue => issue.level === 'error' && issue.path === 'variant'));
});

test('gene-free coordinate is imported from a minimal four-header TSV', () => {
  const minimal = [
    ['item_id','criterion','status','evidence_status','coordinate','genome_build'].join('\t'),
    ['variant_without_gene','PVS1','not_assessed','not_assessed','chr1:100000:A:G','GRCh38'].join('\t')
  ].join('\n') + '\n';
  const rows = parseTSV(minimal);
  assert.equal(rows.length, 1);
  const imported = fromTSV(minimal);
  assert.equal(imported.records[0].variant.coordinate, 'chr1:100000:A:G');
  assert.equal(imported.records[0].variant.gene, undefined);
  assert.equal(imported.records[0].review.signoff, false); // never infer an approval
  const validation = validate(imported);
  assert.equal(validation.summary.errors, 0);
  assert(validation.summary.warnings > 0);
  assert.equal(imported.qem_rule_set, 'switzerlandomics.acmg-evidence-availability.v3');
});

test('required TSV headers and criterion values have distinct checks', () => {
  const minimal = 'item_id\tcriterion\tstatus\tevidence_status\thgvs_c\nV1\tPVS1\tnot_assessed\tnot_assessed\tc.1A>G\n';
  assert.equal(validate(fromTSV(minimal)).summary.errors, 0);
  assert.throws(() => parseTSV(minimal.replace('\tcriterion\t', '\twrong_header\t')), /Missing TSV column: criterion/);
  assert.throws(() => fromTSV(minimal.replace('\tPVS1\t', '\t\t')), /criterion is empty/);
  assert.throws(() => fromTSV(minimal.replace('\nV1\t', '\n\t')), /item_id is empty/);
  const emptyStatus = fromTSV(minimal.replace('\tnot_assessed\t', '\t\t'));
  assert(validate(emptyStatus).issues.some(issue => issue.level === 'error' && issue.path.endsWith('.status')));
});

test('coordinate is faithfully preserved or deliberately cleared in TSV round trips', () => {
  const input = fixture('completed.json');
  delete input.records[0].variant.gene;
  const exported = toTSV(input);
  const imported = fromTSV(exported);
  assert.deepEqual(imported, normalise(input));
  assert.equal(imported.records[0].variant.coordinate, 'chr17:43124027');
  const erased = fromTSV(editTSVColumn(exported, 'coordinate', ''));
  assert.equal(erased.records[0].variant.coordinate, '');
  assert.equal(validate(erased).summary.errors, 0); // hgvs_c still identifies it
  const noCoordinate = fixture('completed.json');
  delete noCoordinate.records[0].variant.coordinate;
  assert.deepEqual(fromTSV(toTSV(noCoordinate)), normalise(noCoordinate));
});

test('entry template preserves column names and full export adds coordinate', () => {
  const historical = [
    'item_id', 'gene', 'transcript', 'hgvs_c', 'hgvs_p', 'genome_build', 'disease', 'inheritance',
    'guideline_basis', 'reviewer', 'review_date', 'signoff', 'classification', 'criterion', 'status', 'evidence_status',
    'applied_strength', 'notes', 'source_ref', 'verified', 'qem_rule_id', 'qem_raw_outcome', 'qem_source_ref', 'qem_verified', 'record_json', 'criterion_json'
  ];
  assert.deepEqual(TSV_COLUMNS.slice(0, historical.length), historical);
  assert.equal(TSV_COLUMNS.at(-1), 'coordinate');
  assert.deepEqual(TEMPLATE_COLUMNS.slice(0, 4), ['item_id', 'criterion', 'status', 'evidence_status']);
  assert.equal(new Set(TEMPLATE_COLUMNS).size, TEMPLATE_COLUMNS.length);
  assert(TEMPLATE_COLUMNS.every(column => TSV_COLUMNS.includes(column)));
  assert(!TEMPLATE_COLUMNS.includes('qem_rule_id'));
  assert.deepEqual(blankTSV().split('\n')[0].split('\t'), TEMPLATE_COLUMNS);
  for (const name of ['completed','cohort']) {
    assert.equal(readFileSync(resolve(root, 'examples', name + '.tsv'), 'utf8'), toTSV(fixture(name + ".json")));
  }
  assert.equal(readFileSync(resolve(root, 'examples/template.tsv'), 'utf8'), blankTSV());
});

test('existing QEM and QuantBayes values are unaffected by the coordinate column', () => {
  const cohort = fixture('cohort.json');
  const imported = fromTSV(readFileSync(resolve(root, 'examples/cohort.tsv'), 'utf8'));
  const a = toQEM(cohort), b = toQEM(imported);
  assert.equal(a.matrix, b.matrix);
  assert.equal(a.raw, b.raw);
  assert.equal(a.metadata.rule_set, b.metadata.rule_set);
});
