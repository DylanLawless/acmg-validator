// Render the implementation's versioned ACMG catalogue without duplicating definitions.
const status = document.getElementById('catalogue-status');

// The source catalogue contains a few literal Unicode escape sequences in caveats.
// Decode them for display only. The source JSON and validation logic are unchanged.
const displayText = value => String(value).replace(/\\u([0-9a-f]{4})/gi,
  (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function cell(row, value, heading = false) {
  const td = document.createElement(heading ? 'th' : 'td');
  if (heading) td.scope = 'row';
  td.textContent = displayText(value);
  row.append(td);
  return td;
}

function addCriterion(def) {
  const target = document.getElementById(`${def.group}-rows`);
  if (!target) throw new Error(`Unexpected ACMG group: ${def.group}`);
  const row = document.createElement('tr');
  row.id = `criterion-${def.code}`;
  const code = cell(row, def.code, true);
  code.className = 'reference-code';
  cell(row, def.description);
  cell(row, def.default_strength.replaceAll('_', ' '));
  const requirements = document.createElement('td');
  if (def.deprecated) {
    const note = document.createElement('p');
    note.textContent = 'Deprecated criterion; do not rely on assertion-only evidence.';
    requirements.append(note);
  }
  if (def.requires_notes) {
    const note = document.createElement('p');
    note.textContent = 'Justification notes required.';
    requirements.append(note);
  }
  if (def.caveats.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = `Required caveat confirmations (${def.caveats.length})`;
    details.append(summary);
    const list = document.createElement('ul');
    for (const caveat of def.caveats) {
      const item = document.createElement('li');
      item.textContent = displayText(caveat);
      list.append(item);
    }
    details.append(list);
    requirements.append(details);
  }
  if (!requirements.childNodes.length) requirements.textContent = 'Not specified.';
  row.append(requirements);
  target.append(row);
}

try {
  const response = await fetch('/src/criteria.json');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const catalogue = await response.json();
  if (!Array.isArray(catalogue.criteria) || catalogue.criteria.length !== 28) {
    throw new Error('The criterion catalogue did not contain the expected 28 entries');
  }
  for (const criterion of catalogue.criteria) addCriterion(criterion);
  status.textContent = `Catalogue: ${catalogue.id} · ${catalogue.criteria.length} criteria`;
} catch (error) {
  status.textContent = `Unable to display the criteria: ${error.message}. Read the linked JSON catalogue instead.`;
}
