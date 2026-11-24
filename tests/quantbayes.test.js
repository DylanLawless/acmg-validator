import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { normalise, validate, CRITERIA } from '../src/core.js';
import { fromTSV, toTSV, parseTSV } from '../src/formats.js';
import { toQEM, validateQEM } from '../src/qem.js';
import { qemBundleFiles, QUANTBAYES_RUNNER } from '../src/qem-bundle.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = name => JSON.parse(readFileSync(resolve(root, 'examples', name), 'utf8'));
const cohort = () => load('cohort.json');

function checkBinaryParity(result) {
  const original = parseTSV(result.matrix, ['item_id']);
  const converted = parseTSV(result.quantbayes, ['variant_id']);
  const raw = parseTSV(result.raw, ['item_id']);
  assert.equal(original.length, converted.length);
  assert.equal(converted.length, raw.length);
  assert.deepEqual(Object.keys(original[0]).slice(1), Object.keys(converted[0]).slice(1));
  assert.deepEqual(Object.keys(original[0]).slice(1), Object.keys(raw[0]).slice(1));
  for (let i = 0; i < original.length; i++) {
    assert.equal(converted[i].variant_id, original[i].item_id);
    assert.equal(raw[i].item_id, original[i].item_id);
    for (const rule of Object.keys(original[i]).slice(1)) {
      assert.equal(original[i][rule], converted[i][rule], `changed cell ${i} ${rule}`);
      assert.equal(converted[i][rule], raw[i][rule] === 'FALSE' ? '1' : '0');
    }
  }
  return converted;
}

test('eight synthetic records demonstrate varying QEM qualification without inventing unreviewed evidence', () => {
  const input = cohort();
  const check = validate(input);
  assert.equal(check.summary.records, 8);
  assert.equal(check.summary.errors, 0);
  assert.equal(check.summary.warnings, 8, 'unassessed criteria remain visible, not fabricated as N/A');
  const result = toQEM(input);
  assert.equal(validateQEM(result.matrix, result.raw), true);
  assert.equal(result.metadata.standard, 'SGA-QEM-1.0');
  assert.equal(result.metadata.rules.length, CRITERIA.length);
  const rows = checkBinaryParity(result);
  const counts = rows.map(r => Object.entries(r).filter(([key,value]) => key !== 'variant_id' && value === '1').length);
  assert.deepEqual(counts, [5, 6, 4, 3, 2, 2, 0, 4]);
  assert(rows.every(r => Object.keys(r).length === 29));
  const outcomes = parseTSV(result.raw, ['item_id']).flatMap(row => Object.values(row).slice(1));
  for (const value of ['TRUE','FALSE','NA']) assert(outcomes.includes(value), `missing ${value}`);
});

test('canonical and long TSV cohort exports preserve all raw evidence and R matrix cells', () => {
  const original = cohort();
  assert.deepEqual(fromTSV(readFileSync(resolve(root, 'examples/cohort.tsv'), 'utf8')), normalise(original));
  assert.equal(toTSV(original), readFileSync(resolve(root, 'examples/cohort.tsv'), 'utf8'));
  assert.equal(toQEM(original).matrix, toQEM(fromTSV(toTSV(original))).matrix);
  assert.equal(toQEM(original).quantbayes, readFileSync(resolve(root, 'examples/quantbayes.tsv'), 'utf8'));
  checkBinaryParity(toQEM(fromTSV(toTSV(original))));
});

test('CLI writes the complete QuantBayes and provenance bundle, preserving identifiers', () => {
  const out = mkdtempSync(join(tmpdir(), 'acmg-qem-'));
  try {
    const proc = spawnSync(process.execPath, [resolve(root, 'bin/acmg-validator.js'), 'qem', resolve(root, 'examples/cohort.tsv'), '--out-dir', out], { encoding:'utf8' });
    assert.equal(proc.status, 0, proc.stderr || proc.stdout);
    const named = ['matrix.tsv','quantbayes.tsv','raw_outcomes.tsv','rules.json','evidence.json','run_quantbayes.R','README.txt'];
    assert.deepEqual(qemBundleFiles(cohort()).map(file => file.name), named);
    for (const name of named) {
      assert(existsSync(resolve(out,name)), `missing ${name}`);
      assert.equal(readFileSync(resolve(out,name), 'utf8'), qemBundleFiles(cohort()).find(f=>f.name===name).content);
    }
    assert.match(readFileSync(resolve(out,'run_quantbayes.R'),'utf8'), /quant_es_core\(x\)/);
    assert.match(readFileSync(resolve(out,'run_quantbayes.R'),'utf8'), /quant_es_plots\(res, x\)/);
    const runner = readFileSync(resolve(out,'run_quantbayes.R'),'utf8');
    assert.match(runner, /if \(interactive\(\)\) print\(plots\$p_overlay\)/);
    assert.match(runner, /^# write\.table\(res\$variants/m);
    assert.doesNotMatch(runner, /^(?!\s*#).*\b(?:write\.table|write\.csv|dir\.create|ggsave)\s*\(/m);
    assert.deepEqual(Object.keys(parseTSV(readFileSync(resolve(out,'quantbayes.tsv'),'utf8'),['variant_id'])[0]).slice(1),
      CRITERIA.map(def => `criterion_${def.code}_evidence_unqualified`));
  } finally { rmSync(out, { recursive:true, force:true }); }
});

test('local server exposes a cohort example and shared bundle module', () => {
  const js = readFileSync(resolve(root,'web/app.js'), 'utf8');
  const server = readFileSync(resolve(root,'bin/acmg-validator.js'),'utf8');
  const html = readFileSync(resolve(root,'web/index.html'),'utf8');
  assert.match(js, /qemBundleFiles\(data\)/);
  assert.match(html, /id="cohort-example"/);
  assert.match(server, /\/src\/qem-bundle\.js/);
  assert.match(server, /\/examples\/cohort\.json/);
  assert.match(server, /\/examples\/cohort\.tsv/);
  assert.match(QUANTBAYES_RUNNER, /!anyNA\(x\)/);
  assert.match(QUANTBAYES_RUNNER, /!anyDuplicated\(rownames\(x\)\)/);
});

const rCheck = spawnSync('Rscript', ['-e', 'quit(status = if (requireNamespace("quantbayes", quietly = TRUE)) 0 else 1)'], { encoding: 'utf8', timeout: 20000 });
const hasQuantBayes = rCheck.status === 0;
test('QuantBayes R helper reads the generated matrix and preserves variant identifiers',
  { skip: hasQuantBayes ? false : 'Rscript and quantbayes are not both installed in this environment' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'acmg-r-integration-'));
  try {
    for (const file of qemBundleFiles(cohort())) writeFileSync(resolve(out, file.name), file.content);
    const processR = spawnSync('Rscript', ['run_quantbayes.R'], { cwd: out, encoding:'utf8', timeout:30000 });
    assert.equal(processR.status,0,processR.stderr || processR.stdout);
    assert.match(processR.stdout, /theta_mean/);
    assert.match(processR.stdout, /n_variants/);
    assert(!existsSync(resolve(out, 'quantbayes-results')));
    assert(!existsSync(resolve(out, 'Rplots.pdf')));
  } finally { rmSync(out, { recursive:true, force:true }); }
});


test('browser interface is read-only and directs corrections back to the imported evidence file', () => {
  const html = readFileSync(resolve(root, 'web/index.html'), 'utf8');
  const js = readFileSync(resolve(root, 'web/app.js'), 'utf8');
  const css = readFileSync(resolve(root, 'web/style.css'), 'utf8');
  assert.doesNotMatch(html, /qem-review-panel|qem-checks|data-qem-field/);
  assert.doesNotMatch(js, /renderQEMEditor|data-qem-field|criterion\[control/);
  assert.doesNotMatch(css, /\.qem-review|\.qem-table/);
  assert.match(html, /qem_raw_outcome/);
  assert.match(html, /qem-rules\.json/);
  assert.match(html, /id="qem-coverage"/);
  assert.match(js, /qemOutcome\(record, criterion\)/);
  assert.match(js, /event\.target\.value = ''/);
});
