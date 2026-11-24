import { QEM_RULES, QEM_RULE_SET } from '/src/qem-catalogue.js';

const body = document.getElementById('rule-rows');
for (const rule of QEM_RULES) {
  const row = document.createElement('tr');
  const values = [rule.criterion, rule.id, rule.invalidating_question,
    rule.can_qualify ? rule.positive_evidence_target : `${rule.positive_evidence_target} (deprecated: no QEM 1)`];
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  body.append(row);
}
document.getElementById('rule-set-label').textContent = `Rule set: ${QEM_RULE_SET} · ${QEM_RULES.length} rules`;
