import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { SCHEMA, CRITERIA, emptyCriterion, normalise, validate, scores, toSiteJSON } from '../src/core.js';
import { toTSV, fromTSV, blankTSV, parseTSV } from '../src/formats.js';
import { toQEM, validateQEM, qemOutcome, QEM_RULE_SET } from '../src/qem.js';
import { loadJSON } from '../src/load-json.js';
const qemRules = await loadJSON('../src/qem-rules.json', import.meta.url);
import { toHTML } from '../src/report.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(readFileSync(resolve(root,'examples',file),'utf8'));

function fixture() { return read('completed.json'); }

test('catalogue has exactly 28 unique, stable identifiers', () => {
  assert.equal(CRITERIA.length,28);
  assert.equal(new Set(CRITERIA.map(x=>x.code)).size,28);
  assert.equal(CRITERIA.find(x => x.code === 'BA1').default_strength,'standalone');
});
test('canonical complete synthetic fixture validates strictly', () => {
  const result=validate(fixture(), {strict:true});
  assert.equal(result.summary.records, 1);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.warnings, 0);
  assert.equal(result.summary.strict, true);
  assert.equal(scores(result.data.records[0]).point_based_category,'likely_pathogenic');
});
test('incomplete fixture retains unassessed status and is flagged',()=>{
  const result=validate(read('incomplete.json'));
  assert.equal(result.ok,true);
  assert(result.summary.warnings>0);
  assert.equal(validate(read('incomplete.json'),{strict:true}).ok,false);
  assert.equal(result.data.records[0].criteria.find(x=>x.code==='PM2').status,'not_assessed');
});
test('TSV parser handles quoted tabs, quotes and multiline notes',()=>{
  const data=fixture();
  const c=data.records[0].criteria.find(x=>x.code==='PVS1');
  c.notes='Source "paper"\nSupplement\tannotation';
  const imported=fromTSV(toTSV(data));
  assert.equal(imported.records[0].criteria.find(x=>x.code==='PVS1').notes,c.notes);
});
test('canonical JSON to TSV to JSON preserves all record content including caveats and provenance',()=>{
  const data=fixture();
  data.records[0].provenance={analysis:{reference_sequence:'GRCh38'},custom:['alpha',3]};
  data.records[0].extensions={extra:'kept'};
  const actual=fromTSV(toTSV(data));
  assert.deepEqual(actual.records[0],normalise(data).records[0]);
});
test('template creates 28 explicit not-assessed rows and is valid for batch entry',()=>{
  const content=blankTSV();
  assert.equal(parseTSV(content).length,28);
  const data=fromTSV(content);
  assert.equal(data.records[0].criteria.filter(c=>c.status==='not_assessed').length,28);
  assert.equal(validate(data).summary.errors,0);
});
test('legacy website single-variant JSON retains all supported criterion reviews',()=>{
  const site=toSiteJSON(fixture());
  assert.equal(site.schema,'switzerlandomics.acmg-validator.v1');
  const round=normalise(site);
  assert.equal(round.records[0].criteria.length,28);
  assert.equal(round.records[0].criteria.find(x=>x.code==='PVS1').evidence_status,'present');
  assert.equal(round.records[0].criteria.find(x=>x.code==='PVS1').caveats.length,7);
  assert.equal(round.records[0].classification,'likely_pathogenic');
  assert.equal(round.records[0].review.signoff,true);
});
test('legacy website case JSON does not limit cases to five variants',()=>{
  const site=toSiteJSON({...fixture(),records:Array.from({length:7},(_,i)=>({ ...structuredClone(fixture().records[0]),item_id:`item_${i+1}`,variant:{...fixture().records[0].variant,hgvs_c:`c.${i+1}A>G`} }))});
  assert.equal(site.schema,'switzerlandomics.acmg-validator.case.v1');
  assert.equal(normalise(site).records.length,7);
});
test('legacy data without full audit records untouched criteria as unassessed',()=>{
  const site=toSiteJSON(fixture());
  site.criteria=[site.criteria[0]];
  const input=normalise(site);
  assert.equal(input.records[0].criteria.filter(c=>c.status==='not_assessed').length,27);
});
test('rejects duplicated criterion before normalisation can silently overwrite',()=>{
  const data=fixture();
  data.records[0].criteria.push(structuredClone(data.records[0].criteria[0]));
  assert.throws(()=>normalise(data),/duplicated criterion/);
});
test('invalid accepted state fails validation',()=>{
  const data=fixture();
  data.records[0].criteria[0].evidence_status='absent_after_review';
  assert(validate(data).issues.some(i=>i.level==='error'&&i.path==='criteria.PVS1'));
});
test('unverified accepted criterion never maps to QEM 1',()=>{
  const data=fixture(), rec=data.records[0];
  rec.criteria.find(c=>c.code==='PVS1').qem_verified=false;
  assert.equal(validate(data).summary.errors > 0, true);
  assert.throws(() => toQEM(data), /invalid ACMG records/);
});
test('QEM raw FALSE=1, TRUE=0, NA=0 with deterministic ordering',()=>{
  const qem=toQEM(fixture());
  assert.equal(validateQEM(qem.matrix,qem.raw),true);
  const binary=parseTSV(qem.matrix, ['item_id'])[0],raw=parseTSV(qem.raw, ['item_id'])[0];
  assert.equal(binary.criterion_PVS1_evidence_unqualified,'1');
  assert.equal(raw.criterion_PVS1_evidence_unqualified,'FALSE');
  assert.equal(binary.criterion_PP3_evidence_unqualified,'0');
  assert.equal(raw.criterion_PP3_evidence_unqualified,'NA'); // Not a verified negative observation
  assert.equal(raw.criterion_BA1_evidence_unqualified,'NA');
  assert.equal(qem.metadata.standard,'SGA-QEM-1.0');
  assert.equal(qem.metadata.rules.length,28);
});
test('all 28 QEM rules are explicitly declared, negatively oriented and uniquely identified', () => {
  assert.equal(qemRules.rules.length, CRITERIA.length);
  assert.equal(QEM_RULE_SET, 'switzerlandomics.acmg-evidence-availability.v3');
  assert.equal(qemRules.polarity, 'TRUE_detects_invalidating_or_weakening_signal');
  assert.deepEqual(qemRules.rules.map(rule => rule.criterion), CRITERIA.map(def => def.code));
  for (const rule of qemRules.rules) {
    assert.equal(rule.id, `criterion_${rule.criterion}_evidence_unqualified`);
    assert.match(rule.invalidating_question, /^Is /);
    assert.match(rule.invalidating_question, /\?$/);
    assert.ok(rule.positive_evidence_target);
    assert.equal(rule.can_qualify, !CRITERIA.find(def => def.code === rule.criterion).deprecated);
  }
});

test('every QEM criterion obeys documented TRUE/FALSE/NA orientation and evidential gates', () => {
  const base = fixture().records[0];
  const review = { reviewer: 'Synthetic reviewer', signoff: true };
  for (const def of CRITERIA) {
    const id = def.code;
    const candidate = emptyCriterion(id);
    candidate.notes = 'Reviewed in a synthetic evidence assessment';
    candidate.qem_source_ref = 'synthetic-record://evidence-source';
    candidate.qem_verified = true;

    const qualified = { ...candidate, status: 'accepted', evidence_status: 'present', qem_raw_outcome: def.deprecated ? 'TRUE' : 'FALSE' };
    assert.equal(qemOutcome({ review }, qualified), def.deprecated ? 'TRUE' : 'FALSE', `${id}: reviewed evidence or verified assertion-only deficiency`);

    for (const state of ['absent_after_review', 'conflicting', 'insufficient_quality']) {
      const invalidated = { ...candidate, status: 'rejected', evidence_status: state, qem_raw_outcome: 'TRUE' };
      assert.equal(qemOutcome({ review }, invalidated), 'TRUE', `${id}: confirmed invalidating observation (${state})`);
      assert.equal(qemOutcome({ review }, { ...invalidated, qem_verified: false }), 'NA', `${id}: unverified invalidation`);
      assert.equal(qemOutcome({ review }, { ...invalidated, qem_source_ref: '' }), 'NA', `${id}: undocumented invalidation`);
      assert.equal(qemOutcome({ review }, { ...invalidated, status: 'not_assessed' }), 'NA', `${id}: unassessed invalidation`);
      assert.equal(qemOutcome({ review }, { ...invalidated, status: 'needs_second_review' }), 'NA', `${id}: pending invalidation`);
      assert.equal(qemOutcome({ review: { reviewer: 'Synthetic reviewer', signoff: false } }, invalidated), 'NA', `${id}: unsigned invalidation`);
    }

    assert.equal(qemOutcome({ review }, { ...qualified, qem_verified: false }), 'NA', `${id}: unverified positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, qem_source_ref: '' }), 'NA', `${id}: unsourced positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, status: 'not_assessed' }), 'NA', `${id}: unassessed positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, status: 'needs_second_review' }), 'NA', `${id}: pending positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, status: 'not_applicable' }), 'NA', `${id}: not applicable positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, status: 'rejected' }), 'NA', `${id}: rejected positive`);
    assert.equal(qemOutcome({ review }, { ...qualified, evidence_status: 'not_available' }), 'NA', `${id}: evidence unavailable`);
    assert.equal(qemOutcome({ review }, { ...qualified, evidence_status: 'not_assessed' }), 'NA', `${id}: not assessed`);
    assert.equal(qemOutcome({ review }, { ...qualified, evidence_status: 'requires_second_review' }), 'NA', `${id}: evidence pending`);
  }
});

test('QEM never conflates benign evidence with a QEM contradiction', () => {
  const record = fixture().records[0];
  const benign = emptyCriterion('BS4');
  benign.status = 'accepted';
  benign.evidence_status = 'present';
  benign.qem_verified = true;
  benign.qem_source_ref = 'synthetic-record://segregation-review';
  benign.qem_raw_outcome = 'FALSE';
  assert.equal(qemOutcome(record, benign), 'FALSE');
  assert.equal(qemOutcome(record, { ...benign, evidence_status: 'conflicting', status: 'rejected', qem_raw_outcome: 'TRUE' }), 'TRUE');
  assert.equal(qemOutcome(record, { ...benign, evidence_status: 'not_available', status: 'rejected' }), 'NA');
});

test('QEM metadata contains all 28 reviewed negative questions in declared order', () => {
  const exportSet = toQEM(fixture());
  assert.equal(exportSet.metadata.rules.length, 28);
  assert.equal(exportSet.metadata.rule_set, QEM_RULE_SET);
  for (const [i, rule] of exportSet.metadata.rules.entries()) {
    assert.equal(rule.id, qemRules.rules[i].id);
    assert.equal(rule.invalidating_question, qemRules.rules[i].invalidating_question);
    assert.equal(rule.polarity, 'invalidating');
    assert.match(rule.raw_true, rule.can_qualify ? /^Explicitly answered TRUE/ : /^Explicitly reviewed third-party assertion/);
  }
  assert.equal(validateQEM(exportSet.matrix, exportSet.raw), true);
});

test('website-only JSON has no implicit QEM verification and cannot create positive evidence', () => {
  const site = toSiteJSON(fixture());
  const output = toQEM(site);
  const row = parseTSV(output.matrix, ['item_id'])[0];
  for (const [name, value] of Object.entries(row)) {
    if (name !== 'item_id') assert.equal(value, '0', `${name}: website assertion is not QEM verification`);
  }
});

test('confirmed negative observations, not unassessed statuses, produce QEM TRUE end to end', () => {
  const data = fixture();
  const row = data.records[0].criteria.find(criterion => criterion.code === 'PP3');
  row.status = 'rejected';
  row.evidence_status = 'absent_after_review';
  row.verified = true;
  row.source_ref = 'synthetic-record://computer-prediction-review';
  row.qem_source_ref = 'synthetic-record://computer-prediction-review';
  row.qem_verified = true;
  row.qem_raw_outcome = 'TRUE';
  const exported = toQEM(data);
  const raw = parseTSV(exported.raw, ['item_id'])[0];
  const binary = parseTSV(exported.matrix, ['item_id'])[0];
  assert.equal(raw.criterion_PP3_evidence_unqualified, 'TRUE');
  assert.equal(binary.criterion_PP3_evidence_unqualified, '0');
  row.status = 'needs_second_review';
  assert.equal(qemOutcome(data.records[0], row), 'NA');
  assert.throws(() => toQEM(data), /invalid ACMG records/);
  row.qem_raw_outcome = 'NA';
  assert.equal(parseTSV(toQEM(data).raw, ['item_id'])[0].criterion_PP3_evidence_unqualified, 'NA');
});

test('QEM refuses conflicting evidence without producing an output',()=>{
  const data=fixture();
  data.records[0].criteria.find(x=>x.code==='BA1').status='accepted';
  data.records[0].criteria.find(x=>x.code==='BA1').evidence_status='present';
  assert.throws(()=>toQEM(data),/invalid ACMG records/);
});
test('report safely escapes user input and retains variant identifiers',()=>{
  const data=fixture();data.records[0].criteria[0].notes='<img src=x onerror=alert(1)>';
  const html=toHTML(data);
  assert(html.includes('&lt;img'));
  assert(!html.includes('<img src=x onerror'));
  assert(html.includes('BRCA1'));
});
test('CLI can validate and export JSON/TSV',()=>{
  const result=spawnSync(process.execPath,[resolve(root,'bin/acmg-validator.js'),'validate',resolve(root,'examples/completed.json'),'--strict'],{encoding:'utf8'});
  assert.equal(result.status,0, result.stderr || result.stdout);
  const conversion=spawnSync(process.execPath,[resolve(root,'bin/acmg-validator.js'),'convert',resolve(root,'examples/completed.json'),'--to','tsv'],{encoding:'utf8'});
  assert.equal(conversion.status,0,conversion.stderr);
  assert.equal(parseTSV(conversion.stdout).length,28);
});

test('spreadsheet column edits override preservation metadata without breaking round trips',()=>{
  const lines=toTSV(fixture()).split('\n');
  const header=lines[0].split('\t');
  const col=header.indexOf('reviewer');
  // Normal data row does not contain an embedded tab in any of these values before record_json.
  for (let i=1; i<lines.length; i++) {
    const old=lines[i];
    if (!old) continue;
    const m=old.match(/^(.*?)(\"\{.*)$/); // metadata can contain quoted structured fields
    const prefix=m ? m[1] : old;
    const cells=prefix.split('\t');
    if (cells.length > col) {
      cells[col]='Different reviewer';
      lines[i]=cells.join('\t')+(m ? m[2] : '');
    }
  }
  const content=lines.join('\n');
  // The transformation modifies the visible TSV columns, not canonical JSON source.
  assert.equal(fromTSV(content).records[0].review.reviewer,'Different reviewer');
});

test('wrong declared catalogue version is rejected instead of silently reinterpreted',()=>{
  const data=fixture();data.rule_set='unknown.rules.v900';
  assert.throws(()=>normalise(data),/Unknown criterion rule set/);
});

test('browser QEM archive includes the same seven files as the CLI', async()=>{
  const { makeZip } = await import('../src/archive.js');
  const { qemBundleFiles } = await import('../src/qem-bundle.js');
  const zip=makeZip(qemBundleFiles(fixture()));
  assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50);
  assert.equal(new DataView(zip.buffer).getUint32(zip.length-22,true),0x06054b50);
  assert.equal(new DataView(zip.buffer).getUint16(zip.length-12,true),7);
});

test('ACMG accepted or rejected status alone never supplies a raw QEM answer', () => {
  const record = fixture().records[0];
  const accepted = record.criteria.find(row => row.code === 'PVS1');
  assert.equal(qemOutcome(record, { ...accepted, qem_raw_outcome: 'NA' }), 'NA');
  assert.equal(qemOutcome(record, { ...accepted, qem_raw_outcome: undefined }), 'NA');
  const rejected = { ...accepted, code: 'PP3', status: 'rejected',
    evidence_status: 'absent_after_review', qem_raw_outcome: 'NA' };
  assert.equal(qemOutcome(record, rejected), 'NA');
});
test('explicitly declared QEM FALSE requires signed verification and eligible accepted ACMG evidence', () => {
  const data = fixture();
  const c = data.records[0].criteria.find(row => row.code === 'PVS1');
  c.qem_verified = false;
  assert.equal(validate(data).summary.errors > 0, true);
  assert.throws(() => toQEM(data), /invalid ACMG records/);
  c.qem_verified = true;
  c.status = 'not_assessed';
  assert.equal(validate(data).summary.errors > 0, true);
});
test('explicit QEM raw outcomes survive spreadsheet conversion', () => {
  const input = fixture();
  const roundtrip = fromTSV(toTSV(input));
  assert.equal(roundtrip.records[0].criteria.find(row => row.code === 'PVS1').qem_raw_outcome, 'FALSE');
  assert.equal(toQEM(roundtrip).matrix, toQEM(input).matrix);
});
test('browser source uses compatible JSON loading instead of JSON import attributes', () => {
  for (const file of ['src/core.js', 'src/qem.js']) {
    assert.doesNotMatch(readFileSync(resolve(root, file), 'utf8'), /with\\s*\\{\\s*type:\\s*['"]json['"]/);
  }
  assert.match(readFileSync(resolve(root, 'bin/acmg-validator.js'), 'utf8'), /\/src\/load-json\.js/);
});
