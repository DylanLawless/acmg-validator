# Data formats

## Canonical JSON

`switzerlandomics.acmg-evidence.v1` is the portable representation. Its stable outer structure is:

```json
{
  "schema": "switzerlandomics.acmg-evidence.v1",
  "rule_set": "switzerlandomics.acmg-validator.criteria.v1",
  "qem_rule_set": "switzerlandomics.acmg-evidence-availability.v3",
  "records": []
}
```

`records` must contain one or more variant reviews. Current canonical JSON requires the exact `qem_rule_set` version, independently of the ACMG `rule_set`. A mismatched QEM version is rejected. Versionless legacy files are accepted for inspection with an explicit warning but **cannot produce a QEM bundle** until the version is checked and the `metadata.qem_rule_set_inferred` flag removed. Every normalised record contains a stable `item_id`, `variant`, `case_context`, `review`, `guideline_basis`, `classification`, all 28 `criteria`, `genotype_review`, `provenance`, `external_evidence`, and `extensions`. The canonical schema is [`../schemas/acmg-evidence.v1.schema.json`](../schemas/acmg-evidence.v1.schema.json), compatible with JSON Schema Draft 2020-12.

Each criterion has `code`, `status`, `evidence_status`, `applied_strength`, `notes`, `source_ref`, `verified`, `qem_rule_id`, `qem_raw_outcome`, `qem_source_ref`, `qem_verified`, and `caveats`. The original `source_ref`/`verified` fields document ACMG evidence, while the `qem_` fields document the separate negative QEM rule. `qem_rule_id` is generated from the versioned catalogue and validated if supplied. `qem_raw_outcome` defaults to `NA`; `qem_verified` defaults to `false`. QEM TRUE/FALSE answers must be explicitly recorded against the negatively oriented question and are never derived from ACMG acceptance. The importer **never infers verification from accepted status or global sign-off**.

`status` is the human review disposition. `evidence_status` separately records whether the evidence is present, absent following review, conflicting, unavailable, or not assessed. These fields must never be treated as a binary pathogenicity label.

The catalogue in `src/criteria.json` is derived from the supplied Switzerland Omics ACMG Validator v1.1.0 implementation; for new clinical use, apply the correct current ClinGen SVI and expert-panel specifications. The software does not update them automatically.

## Tab-separated values

The TSV format has one row per variant and ACMG criterion. A wide table can be produced downstream from the long table, but is not a lossless primary representation. Common fields are plain columns, including `item_id`, `qem_rule_set`, `gene`, `transcript`, `hgvs_c`, `genome_build`, `guideline_basis`, `reviewer`, `review_date`, `signoff`, `classification`, `criterion`, `status`, `evidence_status`, `applied_strength`, `notes`, `source_ref`, `verified`, `qem_rule_id`, `qem_raw_outcome`, `qem_source_ref` and `qem_verified`.

The `record_json` and `criterion_json` columns are optional **advanced round-trip fields** written by the tool. They preserve data that cannot be cleanly flattened into a spreadsheet (provenance, caveats, additional metadata, etc.). A person filling the template can leave them out. Clearing a visible field in an advanced TSV clears that value: embedded preservation JSON never restores it. Conflicting values for the same variant across multiple rows are rejected, including blank/nonblank disagreements. Advanced TSV exports also include `qem_rule_set_inferred`: this preserves the legacy version warning across JSON → TSV conversions until the user explicitly confirms the rule set. The beginner template omits this advanced flag. Criteria with required caveat confirmations (for example, PVS1 and PM2) need their `caveats` recorded as individual confirmed entries in canonical JSON or the advanced `criterion_json` column; leaving those confirmations blank will be flagged by validation. If the advanced fields are absent, those additional data cannot be recovered by conversion. TSV exports are quoted where necessary to preserve tabs, quotes and newlines. Blank fields do not imply that a check was performed.

For the full negative questions and their TRUE/FALSE/NA meanings, open `/qem.html` in the local browser or view `examples/qem-rules.tsv`. For spreadsheet entry, use `acmg-validator template --out checklist.tsv`. The template is synthetic and not a pre-filled evidence evaluation. It deliberately marks all criteria as `not_assessed`.

## Website compatibility

- Import: `switzerlandomics.acmg-validator.v1` (one variant) and `switzerlandomics.acmg-validator.case.v1` (multiple variants), including `criteria_audit` when supplied.
- Export: `--to site-json` writes a **legacy, lossy compatibility representation** for import into the existing Switzerland Omics browser interface. The browser offers only canonical JSON as its primary JSON export; website JSON is a CLI-only adapter. QEM-specific provenance is not retained in website JSON.
- Preserve all supported criterion states, strengths, notes and caveat confirmations. Unmapped original properties are kept in canonical `extensions` where possible.
- The open-source `--to html` generates its **own portable evidence audit**, not the website's original clinical-style HTML/PDF layout. Load a site-compatible JSON back into the website to generate its existing report. Site import currently limits multi-variant cases to five variants, outside this repository.
- The website has not been modified by this repository. Shared engine deployment and pixel-identical report parity require a separately tested website change.

## Database integration

The files are database-ready **exchange records**, not a native EHR interface. A simple relational model is `evidence_review` (one row per item) joined to `criterion_review` (one row per item and criterion), using `item_id` as the stable join key. Organisations must define their own patient/case access controls, retention, identifier linkage, approval processes, source provenance and regulatory checks.

There is no HL7 FHIR profile, hospital SQL connector, automatic patient lookup or network transmission in this release. The HL7 FHIR Genomics Reporting Implementation Guide is a useful starting point for a future adapter, but compliance must be tested independently.
