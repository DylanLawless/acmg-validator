/** Validates the JSON Schema keywords used by our bundled Draft 2020-12 schema.
 * This intentionally small offline validator rejects unsupported keywords if
 * the schema evolves. Cross-field and review checks belong in core.validate.
 */
import { loadJSON } from './load-json.js';
const schema = await loadJSON('../schemas/acmg-evidence.v1.schema.json', import.meta.url);
const supported = new Set(['$schema', '$id', '$ref', '$defs', 'title', 'description',
  'type', 'required', 'properties', 'additionalProperties', 'items', 'minItems',
  'minLength', 'enum', 'const', 'format']);
function checkKeywords(def) {
  if (!def || typeof def !== 'object') return;
  for (const key of Object.keys(def)) {
    if (!supported.has(key)) throw new Error(`Unsupported JSON Schema keyword: ${key}`);
  }
  for (const nested of Object.values(def.properties || {})) checkKeywords(nested);
  for (const nested of Object.values(def.$defs || {})) checkKeywords(nested);
  if (def.items) checkKeywords(def.items);
}
checkKeywords(schema);
const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(year, month, 0);
  return day <= lastDay.getUTCDate();
};
export function schemaIssues(value) {
  const issues = [];
  const walk = (input, def, path) => {
    if (def.$ref) {
      const name = def.$ref.match(/^#\/\$defs\/([^/]+)$/)?.[1];
      if (!name || !schema.$defs[name]) throw new Error(`Unsupported schema reference: ${def.$ref}`);
      walk(input, schema.$defs[name], path);
      return;
    }
    const types = def.type === undefined ? [] : Array.isArray(def.type) ? def.type : [def.type];
    if (types.length && !types.includes(kind(input))) {
      issues.push({ path, message: `Expected ${types.join(' or ')}, received ${kind(input)}` });
      return;
    }
    if (Object.hasOwn(def, 'const') && input !== def.const) issues.push({ path, message: 'Value does not match the declared schema' });
    if (def.enum && !def.enum.includes(input)) issues.push({ path, message: 'Value is not in the permitted enumeration' });
    if (typeof input === 'string') {
      if (def.minLength !== undefined && input.length < def.minLength) issues.push({ path, message: `Requires at least ${def.minLength} character(s)` });
      if (def.format === 'date' && input !== '' && !validDate(input)) issues.push({ path, message: 'Expected a real ISO date (YYYY-MM-DD)' });
    }
    if (Array.isArray(input)) {
      if (def.minItems !== undefined && input.length < def.minItems) issues.push({ path, message: `Requires at least ${def.minItems} entries` });
      if (def.items) input.forEach((item, index) => walk(item, def.items, `${path}[${index}]`));
    }
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      for (const name of def.required || []) if (!Object.hasOwn(input, name)) issues.push({ path: `${path}.${name}`, message: 'Required field is missing' });
      for (const [name, constraint] of Object.entries(def.properties || {})) {
        if (Object.hasOwn(input, name)) walk(input[name], constraint, `${path}.${name}`);
      }
      if (def.additionalProperties === false) for (const name of Object.keys(input)) {
        if (!Object.hasOwn(def.properties || {}, name)) issues.push({ path: `${path}.${name}`, message: 'Unknown property' });
      }
    }
  };
  walk(value, schema, 'dataset');
  return issues;
}
