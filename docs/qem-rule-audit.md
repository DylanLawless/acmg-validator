# QEM rule-by-rule polarity audit

SGA-QEM-1.0 requires each raw `TRUE` to detect a contradiction, absence, or weakening signal, each raw `FALSE` to reflect a verified non-detection of that signal with qualifying evidence available, and `NA` when the rule cannot be assessed. This registry **does not independently test these biological hypotheses**: the exporter requires an explicit TRUE/FALSE/NA answer to each negative rule, with documented verification for conclusive outcomes.

The ACMG criterion names below describe *which evidence* is evaluated. The **QEM question is always negatively oriented**. PP5/BP6 are special deprecated assertion-only checks, unable to contribute a positive (`1`) QEM entry.

| ACMG criterion | Negative QEM question (TRUE detects deficiency) |
|---|---|
| `PVS1` | Is the claimed null-variant evidence absent, contradicted by the relevant transcript or loss-of-function mechanism, or inadequately substantiated?  |
| `PS1` | Is evidence for the same amino-acid change and the established pathogenic comparator absent, contradicted, or inadequately substantiated?  |
| `PS2` | Is verified de novo evidence with confirmed parental relationships absent, contradicted, or inadequately substantiated?  |
| `PS3` | Is qualifying functional evidence of a damaging effect absent, conflicting, or insufficiently substantiated?  |
| `PS4` | Is qualifying evidence of enrichment in affected individuals versus controls absent, conflicting, or insufficiently substantiated?  |
| `PM1` | Is qualifying mutational hot-spot or functional-domain evidence, including the benign-variation context, absent, contradicted, or insufficient?  |
| `PM2` | Is adequately covered, disease-appropriate population-frequency evidence absent, contradictory, or insufficiently substantiated?  |
| `PM3` | Is qualifying evidence that the variant is in trans with a pathogenic allele absent, unconfirmed, or contradicted?  |
| `PM4` | Is qualifying evidence of a protein-length change outside a repeat region absent, contradicted, or insufficiently substantiated?  |
| `PM5` | Is evidence for a different established pathogenic missense change at the same residue absent, contradicted, or insufficiently substantiated?  |
| `PM6` | Is evidence supporting an assumed de novo occurrence, without confirmed parental relationships, absent, contradicted, or insufficiently substantiated?  |
| `PP1` | Is qualifying family co-segregation evidence absent, contradicted, or insufficiently substantiated?  |
| `PP2` | Is evidence for the gene-level missense-disease mechanism and low benign missense rate absent, contradicted, or insufficient?  |
| `PP3` | Is appropriately calibrated computational evidence of a damaging effect absent, conflicting, or insufficiently substantiated?  |
| `PP4` | Is evidence of a highly specific phenotype or family history absent, contradicted, or insufficiently documented?  |
| `PP5` | Is the primary evidence behind a third-party pathogenicity assertion unavailable or insufficient for independent verification? **Deprecated; cannot yield 1.** |
| `BA1` | Is well-covered population-frequency evidence exceeding a disease-appropriate stand-alone benign threshold absent, contradicted, or insufficient?  |
| `BS1` | Is evidence that population frequency exceeds the disease-appropriate maximum credible frequency absent, contradicted, or insufficient?  |
| `BS2` | Is evidence of an unaffected adult despite expected early, fully penetrant disease absent, contradicted, or insufficient?  |
| `BS3` | Is qualifying functional evidence of no damaging effect absent, conflicting, or insufficiently substantiated?  |
| `BS4` | Is qualifying evidence of non-segregation with disease absent, contradicted, or insufficiently substantiated?  |
| `BP1` | Is evidence that the variant is missense in a gene whose established disease mechanism is restricted to truncating variants absent or insufficient?  |
| `BP2` | Is qualifying phase evidence (in cis with a pathogenic allele, or in trans in a fully penetrant dominant disorder) absent, contradicted, or insufficient?  |
| `BP3` | Is evidence of an in-frame indel in a repetitive region without known functional impact absent, contradicted, or insufficient?  |
| `BP4` | Is appropriately calibrated computational evidence of no damaging effect absent, conflicting, or insufficiently substantiated?  |
| `BP5` | Is evidence for an alternative molecular explanation of the observed disease absent, contradicted, or insufficiently substantiated?  |
| `BP6` | Is the primary evidence behind a third-party benignity assertion unavailable or insufficient for independent verification? **Deprecated; cannot yield 1.** |
| `BP7` | Is evidence of a synonymous variant without predicted splice impact or significant conservation absent, contradicted, or insufficiently substantiated?  |

## Outcomes

Every row uses these review gates; there is no separate, hidden rule-specific scoring algorithm.

- `FALSE → 1` requires an explicitly evaluated negative rule with accepted/present ACMG evidence, `qem_verified`, `qem_source_ref` and a named signed-off review. For PP5/BP6, this is not possible because the primary evidence is unavailable by the criterion definition.
- `TRUE → 0` requires a confirmed, rejected invalidating condition with `qem_verified`, `qem_source_ref` and signed-off review. PP5/BP6 also produce `TRUE` when an accepted third-party claim explicitly establishes unavailability of the underlying primary evidence.
- `NA → 0` applies when a check is unassessed, pending, inapplicable, unverified or insufficiently documented.

For benign criteria, an accepted observed benign finding (for example, BS4 non-segregation) contributes `1` to the *availability* matrix when it is verified. It is not a positive pathogenicity signal.
