import { normalise, validate, CRITERIA, scores } from '/src/core.js';
import { toTSV, fromTSV, blankTSV } from '/src/formats.js';
import { qemOutcome } from '/src/qem.js';
import { qemBundleFiles } from '/src/qem-bundle.js';
import { toHTML } from '/src/report.js';
import { makeZip } from '/src/archive.js';

const element = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const displayCategory = value => String(value || '').replaceAll('_', ' ').replace(/^./, first => first.toUpperCase());

let data = null;
let result = null;

function download(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function refreshValidation() {
  result = validate(data);
  element('record-count').textContent = result.summary.records;
  element('error-count').textContent = result.summary.errors;
  element('warning-count').textContent = result.summary.warnings;

  const status = element('validation-status');
  status.textContent = result.summary.errors
    ? `Structure and consistency: ${result.summary.errors} error(s). Correct these before export.`
    : 'Structure and consistency: passed. This does not verify biological evidence.';
  const review = result.summary.review;
  element('review-status').textContent = `Review coverage: ${review.records_with_all_dispositions} of ${result.summary.records} variants have recorded, signed-off dispositions without unresolved review states. ${review.not_assessed} criteria unassessed, ${review.pending} pending or conflicting; ${review.not_applicable} marked not applicable. A recorded disposition does not prove that a check was performed.`;
  status.className = 'status-line' +
    (result.summary.errors ? ' bad' : '');

  let documented = 0;
  let qualifying = 0;
  element('variant-rows').innerHTML = data.records.map(record => {
    const addressed = record.criteria.filter(c => c.status !== 'not_assessed').length;
    const score = scores(record);
    const outcomes = record.criteria.map(criterion => qemOutcome(record, criterion));
    const assessed = outcomes.filter(outcome => outcome !== 'NA').length;
    documented += assessed;
    qualifying += outcomes.filter(outcome => outcome === 'FALSE').length;
    return `<tr><td>${escape(record.variant.gene)} ${escape(record.variant.hgvs_c || record.variant.coordinate)}</td>` +
      `<td>${escape(displayCategory(record.classification) || 'Not entered')}</td>` +
      `<td>${addressed} / ${CRITERIA.length}</td>` +
      `<td>${assessed} / ${CRITERIA.length}</td>` +
      `<td>${escape(displayCategory(score.point_based_category) || 'Not available')}</td></tr>`;
  }).join('');

  const total = data.records.length * CRITERIA.length;
  element('qem-coverage').textContent = result.summary.errors
    ? 'QEM export is unavailable until validation errors are corrected in the source file.'
    : data.metadata?.qem_rule_set_inferred === true
      ? 'QEM export is blocked until the source QEM rule-set version has been explicitly confirmed. Canonical JSON and TSV are still available for correction.'
    : `QEM: ${documented} of ${total} negative-rule outcomes documented, including ${qualifying} qualifying evidence outcomes. ${total - documented} remain NA. Exportable does not mean fully evaluated.`;

  element('issue-count').textContent = `(${result.issues.length})`;
  element('issue-list').innerHTML = result.issues.length
    ? result.issues.map(issue =>
        `<div class="issue issue--${escape(issue.level)}"><strong>${escape(issue.level.toUpperCase())}</strong>` +
        `${escape(issue.item_id)} / ${escape(issue.path)}: ${escape(issue.message)}</div>`).join('')
    : '<p>No issues detected.</p>';

  for (const id of ['json', 'tsv', 'html', 'qem']) {
    element(id).disabled = result.summary.errors > 0 ||
      (id === 'qem' && data.metadata?.qem_rule_set_inferred === true);
  }
}

function show(input, filename) {
  const imported = normalise(input);
  data = imported;
  element('results').hidden = false;
  element('filename').textContent = filename;
  refreshValidation();
  element('feedback').textContent = '';
}

function clearImport(message) {
  data = null;
  result = null;
  element('results').hidden = true;
  element('feedback').textContent = message;
}

async function loadFile(file) {
  if (!file) return;
  try {
    if (!/\.(json|tsv)$/i.test(file.name)) throw new Error('Select a JSON or TSV file');
    const contents = await file.text();
    show(file.name.toLowerCase().endsWith('.tsv') ? fromTSV(contents) : JSON.parse(contents), file.name);
  } catch (error) {
    clearImport(error.message);
  }
}

// Input controls
element('file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = ''; // Allow reimporting a corrected file with the same name.
  loadFile(file);
});
const zone = element('dropzone');
for (const eventName of ['dragenter', 'dragover']) {
  zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.add('is-dragging');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  zone.addEventListener(eventName, event => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
  });
}
zone.addEventListener('drop', event => loadFile(event.dataTransfer.files[0]));
element('template').addEventListener('click', () =>
  download('acmg-evidence-template.tsv', blankTSV(), 'text/tab-separated-values'));
async function loadExample(name) {
  try {
    const response = await fetch(`/examples/${name}.json`);
    if (!response.ok) throw new Error(`Unable to load example (${response.status})`);
    show(await response.json(), `${name}.json (synthetic)`);
  } catch (error) { clearImport(error.message); }
}
element('example').addEventListener('click', () => loadExample('completed'));
element('cohort-example').addEventListener('click', () => loadExample('cohort'));


function action(handler) {
  try {
    if (!data || result.summary.errors) throw new Error('Import a valid file before exporting');
    handler();
    element('feedback').textContent = '';
  } catch (error) { element('feedback').textContent = error.message; }
}

// Outputs
element('json').addEventListener('click', () => action(() =>
  download('acmg-evidence.json', JSON.stringify(data, null, 2) + '\n', 'application/json')));
element('tsv').addEventListener('click', () => action(() =>
  download('acmg-evidence.tsv', toTSV(data), 'text/tab-separated-values')));
element('html').addEventListener('click', () => action(() =>
  download('acmg-audit.html', toHTML(data), 'text/html')));
element('qem').addEventListener('click', () => action(() => {
  const bundle = makeZip(qemBundleFiles(data));
  download('acmg-qem-bundle.zip', bundle, 'application/zip');
}));

element('app-initialising').hidden = true;
