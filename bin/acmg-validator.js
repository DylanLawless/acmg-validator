#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { normalise, validate, toSiteJSON } from '../src/core.js';
import { toTSV, fromTSV, blankTSV } from '../src/formats.js';
import { qemBundleFiles } from '../src/qem-bundle.js';
import { toHTML } from '../src/report.js';

const HELP = `ACMG Validator · structured evidence validation and conversion

Usage:
  acmg-validator --version
  acmg-validator validate FILE [--strict] [--json]
  acmg-validator convert FILE --to json|tsv|site-json|html [--out FILE]
  acmg-validator qem FILE --out-dir DIRECTORY
  acmg-validator template [--out FILE]
  acmg-validator serve [--port 8765]

Input: canonical ACMG evidence JSON, Switzerland Omics ACMG Validator v1 JSON, or long-format TSV.
All processing is local. No patient data are sent to any service.
`;
function option(args, key, fallback) { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; }
function fail(message) { process.stderr.write(`Error: ${message}\n`); process.exitCode = 1; }
async function load(path) { const body = await readFile(path, 'utf8'); return extname(path).toLowerCase() === '.tsv' ? fromTSV(body) : normalise(JSON.parse(body)); }
async function save(path, content) { await mkdir(dirname(resolve(path)), { recursive:true }); await writeFile(path, content, 'utf8'); }
async function serve(port) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const paths = new Map([['/','web/index.html'],['/index.html','web/index.html'],['/app.js','web/app.js'],['/style.css','web/style.css'],['/src/core.js','src/core.js'],['/src/schema-check.js','src/schema-check.js'],['/schemas/acmg-evidence.v1.schema.json','schemas/acmg-evidence.v1.schema.json'],['/src/load-json.js','src/load-json.js'],['/src/criteria.json','src/criteria.json'],['/src/formats.js','src/formats.js'],['/src/qem.js','src/qem.js'],['/src/qem-catalogue.js','src/qem-catalogue.js'],['/src/qem-rules.json','src/qem-rules.json'],['/src/report.js','src/report.js'],['/src/archive.js','src/archive.js'],['/src/qem-bundle.js','src/qem-bundle.js'],['/examples/completed.json','examples/completed.json'],['/examples/completed.tsv','examples/completed.tsv'],['/examples/cohort.json','examples/cohort.json'],['/examples/cohort.tsv','examples/cohort.tsv'],['/examples/qem-rules.tsv','examples/qem-rules.tsv'],['/qem.html','web/qem.html'],['/qem-reference.js','web/qem-reference.js']]);
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.tsv':'text/tab-separated-values; charset=utf-8' };
  http.createServer(async (req,res) => {
    const pathname = (req.url || '/').split('?')[0];
    const relative = paths.get(pathname);
    if (!relative) { res.writeHead(404); res.end('Not found'); return; }
    try { const bytes = await readFile(resolve(root, relative)); res.writeHead(200, { 'Content-Type':types[extname(relative)], 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" }); res.end(bytes); }
    catch { res.writeHead(500); res.end('Unable to load resource'); }
  }).listen(port, '127.0.0.1', () => process.stdout.write(`Local ACMG Validator: http://127.0.0.1:${port}\n`));
}
async function main(args) {
  const [cmd, file] = args;
  if (!cmd || ['help','-h','--help'].includes(cmd)) { process.stdout.write(HELP); return; }
  if (['--version', '-v', 'version'].includes(cmd)) {
    const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${packageInfo.version}\n`);
    return;
  }
  if (cmd === 'serve') { const port = Number(option(args,'--port','8765')); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer between 1024 and 65535'); await serve(port); return; }
  if (cmd === 'template') { const output = option(args,'--out',null); if (output) { await save(output,blankTSV()); console.log(output); } else process.stdout.write(blankTSV()); return; }
  if (!file || file.startsWith('--')) throw new Error('A JSON or TSV input file is required');
  const data = await load(file);
  if (cmd === 'validate') {
    const result = validate(data, { strict: args.includes('--strict') });
    if (args.includes('--json')) process.stdout.write(JSON.stringify({ok:result.ok, summary:result.summary, issues:result.issues},null,2)+'\n');
    else {
      console.log(`${result.summary.records} records | ${result.summary.errors} errors | ${result.summary.warnings} warnings | ${result.ok ? 'PASS' : 'FAIL'}`);
      for (const issue of result.issues) console.log(`${issue.level.toUpperCase()} ${issue.item_id} ${issue.path}: ${issue.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (cmd === 'convert') {
    const target = option(args,'--to',null), out = option(args,'--out',null);
    const writers = { json: () => JSON.stringify(data,null,2)+'\n', tsv: () => toTSV(data), 'site-json': () => JSON.stringify(toSiteJSON(data),null,2)+'\n', html: () => toHTML(data) };
    if (!Object.hasOwn(writers,target)) throw new Error('Valid output formats: json, tsv, site-json, html');
    const valid = validate(data);
    if (valid.summary.errors) throw new Error(`Input has ${valid.summary.errors} validation errors; export is blocked`);
    const content = writers[target]();
    if (out) { await save(out,content); console.log(out); } else process.stdout.write(content);
    return;
  }
  if (cmd === 'qem') {
    const folder = option(args,'--out-dir',null);
    if (!folder) throw new Error('Specify --out-dir for the QEM and QuantBayes files');
    for (const entry of qemBundleFiles(data)) {
      await save(resolve(folder, entry.name), entry.content);
    }
    console.log(`QEM and QuantBayes bundle: ${folder}`);
    return;
  }
  throw new Error(`Unknown command: ${cmd}`);
}
main(process.argv.slice(2)).catch(error => fail(error.message));
