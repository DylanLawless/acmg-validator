# Experimental SGA-QEM conversion

The [Qualifying Evidence Matrix standard](https://www.swissgenomicsassociation.ch/pages/sga_qem/) (SGA-QEM-1.0) is a **binary representation of qualifying evidence availability** under an explicitly declared rule set. It does not assess pathogenicity, diagnostic correctness, or clinical approval.

## Rule orientation

Every QEM rule in this repository is a **negative (invalidating or weakening) check**, represented by a stable `criterion_<CODE>_evidence_unqualified` identifier. The exact question for each of the 28 checks is maintained in [`src/qem-rules.json`](../src/qem-rules.json) and reviewed in the [rule-by-rule audit](qem-rule-audit.md). The ACMG criterion itself may support pathogenicity **or** benignity; the QEM rule asks whether *that criterion's qualifying documentary evidence* is missing, contradicted or unreliable. It does **not** directly invert or score the ACMG interpretation.

| QEM raw value | Binary | Meaning |
| --- | --- | --- |
| `FALSE` | `1` | A documented qualifying check was performed, no invalidating signal detected, and evidence was declared verified. |
| `TRUE` | `0` | A reviewed and verified check detected an absence, contradiction, or insufficient-quality signal. |
| `NA` | `0` | The check cannot be conclusively evaluated, is not applicable, or its outcome is unverified or pending. |

`TRUE` and `NA` are **not interchangeable** even though both map to zero. Their distinctions survive in `raw_outcomes.tsv` and `evidence.json`. A missing check never becomes `FALSE`. For semantic clarity, the repository provides the exact **negative QEM questions** in `src/qem-rules.json`, rather than silently reversing positively phrased questions. A parent-genotype availability check, if added separately, should be named `parent_gt_unavailable`; it must not use raw `parent_gt_available=TRUE` as though it were QEM `1`. That parent rule is an illustrative example and is not among the 28 ACMG criteria in the current QEM export.

## Explicit QEM rule evaluation

An ACMG decision is **not** a QEM rule evaluation. Before generating a non-NA raw outcome, the negative question must be explicitly answered and documented. The canonical evidence schema and TSV template provide `qem_raw_outcome` with values `TRUE`, `FALSE`, or `NA`. Its default is `NA`.

- `TRUE` says the **negative question is true**: a specific absence, contradiction, or weakening condition was confirmed.
- `FALSE` says the **negative question is false**: the check was evaluated, the invalidating condition was not found, and qualifying evidence is verified.
- `NA` means the rule was not evaluated conclusively, is inapplicable, is pending, or cannot be sufficiently verified.

A documented TRUE/FALSE outcome requires `qem_verified=true`, a non-empty `qem_source_ref`, a named reviewer and signed-off review. The criterion's ACMG state must also be compatible: `FALSE` needs accepted/present evidence; `TRUE` needs rejected evidence with a confirmed deficiency. The deprecated PP5/BP6 exception permits `TRUE` for a reviewed assertion without primary evidence, but never `FALSE`.

The converter **does not infer raw outcomes from** `status=accepted`, `status=rejected`, `evidence_status=present`, or `qem_verified=true`. If the negative rule has no explicit answer, the QEM cell is 0 with a raw `NA`. This prevents a positive ACMG assessment from being misrepresented as a completed QEM check.

Use the canonical JSON or TSV source file to record `qem_raw_outcome`, `qem_source_ref` and `qem_verified` against each negatively oriented question in `src/qem-rules.json`. Reimport the corrected file to validate it and generate exports. The browser is a read-only validator and converter, not a second manual evidence editor. A named reviewer and existing sign-off must be present for conclusive outcomes; files may also be generated programmatically by laboratory systems.

**PP5 and BP6:** These are deprecated, third-party assertion-only ACMG criteria. They never provide qualifying primary evidence as QEM `1` under this rule set. They can yield `TRUE` only if the underlying lack of evidence has been explicitly evaluated and recorded.

The `qem_verified` field is a reviewer attestation, not independent biological validation by this software. The original evidence record and raw outcomes must accompany the binary matrix. For interoperability, collaborators must use the same fixed rule set, context and provenance conventions.

## Files and usage

```bash
node bin/acmg-validator.js qem examples/completed.json --out-dir output/qem
```

The output bundle has:

- `matrix.tsv`: the original QEM binary 0/1 matrix, with `item_id` as its identifier column.
- `quantbayes.tsv`: the **same binary matrix**, with `variant_id` as its identifier column so it can be passed to QuantBayes R.
- `raw_outcomes.tsv`: all original `TRUE`, `FALSE`, `NA` results, with matching row and rule-column order.
- `rules.json`: stable rule IDs, definitions and questions, independent rule set identifier and SGA-QEM standard version.
- `evidence.json`: the original-content-preserving canonical record, including criterion states, separate ACMG and QEM source references, and reviewer attestations.
- `run_quantbayes.R`: short R example that reads the binary matrix, calls `quant_es_core()` and `quant_es_plots()`, and keeps results in memory without writing files.
- `README.txt`: minimal instructions for the extracted bundle.

The bundle requires a source-pinned `qem_rule_set` and is suitable for multiple variants. The `variant_col = "variant_id"` argument is mandatory with the current QuantBayes file-reader API; without it, the identifier column can be coerced to missing evidence. The original `matrix.tsv` is retained unchanged for SGA-QEM provenance and backwards compatibility. See [QuantBayes integration](quantbayes.md).

The `qem_rule_id` is generated from the criterion and checked against `src/qem-rules.json`; if explicitly supplied, a mismatch is an error. `source_ref` and `verified` remain separate ACMG evidence fields. Legacy v0.1.5 files with conclusive QEM answers and no dedicated QEM provenance fields are migrated from their previously shared source/verification fields. New files must use the explicit QEM fields. View the complete rule definitions at `/qem.html` in the local application or download `examples/qem-rules.tsv`.

The **ACMG website v1.1.0** JSON does not carry the dedicated `qem_raw_outcome`, `qem_verified` and `qem_source_ref` properties required to claim a QEM 1. Such an import will conservatively produce `NA` for any outcome that is not independently documented. Work in the canonical JSON or TSV formats to preserve verification information. The website-compatible export should not be treated as a QEM-preserving round-trip through the live website.

This is an **experimental research interoperability rule set**, independently versioned as `switzerlandomics.acmg-evidence-availability.v3`. It is not a ClinGen- or SGA-endorsed ACMG-to-QEM clinical mapping. Neither the number of binary ones nor a downstream QuantBayes evidence-sufficiency result can establish pathogenicity. Cross-institution comparison requires agreement on the exact criterion catalogue, rule set, clinical context, provenance requirements and disclosure restrictions.

Reference: https://www.swissgenomicsassociation.ch/pages/sga_qem/
