/** Portable ACMG evidence records. No network access, databases or side effects. */
import { loadJSON } from './load-json.js';
import { ruleForCriterion, QEM_RULE_SET } from './qem-catalogue.js';
import { schemaIssues } from './schema-check.js';
const catalogue = await loadJSON('./criteria.json', import.meta.url);

export const SCHEMA = 'switzerlandomics.acmg-evidence.v1';
export const CRITERIA = Object.freeze(catalogue.criteria);
export const BY_CODE = new Map(CRITERIA.map(criterion => [criterion.code, criterion]));
export const STATUSES = Object.freeze(['not_assessed', 'accepted', 'rejected', 'not_applicable', 'needs_second_review']);
export const QEM_RAW_OUTCOMES = Object.freeze(['TRUE', 'FALSE', 'NA']);
export const EVIDENCE = Object.freeze(['not_assessed', 'present', 'absent_after_review', 'not_available', 'not_applicable', 'conflicting', 'insufficient_quality', 'requires_second_review']);
export const CLASSIFICATIONS = Object.freeze(['pathogenic', 'likely_pathogenic', 'vus', 'likely_benign', 'benign']);
export const STRENGTHS = Object.freeze(['supporting', 'moderate', 'strong', 'very_strong', 'standalone']);
const POINTS = { pathogenic: { supporting: 1, moderate: 2, strong: 4, very_strong: 8 }, benign: { supporting: -1, moderate: -2, strong: -4, standalone: -8 } };
const isObject = x => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' ? x : '';
const clone = x => structuredClone(x);

export function emptyCriterion(code) {
  const def = BY_CODE.get(code);
  if (!def) throw new Error(`Unknown criterion: ${code}`);
  return { code, status: 'not_assessed', evidence_status: 'not_assessed', applied_strength: def.default_strength, notes: '', source_ref: '', verified: false, qem_rule_id: ruleForCriterion(code)?.id || '', qem_raw_outcome: 'NA', qem_source_ref: '', qem_verified: false, caveats: [] };
}

function normaliseCriterion(raw) {
  const code = raw.code ?? raw.criterion;
  const base = BY_CODE.has(code) ? emptyCriterion(code) : { code };
  // v0.1.5 used ACMG source_ref/verified for both purposes. Migrate only
  // explicit conclusive legacy QEM answers, and never override new QEM fields.
  const isLegacyQem = ['TRUE', 'FALSE'].includes(raw.qem_raw_outcome) &&
    !Object.hasOwn(raw, 'qem_source_ref') && !Object.hasOwn(raw, 'qem_verified');
  return {
    ...base, ...clone(raw), code,
    status: raw.status ?? base.status,
    evidence_status: raw.evidence_status ?? raw.evidence ?? base.evidence_status,
    applied_strength: raw.applied_strength ?? raw.strength ?? base.applied_strength,
    notes: raw.notes ?? base.notes ?? '',
    source_ref: raw.source_ref ?? base.source_ref ?? '',
    verified: raw.verified ?? base.verified ?? false,
    qem_rule_id: raw.qem_rule_id || base.qem_rule_id || '',
    qem_raw_outcome: raw.qem_raw_outcome ?? base.qem_raw_outcome ?? 'NA',
    qem_source_ref: raw.qem_source_ref ?? (isLegacyQem ? (raw.source_ref || '') : ''),
    qem_verified: raw.qem_verified ?? (isLegacyQem && raw.verified === true),
    caveats: raw.caveats ?? base.caveats ?? []
  };
}

function normaliseRecord(value, index, common = {}) {
  if (!isObject(value)) throw new Error(`Record ${index + 1} must be an object`);
  const variant = clone(value.variant || {});
  const caseContext = clone(value.case_context || common.case_context || {});
  const review = clone(value.review || common.review || {});
  const siteCriteria = Array.isArray(value.criteria_audit) ? value.criteria_audit : (value.criteria || []);
  if (!Array.isArray(siteCriteria)) throw new Error(`Record ${index + 1}: criteria must be an array`);
  const seen = new Set();
  const supplied = siteCriteria.map(c => {
    if (!isObject(c)) throw new Error(`Record ${index + 1}: criterion must be an object`);
    const row = normaliseCriterion(c);
    if (!row.code || seen.has(row.code)) throw new Error(`Record ${index + 1}: empty or duplicated criterion ${row.code}`);
    seen.add(row.code);
    return row;
  });
  const byCode = new Map(supplied.map(c => [c.code, c]));
  const ordered = CRITERIA.map(def => byCode.get(def.code) || emptyCriterion(def.code));
  ordered.push(...supplied.filter(c => !BY_CODE.has(c.code)));
  const variantKey = [variant.gene, variant.transcript, variant.hgvs_c, variant.genome_build].filter(Boolean).join('|') || 'variant';
  const defaultId = `${variantKey}|review_${String(value.variant_index ?? index + 1).padStart(3, '0')}`;
  const preserved = { ...clone(value) };
  for (const key of ['item_id', 'variant', 'case_context', 'review', 'guideline_basis', 'classification', 'criteria', 'criteria_audit', 'genotype_review', 'provenance', 'external_evidence', 'extensions']) delete preserved[key];
  return {
    item_id: value.item_id || value.variant_id || defaultId,
    variant,
    case_context: caseContext,
    review,
    guideline_basis: value.guideline_basis ?? common.guideline_basis ?? '',
    classification: value.classification ?? value.validation?.entered_classification ?? null,
    criteria: ordered,
    genotype_review: clone(value.genotype_review ?? common.genotype_review ?? {}),
    provenance: clone(value.provenance ?? common.provenance ?? {}),
    external_evidence: clone(value.external_evidence ?? {}),
    extensions: { ...(clone(value.extensions || {})), ...preserved }
  };
}

/** Accepts canonical datasets, canonical records and Switzerland Omics website v1.1.0 JSON. */
export function normalise(input) {
  if (Array.isArray(input)) throw new Error('Expected a structured object with a schema, not a bare array');
  if (!isObject(input)) throw new Error('Input must be an object');
  if (input.schema === SCHEMA) {
    if (input.rule_set !== catalogue.id) throw new Error(`Unknown criterion rule set: ${input.rule_set || '(missing)'}`);
    if (!Array.isArray(input.records)) throw new Error('The records array is required');
    if (input.qem_rule_set !== undefined && input.qem_rule_set !== QEM_RULE_SET) {
      throw new Error(`Unknown QEM rule set: ${String(input.qem_rule_set)}; expected ${QEM_RULE_SET}`);
    }
    // Versionless v0.1.6 canonical files remain importable, but the assumption
    // is retained as a warning until the provenance is explicitly reviewed.
    const inferred = input.qem_rule_set === undefined;
    const metadata = { ...(clone(input.metadata || {})) };
    if (inferred) metadata.qem_rule_set_inferred = true;
    return { schema: SCHEMA, ...clone(input), qem_rule_set: QEM_RULE_SET, metadata,
      records: input.records.map((r, i) => normaliseRecord(r, i)) };
  }
  const siteCase = input.schema === 'switzerlandomics.acmg-validator.case.v1' || Array.isArray(input.variants);
  const siteSingle = input.schema === 'switzerlandomics.acmg-validator.v1';
  const siteExamples = Array.isArray(input.examples);
  if (!siteCase && !siteSingle && !siteExamples) throw new Error(`Unrecognised input schema: ${input.schema || '(missing)'}`);
  const originals = siteCase ? input.variants : siteExamples ? input.examples : [input];
  if (!Array.isArray(originals) || !originals.length) throw new Error('No variants found');
  const common = {
    review: input.review || {}, case_context: input.case_context || {},
    guideline_basis: input.guideline_basis || '', genotype_review: input.genotype_review || {}, provenance: input.provenance || {}
  };
  const records = originals.map((r, i) => normaliseRecord(r, i, common));
  return {
    schema: SCHEMA,
    rule_set: catalogue.id,
    qem_rule_set: QEM_RULE_SET,
    records,
    metadata: { source_schema: input.schema || 'switzerlandomics.examples', generated_at: input.generated_at || null }
  };
}

export function categoryFromPoints(total) {
  if (total >= 10) return 'pathogenic';
  if (total >= 6) return 'likely_pathogenic';
  if (total >= 0) return 'vus';
  if (total >= -6) return 'likely_benign';
  return 'benign';
}
export function scores(record) {
  let pathogenic = 0, benign = 0, accepted = 0;
  for (const row of record.criteria || []) {
    const def = BY_CODE.get(row.code);
    if (!def || row.status !== 'accepted') continue;
    const value = POINTS[def.group]?.[row.applied_strength];
    if (typeof value !== 'number') continue;
    accepted++;
    if (value > 0) pathogenic += value;
    else benign += value;
  }
  return { pathogenic, benign, total: pathogenic + benign, accepted, point_based_category: accepted ? categoryFromPoints(pathogenic + benign) : null };
}

/** Validation is structural and documentary; it does not establish clinical validity. */
export function validate(input, { strict = false } = {}) {
  // Check canonical source values before normalisation supplies defaults.
  // Versionless legacy inputs are allowed only with an explicit migration flag.
  const sourceIssues = input?.schema === SCHEMA
    ? schemaIssues(input.qem_rule_set === undefined ? { ...input, qem_rule_set: QEM_RULE_SET } : input)
    : [];
  const data = normalise(input);
  const issues = [];
  const add = (level, id, path, message) => issues.push({ level, item_id: id, path, message });
  const schemaFailures = new Map([...sourceIssues, ...schemaIssues(data)]
    .map(issue => [`${issue.path}\u0000${issue.message}`, issue]));
  for (const issue of schemaFailures.values()) add('error', 'dataset', issue.path, issue.message);
  if (data.metadata?.qem_rule_set_inferred === true) {
    add('warning', 'dataset', 'qem_rule_set',
      'Legacy file omitted qem_rule_set. Version v3 is provisionally assigned; QEM export is blocked until you confirm the rules by adding the version and removing metadata.qem_rule_set_inferred.');
  }
  const reviewSummary = { records_with_gaps: 0, records_with_all_dispositions: 0, not_assessed: 0,
    pending: 0, not_applicable: 0, qem_na: 0, qem_documented: 0 };
  const ids = new Set();
  for (const record of data.records) {
    const id = record.item_id;
    if (typeof id !== 'string' || !id.trim()) add('error', String(id), 'item_id', 'A nonempty item_id is required');
    if (ids.has(id)) add('error', id, 'item_id', 'Duplicate item ID');
    ids.add(id);
    if (!record.variant?.gene || !(record.variant?.hgvs_c || record.variant?.coordinate)) add('error', id, 'variant', 'Gene and either HGVS c. or genomic coordinate are required');
    if (!record.variant?.genome_build) add('warning', id, 'variant.genome_build', 'Genome build not recorded');
    if (!record.variant?.transcript) add('warning', id, 'variant.transcript', 'Transcript not recorded');
    if (!record.guideline_basis) add('warning', id, 'guideline_basis', 'Guideline basis not specified');
    if (!record.review || typeof record.review !== 'object' || Array.isArray(record.review)) add('error', id, 'review', 'Review must be an object');
    if (!record.review?.reviewer) add(strict ? 'error' : 'warning', id, 'review.reviewer', 'Reviewer not specified');
    if (!record.review?.date) add(strict ? 'error' : 'warning', id, 'review.date', 'Review date not specified');
    if (typeof record.review?.signoff !== 'boolean') add('error', id, 'review.signoff', 'Sign-off must be a boolean');
    else if (!record.review.signoff) add(strict ? 'error' : 'warning', id, 'review.signoff', 'Review not signed off');
    if (record.classification !== null && record.classification !== '' && !CLASSIFICATIONS.includes(record.classification)) add('error', id, 'classification', 'Unknown classification');
    let unassessed = 0;
    let pending = 0;
    let notApplicable = 0;
    let qemNA = 0;
    for (const criterion of record.criteria) {
      if (criterion.status === 'not_applicable') notApplicable++;
      if (criterion.status === 'needs_second_review' || ['conflicting', 'insufficient_quality', 'requires_second_review'].includes(criterion.evidence_status)) pending++;
      if (criterion.qem_raw_outcome === 'NA') qemNA++;
      const path = `criteria.${criterion.code}`;
      const def = BY_CODE.get(criterion.code);
      if (!def) { add('error', id, path, 'Unknown ACMG criterion'); continue; }
      if (!STATUSES.includes(criterion.status)) add('error', id, `${path}.status`, 'Unknown review status');
      if (!EVIDENCE.includes(criterion.evidence_status)) add('error', id, `${path}.evidence_status`, 'Unknown evidence status');
      if (!STRENGTHS.includes(criterion.applied_strength) || (def.group === 'benign' && !['supporting','moderate','strong'].includes(criterion.applied_strength) && def.code !== 'BA1') || (def.group === 'pathogenic' && criterion.applied_strength === 'standalone')) add('error', id, `${path}.applied_strength`, 'Invalid strength for evidence group');
      if (criterion.code === 'BA1' && criterion.applied_strength !== 'standalone') add('error', id, `${path}.applied_strength`, 'BA1 must remain stand-alone');
      if (criterion.verified !== true && criterion.verified !== false) add('error', id, `${path}.verified`, 'verified must be boolean');
      const qemRule = ruleForCriterion(criterion.code);
      if (criterion.qem_rule_id !== qemRule?.id) add('error', id, `${path}.qem_rule_id`, 'QEM rule identifier does not match the criterion and versioned catalogue');
      if (typeof criterion.qem_source_ref !== 'string') add('error', id, `${path}.qem_source_ref`, 'QEM source reference must be text');
      if (typeof criterion.qem_verified !== 'boolean') add('error', id, `${path}.qem_verified`, 'QEM verification must be true or false');
      if (criterion.qem_verified === true && !text(criterion.qem_source_ref).trim()) add('error', id, `${path}.qem_source_ref`, 'QEM verification requires a supporting QEM source reference');
      if (!QEM_RAW_OUTCOMES.includes(criterion.qem_raw_outcome)) add('error', id, `${path}.qem_raw_outcome`, 'QEM raw outcome must be TRUE, FALSE or NA');
      if (criterion.qem_raw_outcome !== 'NA') {
        const claim = criterion.qem_raw_outcome;
        const conclusive = criterion.qem_verified === true &&
          Boolean(text(criterion.qem_source_ref).trim()) &&
          record.review?.signoff === true && Boolean(text(record.review?.reviewer).trim());
        const validFalse = !def.deprecated && criterion.status === 'accepted' && criterion.evidence_status === 'present';
        const validTrue = (criterion.status === 'rejected' &&
          ['absent_after_review', 'conflicting', 'insufficient_quality'].includes(criterion.evidence_status)) ||
          (def.deprecated && criterion.status === 'accepted' && criterion.evidence_status === 'present');
        if (!conclusive || (claim === 'FALSE' && !validFalse) || (claim === 'TRUE' && !validTrue)) {
          add('error', id, `${path}.qem_raw_outcome`,
            'Explicit QEM result requires an eligible negative-rule evaluation, qem_source_ref, qem_verified and named sign-off');
        }
      }
      if (criterion.status === 'not_assessed') {
        unassessed++;
        if (criterion.evidence_status !== 'not_assessed' && criterion.evidence_status !== 'requires_second_review') add('warning', id, path, 'Evidence was entered but the disposition remains unassessed');
      }
      if (criterion.status === 'accepted') {
        if (criterion.evidence_status !== 'present') add('error', id, path, 'Accepted criterion requires present evidence');
        if ((def.requires_notes || criterion.applied_strength !== def.default_strength) && !text(criterion.notes).trim()) add('error', id, path, 'Justification notes required');
        if (def.caveats.length && (!Array.isArray(criterion.caveats) || def.caveats.some((_, i) => criterion.caveats[i]?.confirmed !== true))) add('error', id, `${path}.caveats`, 'Required caveat confirmations are incomplete');
        if (!text(criterion.notes).trim() && !text(criterion.source_ref).trim()) add('warning', id, path, 'No supporting evidence reference or notes recorded');
        if (def.deprecated) add('warning', id, path, 'Criterion has been deprecated in the source implementation');
      }
      if (criterion.verified && (!record.review?.reviewer || !record.review?.signoff || !text(criterion.source_ref).trim())) add('error', id, path, 'Verified evidence requires a source reference and signed-off named review');
      if (criterion.status === 'rejected' && criterion.evidence_status === 'present' && !text(criterion.notes).trim()) add('warning', id, path, 'Present evidence was rejected without a justification');
      if (criterion.status === 'not_applicable' && criterion.evidence_status === 'present') add('error', id, path, 'Present evidence cannot also be not applicable');
      if (criterion.status === 'needs_second_review' || ['conflicting', 'insufficient_quality', 'requires_second_review'].includes(criterion.evidence_status)) add('warning', id, path, 'Unresolved or insufficient evidence needs further review');
    }
    if (unassessed) add(strict ? 'error' : 'warning', id, 'criteria', `${unassessed} of ${CRITERIA.length} criteria remain not assessed`);
    if (notApplicable === CRITERIA.length) add('warning', id, 'criteria',
      'All 28 criteria are marked not applicable. This is a recorded disposition, not proof of an adequate applicability review; document the rationale.');
    reviewSummary.not_assessed += unassessed;
    reviewSummary.pending += pending;
    reviewSummary.not_applicable += notApplicable;
    reviewSummary.qem_na += qemNA;
    reviewSummary.qem_documented += record.criteria.length - qemNA;
    if (unassessed || pending || notApplicable === CRITERIA.length || record.review?.signoff !== true) reviewSummary.records_with_gaps++;
    else reviewSummary.records_with_all_dispositions++;
    const s = scores(record);
    if (s.accepted && record.classification && s.point_based_category !== record.classification) add('warning', id, 'classification', `Entered classification differs from point-based category (${s.point_based_category}); assess the declared guideline basis`);
    const accepted = record.criteria.filter(c => c.status === 'accepted');
    if (accepted.some(c => c.code === 'BA1') && accepted.some(c => BY_CODE.get(c.code)?.group === 'pathogenic')) add('error', id, 'criteria', 'BA1 and pathogenic evidence both accepted; reconcile conflict');
    if (s.pathogenic >= 4 && s.benign <= -4) add('error', id, 'criteria', 'Strong pathogenic and benign evidence conflict');
  }
  const errors = issues.filter(x => x.level === 'error').length;
  const warnings = issues.filter(x => x.level === 'warning').length;
  return { ok: errors === 0 && (!strict || warnings === 0),
    summary: { records: data.records.length, errors, warnings, strict, review: reviewSummary },
    issues, data };
}

/** Adapter back to the site's v1 JSON. The site's own renderer remains authoritative for its PDF/HTML layout. */
export function toSiteJSON(input) {
  const data = normalise(input);
  const isTouched = c => c.status !== 'not_assessed' || c.evidence_status !== 'not_assessed' || Boolean(c.notes);
  const mapCriterion = c => {
    const def = BY_CODE.get(c.code);
    const points = c.status === 'accepted' ? POINTS[def.group][c.applied_strength] || 0 : 0;
    const suffix = { supporting:'Supporting', moderate:'Moderate', strong:'Strong', very_strong:'VeryStrong', standalone:'StandAlone' };
    const notation = c.applied_strength === def.default_strength ? c.code : `${c.code}_${suffix[c.applied_strength]}`;
    return { criterion: c.code, notation, group: def.group, status: c.status, default_strength: def.default_strength, applied_strength: c.applied_strength, strength_modified: c.applied_strength !== def.default_strength, points, evidence_status: c.evidence_status, caveat_status: def.caveats.length ? (def.caveats.every((_, i) => c.caveats?.[i]?.confirmed === true) ? 'completed' : 'incomplete') : 'not_applicable', caveats: clone(c.caveats), notes: [c.notes || '', c.source_ref ? `Evidence source: ${c.source_ref}` : ''].filter(Boolean).join('\n') };
  };
  const v = record => ({ variant: record.variant, case_context: record.case_context, review: record.review, guideline_basis: record.guideline_basis, criteria: record.criteria.filter(isTouched).map(mapCriterion), criteria_audit: record.criteria.map(mapCriterion), validation: { entered_classification: record.classification, pathogenic_points: scores(record).pathogenic, benign_points: scores(record).benign, total_points: scores(record).total, point_based_category: scores(record).point_based_category }, ...(Object.keys(record.external_evidence || {}).length ? { external_evidence: record.external_evidence } : {}), ...(record.extensions?.gene_structure_view ? { gene_structure_view: record.extensions.gene_structure_view } : {}) });
  if (data.records.length === 1) {
    const record = data.records[0], out = v(record);
    return { schema: 'switzerlandomics.acmg-validator.v1', guideline_basis: record.guideline_basis, review: record.review, variant: out.variant, case_context: out.case_context, provenance: record.provenance, genotype_review: record.genotype_review, criteria: out.criteria, validation: out.validation, ...(out.external_evidence ? { external_evidence: out.external_evidence } : {}) };
  }
  return { schema: 'switzerlandomics.acmg-validator.case.v1', review: data.records[0].review, case_context: data.records[0].case_context, provenance: data.records[0].provenance, genotype_review: data.records[0].genotype_review, variants: data.records.map((record, index) => ({ variant_index: index + 1, ...v(record) })) };
}
