import { normalise, CRITERIA, emptyCriterion } from './core.js';
import { QEM_RULE_SET } from './qem-catalogue.js';

export const TSV_COLUMNS = Object.freeze([
  'item_id', 'qem_rule_set', 'qem_rule_set_inferred', 'gene', 'transcript', 'hgvs_c', 'hgvs_p', 'genome_build', 'disease', 'inheritance',
  'guideline_basis', 'reviewer', 'review_date', 'signoff', 'classification', 'criterion', 'status',
  'evidence_status', 'applied_strength', 'notes', 'source_ref', 'verified', 'qem_rule_id', 'qem_raw_outcome', 'qem_source_ref', 'qem_verified', 'record_json', 'criterion_json'
]);
const encode = value => {
  const s = typeof value === 'string' ? value : String(value ?? '');
  return /[\t\n\r"]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** RFC 4180-style quoted fields, using a tab delimiter. */
export function parseTSV(value, requiredHeaders = ['item_id', 'gene', 'criterion', 'status', 'evidence_status']) {
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
        item_id: record.item_id, qem_rule_set: data.qem_rule_set, qem_rule_set_inferred: String(data.metadata?.qem_rule_set_inferred === true), gene: v.gene || '', transcript: v.transcript || '', hgvs_c: v.hgvs_c || '', hgvs_p: v.hgvs_p || '', genome_build: v.genome_build || '',
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
  const version = rows[0].qem_rule_set;
  const flag = rows[0].qem_rule_set_inferred?.trim().toLowerCase();
  if (flag !== undefined && !['true', 'false'].includes(flag)) {
    throw new Error('qem_rule_set_inferred must be true or false');
  }
  if (version === undefined && flag === 'false') {
    throw new Error('A QEM rule-set version is required when qem_rule_set_inferred is false');
  }
  const inferred = version === undefined || flag === 'true';
  // An omitted version identifies a legacy TSV, not a new, verified v3 input.
  // If explicitly declared, every row must agree with the current rule catalogue.
  if (version !== undefined && version !== QEM_RULE_SET) {
    throw new Error(`Unknown QEM rule set: ${version || '(blank)'}; expected ${QEM_RULE_SET}`);
  }
  for (const [index, row] of rows.entries()) {
    const item = row.item_id;
    if (!item) throw new Error(`TSV row ${index + 2}: item_id is empty`);
    if (version !== undefined && row.qem_rule_set !== version) {
      throw new Error(`TSV row ${index + 2}: inconsistent qem_rule_set`);
    }
    if (flag !== undefined && row.qem_rule_set_inferred?.trim().toLowerCase() !== flag) {
      throw new Error(`TSV row ${index + 2}: inconsistent qem_rule_set_inferred`);
    }
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
    for (const name of ['gene', 'transcript', 'hgvs_c', 'hgvs_p', 'genome_build']) setShared(name, v, name);
    for (const name of ['disease', 'inheritance']) setShared(name, ctx, name);
    setShared('guideline_basis', record, 'guideline_basis');
    setShared('reviewer', rev, 'reviewer');
    setShared('review_date', rev, 'date');
    setShared('signoff', rev, 'signoff', value => bool(value, 'signoff'));
    setShared('classification', record, 'classification', value => value || null);
    if (Object.hasOwn(row, 'record_json')) setShared('record_json'); // Compare embedded copies.
    if (!row.criterion) continue;
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
    ...(version === undefined ? {} : { qem_rule_set: version }),
    ...(inferred ? { metadata: { qem_rule_set_inferred: true } } : {}),
    records: [...records.values()]
  });
}
function emptyCriterionIfKnown(code) {
  try { return emptyCriterion(code); } catch { return { code }; }
}
export function blankTSV() {
  const cols = TSV_COLUMNS.filter(c => !['record_json', 'criterion_json', 'qem_rule_set_inferred'].includes(c));
  const rows = [cols.join('\t')];
  for (const c of CRITERIA) {
    const values = { item_id: 'variant_001', qem_rule_set: QEM_RULE_SET, gene: 'GENE', transcript: '', hgvs_c: 'c.1A>G', genome_build: 'GRCh38', signoff: 'false', criterion: c.code, status: 'not_assessed', evidence_status: 'not_assessed', applied_strength: c.default_strength, verified: 'false', qem_rule_id: emptyCriterion(c.code).qem_rule_id, qem_raw_outcome: 'NA', qem_source_ref: '', qem_verified: 'false' };
    rows.push(cols.map(col => encode(values[col])).join('\t'));
  }
  return `${rows.join('\n')}\n`;
}
