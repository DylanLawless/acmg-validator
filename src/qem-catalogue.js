/** Single source of truth for the versioned, negatively oriented QEM rules. */
import { loadJSON } from './load-json.js';
const catalogue = await loadJSON('./qem-rules.json', import.meta.url);
export const QEM_RULE_SET = catalogue.id;
export const QEM_POLARITY = catalogue.polarity;
export const QEM_RULES = Object.freeze(catalogue.rules);
const byCriterion = new Map(QEM_RULES.map(rule => [rule.criterion, rule]));
export function ruleForCriterion(code) { return byCriterion.get(code) || null; }

/** Downloadable human-readable reference, regenerated from the same catalogue. */
export function qemReferenceTSV() {
  const cells = value => {
    const text = String(value).replace(/[\r\n]/g, ' ');
    return /[\t"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const headers = ['criterion', 'qem_rule_id', 'invalidating_question', 'qualifying_evidence', 'raw_TRUE', 'raw_FALSE', 'raw_NA'];
  const rows = [headers.join('\t')];
  for (const rule of QEM_RULES) {
    const values = [rule.criterion, rule.id, rule.invalidating_question, rule.positive_evidence_target,
      'Confirmed invalidating condition; maps to 0',
      rule.can_qualify ? 'Checked and not detected; verified qualifying evidence; maps to 1' : 'Not available for deprecated assertion-only criterion',
      'Not conclusively evaluated or inadequately verified; maps to 0'];
    rows.push(values.map(cells).join('\t'));
  }
  return `${rows.join('\n')}\n`;
}

