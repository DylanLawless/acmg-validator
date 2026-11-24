import { normalise, validate, CRITERIA } from './core.js';
import { parseTSV } from './formats.js';
import { QEM_RULES, QEM_RULE_SET, QEM_POLARITY, ruleForCriterion } from './qem-catalogue.js';

export const QEM_VERSION = 'SGA-QEM-1.0';
export { QEM_RULES, QEM_RULE_SET };

const criterionIds = new Set(QEM_RULES.map(rule => rule.criterion));
if (QEM_POLARITY !== 'TRUE_detects_invalidating_or_weakening_signal' ||
    QEM_RULES.length !== CRITERIA.length ||
    criterionIds.size !== CRITERIA.length ||
    new Set(QEM_RULES.map(rule => rule.id)).size !== CRITERIA.length ||
    CRITERIA.some(def => !criterionIds.has(def.code))) {
  throw new Error('QEM rule catalogue does not match the ACMG criterion catalogue');
}

/**
 * A documentary evidence projection, not an independent scientific rule evaluator.
 * TRUE and FALSE both require a conclusive, sourced, reviewer-attested finding.
 * NA captures missing, incomplete, inapplicable or unverified review information.
 * PP5/BP6 are deprecated assertion-only criteria and cannot yield QEM 1.
 */
export function qemOutcome(record, criterion) {
  if (!criterion) return 'NA';
  const rule = ruleForCriterion(criterion.code);
  if (!rule || criterion.qem_rule_id !== rule.id) return 'NA';

  // An ACMG status is NOT an evaluation of the negative QEM rule.
  // A missing explicit response is NA, not an inferred TRUE or FALSE.
  const response = criterion.qem_raw_outcome ?? 'NA';
  if (response === 'NA' || !['TRUE', 'FALSE'].includes(response)) return 'NA';

  const reviewAttested = record.review?.signoff === true &&
    typeof record.review?.reviewer === 'string' && Boolean(record.review.reviewer.trim());
  const outcomeVerified = criterion.qem_verified === true &&
    typeof criterion.qem_source_ref === 'string' && Boolean(criterion.qem_source_ref.trim());
  if (!reviewAttested || !outcomeVerified) return 'NA';

  if (response === 'FALSE' && rule.can_qualify &&
      criterion.status === 'accepted' && criterion.evidence_status === 'present') return 'FALSE';

  // PP5/BP6 are deprecated assertions without primary evidence, so a
  // documented review of that deficiency can be a TRUE, never a FALSE.
  if (response === 'TRUE' &&
      ((criterion.status === 'rejected' &&
        ['absent_after_review', 'conflicting', 'insufficient_quality'].includes(criterion.evidence_status)) ||
       (!rule.can_qualify && criterion.status === 'accepted' && criterion.evidence_status === 'present'))) return 'TRUE';

  return 'NA';
}

export function toQEM(input) {
  const result = validate(input);
  if (result.summary.errors) throw new Error(`Cannot project invalid ACMG records (${result.summary.errors} structural or consistency errors)`);
  const data = result.data;
  if (data.metadata?.qem_rule_set_inferred === true) {
    throw new Error('QEM export requires an explicitly confirmed qem_rule_set. Inspect the v3 rules and remove metadata.qem_rule_set_inferred only after verification.');
  }
  const rules = CRITERIA.map(def => {
    const rule = ruleForCriterion(def.code);
    return {
      ...rule,
      group: def.group,
      polarity: 'invalidating',
      raw_true: rule.can_qualify
        ? 'Explicitly answered TRUE: a confirmed invalidating condition, with rejected disposition and verified, sourced, signed-off review.'
        : 'Explicitly reviewed third-party assertion whose primary evidence is unavailable by definition, or a confirmed rejected criterion, with sourced, signed-off review.',
      raw_false: rule.can_qualify
        ? 'Explicitly answered FALSE: the invalidating condition was evaluated and not detected, with qualifying evidence verified and sourced under a named signed-off review.'
        : 'Not possible for this deprecated assertion-only criterion: a third-party claim without underlying primary evidence cannot qualify.',
      raw_na: 'Negative rule not explicitly answered, not evaluable, incomplete or unverified. ACMG accepted/rejected status alone does not imply a QEM outcome.'
    };
  });
  const ruleIds = rules.map(rule => rule.id);
  const raw = [['item_id', ...ruleIds].join('\t')];
  const matrix = [['item_id', ...ruleIds].join('\t')];
  const quantbayes = [['variant_id', ...ruleIds].join('\t')];
  const escapeID = value => { if (!value || /[\t\n\r]/.test(value)) throw new Error('QEM item_id must not contain a tab or newline'); return value; };
  for (const record of data.records) {
    const byCode = new Map(record.criteria.map(criterion => [criterion.code, criterion]));
    const outcomes = rules.map(rule => qemOutcome(record, byCode.get(rule.criterion)));
    const id = escapeID(record.item_id);
    raw.push([id, ...outcomes].join('\t'));
    const binaryRow = [id, ...outcomes.map(outcome => outcome === 'FALSE' ? '1' : '0')].join('\t');
    matrix.push(binaryRow);
    quantbayes.push(binaryRow);
  }
  return {
    matrix: `${matrix.join('\n')}\n`,
    quantbayes: `${quantbayes.join('\n')}\n`,
    raw: `${raw.join('\n')}\n`,
    metadata: {
      standard: QEM_VERSION,
      rule_set: QEM_RULE_SET,
      polarity: QEM_POLARITY,
      rules,
      item_ids: data.records.map(record => record.item_id),
      projection: 'Documentary availability of qualifying ACMG-criterion evidence, not pathogenicity or clinical significance.',
      qualification: 'qem_verified and qem_source_ref document the evaluation of the QEM rule, separately from ACMG evidence verification. Neither independently proves the biological finding.',
      mapping: { FALSE: 1, TRUE: 0, NA: 0 },
      provenance: 'The original full ACMG evidence record must accompany this lossy projection for independent review.'
    }
  };
}

export function validateQEM(matrixText, rawText) {
  const raw = parseTSV(rawText, ['item_id']), matrix = parseTSV(matrixText, ['item_id']);
  if (raw.length !== matrix.length) throw new Error('QEM rows differ');
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = matrix[i];
    if (a.item_id !== b.item_id) throw new Error(`QEM item order differs at row ${i}`);
    if (Object.keys(a).join('|') !== Object.keys(b).join('|')) throw new Error('QEM rule columns differ');
    for (const rule of Object.keys(a).filter(key => key !== 'item_id')) {
      if (!['TRUE','FALSE','NA'].includes(a[rule]) || !['0','1'].includes(b[rule]) || b[rule] !== (a[rule] === 'FALSE' ? '1' : '0')) throw new Error(`QEM mapping invalid for ${a.item_id}, ${rule}`);
    }
  }
  return true;
}
