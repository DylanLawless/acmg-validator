# Validation levels and interpretation

`validate FILE` checks the bundled JSON Schema constraints on canonical inputs and normalised records, including required fields, types, nonempty datasets, permitted values and real ISO dates. It additionally verifies the data format, a required `hgvs_c` or `coordinate` location (with `gene` optional but recommended), review metadata, criterion vocabulary, allowed strengths, evidence/disposition consistency, required notes and caveats, reviewer attestations, and selected cross-criterion conflicts.

- **Error:** schema contradiction or invalid evidence record. Conversion and QEM generation are blocked.
- **Warning:** incomplete or uncertain review, insufficient documentation, missing gene/transcript/build, unsigned review, or a classification inconsistent with the point-based category. Non-strict conversion preserves the warning.
- **Strict mode:** `--strict` fails on warnings as well as errors, including any criterion still marked `not_assessed`.

A supplied HGVS description or genomic coordinate is checked for presence and type; its syntax, reference sequence and allele identity are not independently verified. A missing gene symbol generates a warning, not an invalid record.

The nominal point-based category is computed from accepted criteria, using the same point strengths and threshold bands as the supplied ACMG Validator v1.1.0 source, but **this project does not independently certify the clinical interpretation or current gene-specific applicability of a rule**. A disagreement with an entered classification warrants investigation of the selected guideline, not an automatic replacement of the clinical result. Variant scores are never added across different variants.

A status of `not_assessed` is an explicit record of missing review, not a negative evidence finding. No tool can establish that a person actually performed a check solely from the presence of a TSV value. User-supplied reviewer attestations are provenance claims, not cryptographic proof. For regulated use, institution-specific change control, access logs, authorisation, electronic signatures and validation are required.

A conclusive QEM TRUE/FALSE declaration requires an eligible reviewed criterion, `qem_source_ref`, `qem_verified=true` and a signed-off named reviewer. Missing or unspecified QEM answers remain NA. Invalid QEM declarations are errors and block export.

External annotations are inputs, not independently verified truth. This toolkit makes no automatic evidence lookups, medical decisions or diagnoses.

## Recorded review coverage versus validated structure

The validator reports `summary.review` separately from errors and warnings. Its fields include the counts of criteria not assessed, pending or conflicting, marked not applicable, and with NA or conclusive QEM outcomes. A signed-off recorded disposition is not evidence that an underlying scientific check was actually performed. If all 28 criteria are marked not applicable, the validator emits a review warning rather than treating the record as a completed applicability assessment. An export can therefore be structurally valid while review gaps remain.

## QEM rule-set provenance

The TSV entry format does not ask users to repeat the QEM rule-set identifier on every criterion row. It uses the installed `src/qem-rules.json` catalogue, with stable `qem_rule_id` values. Canonical JSON and each generated QEM bundle include the exact rule-set identifier for reproducibility. Canonical JSON with a missing or incompatible identifier is rejected rather than silently reinterpreted. For historical datasets, explicitly migrate and re-evaluate the rules before import.
