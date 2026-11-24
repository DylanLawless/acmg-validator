import { normalise } from './core.js';
import { toQEM, validateQEM } from './qem.js';

/** R runner bundled alongside the QuantBayes-compatible binary evidence matrix. */
export const QUANTBAYES_RUNNER = String.raw`# Run from the extracted QEM bundle directory in R:
# source("run_quantbayes.R")
library(quantbayes)

input <- read.delim("quantbayes.tsv", check.names = FALSE)
stopifnot(identical(names(input)[1], "variant_id"))
x <- as.matrix(input[-1])
rownames(x) <- input$variant_id
stopifnot(is.numeric(x), nrow(x) > 0, ncol(x) > 0,
          !anyNA(x), all(x %in% c(0, 1)),
          all(nzchar(rownames(x))), !anyDuplicated(rownames(x)))

res <- quant_es_core(x)
plots <- quant_es_plots(res, x)

print(res$variants)
print(res$global)
if (interactive()) print(plots$p_overlay)

# Optional TSV exports (uncomment if wanted):
# write.table(res$variants, "variants.tsv", sep = "\t", quote = FALSE, row.names = FALSE)
# write.table(data.frame(metric = names(res$global),
#                        value = unlist(res$global, use.names = FALSE)),
#             "global.tsv", sep = "\t", quote = FALSE, row.names = FALSE)
# In R, you can also view plots$p_matrix or plots$p_theta_ci.
`;

export const QEM_BUNDLE_README = `ACMG Validator QEM bundle

1. quantbayes.tsv       QuantBayes input with a variant_id column and binary 0/1 rule values.
2. run_quantbayes.R     Minimal R example for analysis and interactive plotting.
3. matrix.tsv           Original SGA-QEM matrix, using item_id instead of variant_id.
4. raw_outcomes.tsv     Preserved TRUE/FALSE/NA before lossy 0/1 conversion.
5. rules.json           Versioned, negatively oriented rule definitions and provenance.
6. evidence.json        Source evidence record, including attested reviews and source references.

In an R session, from the extracted bundle directory:
  source("run_quantbayes.R")
  plots$p_matrix
  plots$p_theta_ci
  plots$p_overlay

Alternatively, use the direct QuantBayes file helper:
  res <- quantbayes::quant_es_from_binary_table("quantbayes.tsv", variant_col = "variant_id")
  res$variants
  res$global

The example creates res and plots in memory. It does not write reports,
create directories or save figures. Install quantbayes separately.
No patient data are transmitted by this bundle.

SGA-QEM-1.0: a raw FALSE maps to 1; TRUE and NA both map to 0.
Rules are negatively oriented. QuantBayes estimates qualifying evidence
sufficiency across the declared 28-rule denominator, not review completeness
or pathogenicity. Check applicability and missing outcomes separately.
A documented reviewer attestation does not independently verify
biological observations. All example data are synthetic.

QuantBayes: https://cran.r-project.org/web/packages/quantbayes/index.html
Switzerland Omics tools: https://switzerlandomics.ch/technologies/quantbayes/
SGA-QEM standard: https://www.swissgenomicsassociation.ch/pages/sga_qem/
`;

/** The same named files for browser ZIP downloads and CLI directory exports. */
export function qemBundleFiles(input) {
  const data = normalise(input);
  const qem = toQEM(data);
  validateQEM(qem.matrix, qem.raw);
  return [
    { name: 'matrix.tsv', content: qem.matrix },
    { name: 'quantbayes.tsv', content: qem.quantbayes },
    { name: 'raw_outcomes.tsv', content: qem.raw },
    { name: 'rules.json', content: JSON.stringify(qem.metadata, null, 2) + '\n' },
    { name: 'evidence.json', content: JSON.stringify(data, null, 2) + '\n' },
    { name: 'run_quantbayes.R', content: QUANTBAYES_RUNNER },
    { name: 'README.txt', content: QEM_BUNDLE_README }
  ];
}
