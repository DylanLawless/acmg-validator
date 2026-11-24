# Changelog

## 0.1.7

- Fixed TSV visible-column precedence, including blank-field deletion and consistency across all variant rows.
- Added schema-aware runtime validation and valid ISO date checks; rejects empty datasets and malformed typed values.
- Pinned the versioned QEM rule set in canonical JSON and long TSV. Rejects mismatched versions; legacy versionless inputs remain inspectable but QEM exports require explicit version confirmation.
- Separated structural validation from documented review coverage and flagged all-not-applicable reviews.
- Kept canonical JSON as the only browser JSON export. Website JSON remains a documented CLI compatibility adapter.
- Added a visible application version, QuantBayes and SGA-QEM links, and a simpler R runner with optional TSV-save examples.

## 0.1.6

- Added explicit `qem_rule_id`, `qem_source_ref` and `qem_verified` fields to canonical records, TSVs, templates, and audit reports.
- Kept the separate ACMG `source_ref` and `verified` fields and safely migrated conclusive legacy QEM attestations from v0.1.5.
- Added a human-readable QEM criteria page, with 28 versioned negative questions and the normative TRUE/FALSE/NA semantics, plus a downloadable rule reference TSV.
- Added QEM rule ID mismatch and provenance validation, expanded round-trip and CLI/browser regression tests, and refreshed synthetic fixtures.
- Preserved the existing QEM matrix rule identifiers, v3 rule-set semantics, and QuantBayes output layout.

## 0.1.5

- Removed manual QEM editing from the local browser: original JSON/TSV files remain the authoritative evidence source.
- Added read-only QEM outcome coverage next to validation findings, distinguishing export eligibility from assessment completeness.
- Made reimporting a corrected file with the same filename reliable.
- Simplified the bundled R example to run QuantBayes and expose plots in memory, without writing tables or figures.
- Updated the browser guidance, QEM documentation and regression tests; no data schema or QEM rule mapping changed.

## 0.1.4

- Added a QuantBayes-compatible `quantbayes.tsv` alongside the unchanged SGA-QEM `matrix.tsv`.
- Added a validated R runner and usage guide; exported files are shared between CLI and browser through one bundle implementation.
- Added eight-variant synthetic cohort examples in JSON, TSV and a precomputed binary evidence matrix.
- Exposed the cohort example in the local browser and added regression checks for row order, identifiers and binary parity.
- Preserved the negative QEM rule set, explicit TRUE/FALSE/NA semantics and existing website JSON adapters.

## 0.1.3

- Added explicit, negatively oriented QEM evaluation through `qem_raw_outcome` (TRUE/FALSE/NA), with no implicit conversion from ACMG criterion acceptance.
- Added an optional QEM review table showing each invalidating question and allowing verified, sourced answers.
- Preserved QEM answers in canonical JSON and TSV; old website exports remain conservative NA.
- Replaced browser JSON import attributes with a shared local JSON loader for improved browser compatibility.
- Added a visible module-initialisation warning, completed-example loading, and cleared stale results after failed imports.
- Advanced the independently versioned QEM documentary rule set to `switzerlandomics.acmg-evidence-availability.v3`.
- Extended semantic and round-trip regression tests.

## 0.1.2

- Reworked the local browser interface to match Switzerland Omics typography, colours and restrained page styling.
- Removed decorative badges, boxed logo, numbered marketing headings, large slogan and feature tiles.
- Preserved all import, validation, JSON/TSV/HTML and QEM controls and their identifiers.
- Updated the interface screenshot and checked desktop/mobile layouts.

## 0.1.1

- Explicitly audited and documented the negative orientation of all 28 QEM documentary checks in `src/qem-rules.json`.
- QEM projection now requires an explicitly verified, sourced, named and signed-off review for *both* a confirmed failure (`TRUE`) and qualifying evidence (`FALSE`).
- Unreviewed, unresolved or unsupported findings correctly project to `NA`, not to observed contradictions.
- Deprecated assertion-only PP5 and BP6 cannot produce a QEM `1` without underlying primary evidence.
- Versioned the revised QEM documentary rule set independently as `switzerlandomics.acmg-evidence-availability.v2`.
- Added exhaustive per-criterion polarity regression tests and the browser route for the QEM rule catalogue.

## 0.1.0

- Initial standalone ACMG evidence schema and 28-criterion catalogue based on ACMG Validator v1.1.0.
- JSON and long-format TSV imports/exports with website v1 JSON adapters.
- Local structural and documentary validation engine and printable HTML audit.
- Minimal drag-and-drop browser interface and cross-platform Node CLI.
- Conservative experimental SGA-QEM-1.0 evidence-availability projection with raw outcomes and provenance.
- Synthetic examples, tests and GitHub Actions CI.
