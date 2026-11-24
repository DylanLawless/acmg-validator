# QuantBayes R integration

ACMG Validator exports a deterministic, binary SGA-QEM-1.0 evidence matrix for any number of variants. Each variant is a row, each of the 28 declared, negatively oriented rule IDs is a column, and each cell is `1` only when its explicit QEM raw outcome is `FALSE` and meets the documentary qualification checks. Both `TRUE` and `NA` map to `0` but remain distinct in `raw_outcomes.tsv`.

## Direct QuantBayes input

The existing `matrix.tsv` remains the standard QEM table with `item_id` as its first column. The new **`quantbayes.tsv`** has identical binary values and row/column order but renames that identifier to `variant_id` for the R package. There is **no extra data column** and no new scoring rule.

The exact QuantBayes API, as provided in the package source, is:

```r
res <- quantbayes::quant_es_from_binary_table(
  "quantbayes.tsv",
  variant_col = "variant_id"
)
res$variants
res$global
```

**Always pass `variant_col = "variant_id"`.** The QuantBayes file helper does not automatically interpret the first column as IDs: omitting `variant_col` may coerce those character identifiers to `NA`, incorrectly changing the model input. All 28 evidence columns must contain only the numeric values 0 and 1.

The included R example reads the matrix, checks its binary values, and creates QuantBayes results and plots in memory:

```bash
node bin/acmg-validator.js qem examples/cohort.json --out-dir output/qem
```

Then in R:

```r
setwd("output/qem")
source("run_quantbayes.R")
res$variants
res$global
plots$p_matrix
plots$p_theta_ci
plots$p_overlay
```

 The script also calls `print(plots$p_overlay)` in interactive sessions and includes commented examples to save `res$variants` and `res$global` as TSV if requested. It does not create directories or save plots or tables. It can also be run with `Rscript run_quantbayes.R` to print the result summaries; plots are intended for an interactive R session. The `quantbayes` R package must already be installed. No R dependency is needed for ACMG Validator itself.

Alternatively, use the checked-in synthetic example directly from the repository root:

```r
res <- quantbayes::quant_es_from_binary_table(
  "examples/quantbayes.tsv", variant_col = "variant_id"
)
res$variants
res$global
```

## Cohort demonstration

`examples/cohort.json` and `examples/cohort.tsv` contain the same eight synthetic variants, with deliberately different numbers of verified qualifying checks and explicit invalidating outcomes. The example exercises a full JSON → TSV → QEM workflow and includes rules that remain unassessed. None of the simulated references represents independently checked biological evidence.

QuantBayes returns `k` (number of QEM ones), `m` (number of declared rules), posterior mean theta, credible intervals and percentile ranks. It **does not** return pathogenicity probability. `k` also does not represent the total number of checks attempted: see `raw_outcomes.tsv` to distinguish confirmed invalidations (`TRUE`) from non-evaluable rules (`NA`).

This fixed 28-rule matrix is a **demonstration of documentary evidence sufficiency**. Different variant mechanisms may have different applicable criteria, so comparing its evidence sufficiency across heterogeneous cohorts requires careful justification of the rule set and interpretation context. The QEM rules are not assumed independent. The toolkit does not independently validate clinical evidence.

Reference: [QuantBayes on CRAN](https://cran.r-project.org/web/packages/quantbayes/index.html), [macOS and Linux tools](https://switzerlandomics.ch/technologies/quantbayes/) and the [SGA-QEM standard](https://www.swissgenomicsassociation.ch/pages/sga_qem/) (see `R/quant_es_file_helpers.R` for the `variant_col` API).
