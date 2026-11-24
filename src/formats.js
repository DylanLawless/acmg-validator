import { normalise, CRITERIA, emptyCriterion } from './core.js';
import { QEM_RULE_SET } from './qem-catalogue.js';

export const TSV_COLUMNS = Object.freeze([
  'item_id', 'gene', 'transcript', 'hgvs_c', 'hgvs_p', 'genome_build', 'disease', 'inheritance',
  'guideline_basis', 'reviewer', 'review_date', 'signoff', 'classification', 'criterion', 'status',
  'evidence_status', 'applied_strength', 'notes', 'source_ref', 'verified', 'qem_rule_id', 'qem_raw_outcome', 'qem_source_ref', 'qem_verified', 'record_json', 'criterion_json', 'coordinate'
]);
const encode = value => {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return /[\t\n\r"]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** RFC 4180-style quoted fields, using a tab delimiter. */
export function parseTSV(value, requiredHeaders = ['item_id', 'criterion', 'status', 'evidence_status']) {
  const text = value.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else if (ch === '\r') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new Error('Unclosed quoted field in TSV');
  if (row.length || field) { row.push(field); rows.push(row); }
  if (!rows.length) throw new Error('Empty TSV');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('Duplicate TSV headers');
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) throw new Error(`Missing TSV column: ${required}`);
  }
  return rows.filter(fields => fields.some(Boolean)).map((fields, i) => {
    if (fields.length !== headers.length) throw new Error(`TSV row ${i + 2}: expected ${headers.length} columns, got ${fields.length}`);
    return Object.fromEntries(headers.map((h, j) => [h, fields[j]]));
  });
}
export function toTSV(input) {
  const data = normalise(input);
  const rows = [TSV_COLUMNS.join('\t')];
  for (const record of data.records) {
    const { criteria, ...other } = record;
    for (const c of criteria) {
      const v = record.variant, ctx = record.case_context, rev = record.review;
      const cells = {
        item_id: record.item_id, gene: v.gene || '', transcript: v.transcript || '', hgvs_c: v.hgvs_c || '', hgvs_p: v.hgvs_p || '', genome_build: v.genome_build || '', coordinate: v.coordinate || '',
        disease: ctx.disease || '', inheritance: ctx.inheritance || '', guideline_basis: record.guideline_basis,
        reviewer: rev.reviewer || '', review_date: rev.date || '', signoff: rev.signoff === true ? 'true' : 'false',
        classification: record.classification || '', criterion: c.code, status: c.status, evidence_status: c.evidence_status, applied_strength: c.applied_strength,
        notes: c.notes, source_ref: c.source_ref, verified: String(c.verified), qem_rule_id: c.qem_rule_id, qem_raw_outcome: c.qem_raw_outcome, qem_source_ref: c.qem_source_ref, qem_verified: String(c.qem_verified), record_json: JSON.stringify(other), criterion_json: JSON.stringify(c)
      };
      rows.push(TSV_COLUMNS.map(column => encode(cells[column])).join('\t'));
    }
  }
  return `${rows.join('\n')}\n`;
}
export function fromTSV(text) {
  const rows = parseTSV(text), records = new Map(), observed = new Map();
  if (!rows.length) throw new Error('TSV has no evidence rows');
  // TSV is a flat, local entry format. Its QEM rule catalogue is the one
  // bundled with this release; canonical JSON and QEM exports record its ID.
  const unsupported = Object.keys(rows[0]).filter(column => !TSV_COLUMNS.includes(column));
  if (unsupported.length) throw new Error(`Unknown TSV column(s): ${unsupported.join(', ')}`);
  for (const [index, row] of rows.entries()) {
    const item = row.item_id;
    if (!item) throw new Error(`TSV row ${index + 2}: item_id is empty`);
    let record = records.get(item);
    if (!record) {
      let extra = {};
      if (row.record_json) {
        try { extra = JSON.parse(row.record_json); }
        catch { throw new Error(`TSV row ${index + 2}: invalid record_json`); }
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
          throw new Error(`TSV row ${index + 2}: record_json must be an object`);
        }
      }
      record = {
        ...extra, item_id: item,
        variant: { ...(extra.variant || {}) }, case_context: { ...(extra.case_context || {}) },
        review: { ...(extra.review || {}) }, criteria: []
      };
      // Missing review sign-off is explicitly false, never implied approval.
      if (record.review.signoff === undefined) record.review.signoff = false;
      records.set(item, record);
      observed.set(item, new Map());
    }
    const valuesSeen = observed.get(item);
    // Every present spreadsheet column is authoritative, including a blank cell.
    // Identical values across the variant's 28 rows are required, so a one-row
    // edit or deletion cannot be silently ignored or replaced from record_json.
    const setShared = (key, target, property, transform = value => value) => {
      if (!Object.hasOwn(row, key)) return;
      const value = row[key];
      if (valuesSeen.has(key) && valuesSeen.get(key) !== value) {
        throw new Error(`TSV row ${index + 2}: inconsistent ${key} for ${item}`);
      }
      valuesSeen.set(key, value);
      if (target) target[property] = transform(value);
    };
    const bool = (value, key) => {
      const text = value.trim().toLowerCase();
      if (!['', 'true', 'false'].includes(text)) {
        throw new Error(`TSV row ${index + 2}: ${key} must be true or false`);
      }
      return text === 'true';
    };
    const v = record.variant, ctx = record.case_context, rev = record.review;
    for (const name of ['gene', 'transcript', 'hgvs_c', 'hgvs_p', 'genome_build', 'coordinate']) {
      // A blank visible gene/coordinate clears a previously recorded value,
      // without inventing an empty property that never existed in the JSON.
      const preserveAbsence = (name === 'gene' || name === 'coordinate') &&
        Object.hasOwn(row, name) && row[name] === '' && !Object.hasOwn(v, name);
      setShared(name, preserveAbsence ? null : v, name);
    }
    for (const name of ['disease', 'inheritance']) setShared(name, ctx, name);
    setShared('guideline_basis', record, 'guideline_basis');
    setShared('reviewer', rev, 'reviewer');
    setShared('review_date', rev, 'date');
    setShared('signoff', rev, 'signoff', value => bool(value, 'signoff'));
    setShared('classification', record, 'classification', value => value || null);
    if (Object.hasOwn(row, 'record_json')) setShared('record_json'); // Compare embedded copies.
    if (!row.criterion.trim()) throw new Error(`TSV row ${index + 2}: criterion is empty`);
    if (record.criteria.some(c => c.code === row.criterion)) {
      throw new Error(`TSV row ${index + 2}: duplicate ${row.criterion} for ${item}`);
    }
    let c = emptyCriterionIfKnown(row.criterion);
    if (row.criterion_json) {
      try { c = JSON.parse(row.criterion_json); }
      catch { throw new Error(`TSV row ${index + 2}: invalid criterion_json`); }
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        throw new Error(`TSV row ${index + 2}: criterion_json must be an object`);
      }
    }
    c.code = row.criterion;
    for (const name of ['status', 'evidence_status', 'applied_strength', 'notes', 'source_ref', 'qem_source_ref']) {
      if (Object.hasOwn(row, name)) c[name] = row[name];
    }
    if (Object.hasOwn(row, 'verified')) c.verified = bool(row.verified, 'verified');
    if (Object.hasOwn(row, 'qem_verified')) c.qem_verified = bool(row.qem_verified, 'qem_verified');
    if (Object.hasOwn(row, 'qem_raw_outcome')) c.qem_raw_outcome = row.qem_raw_outcome || 'NA';
    if (Object.hasOwn(row, 'qem_rule_id')) {
      // Blank means generate the rule ID; a nonblank mismatched ID fails validation.
      c.qem_rule_id = row.qem_rule_id || emptyCriterionIfKnown(row.criterion).qem_rule_id || '';
    }
    record.criteria.push(c);
  }
  return normalise({
    schema: 'switzerlandomics.acmg-evidence.v1',
    rule_set: 'switzerlandomics.acmg-validator.criteria.v1',
    qem_rule_set: QEM_RULE_SET,
    records: [...records.values()]
  });
}
function emptyCriterionIfKnown(code) {
  try { return emptyCriterion(code); } catch { return { code }; }
}
// Beginner entry order is independent of the stable full-export column order.
// The QEM rule ID is generated from the criterion and its versioned catalogue.
export const TEMPLATE_COLUMNS = Object.freeze([
  'item_id', 'criterion', 'status', 'evidence_status',
  'coordinate', 'hgvs_c', 'gene', 'transcript', 'genome_build', 'hgvs_p',
  'applied_strength', 'source_ref', 'notes', 'verified', 'classification',
  'qem_raw_outcome', 'qem_source_ref', 'qem_verified',
  'reviewer', 'review_date', 'signoff', 'guideline_basis', 'disease', 'inheritance'
]);
export function blankTSV() {
  const cols = TEMPLATE_COLUMNS;
  const rows = [cols.join('\t')];
  for (const c of CRITERIA) {
    const values = { item_id: 'variant_001', gene: 'GENE', transcript: '', hgvs_c: 'c.1A>G', genome_build: 'GRCh38', signoff: 'false', criterion: c.code, status: 'not_assessed', evidence_status: 'not_assessed', applied_strength: c.default_strength, verified: 'false', qem_raw_outcome: 'NA', qem_source_ref: '', qem_verified: 'false' };
    rows.push(cols.map(col => encode(values[col])).join('\t'));
  }
  return `${rows.join('\n')}\n`;
}
