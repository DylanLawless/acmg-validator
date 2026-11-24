# Changelog

## 0.1.9

- Prepared the standalone public repository with a concise TSV input format, without redundant per-row QEM version or migration-flag columns.
- Retained the exact versioned QEM catalogue in canonical JSON and generated QEM bundles; canonical JSON rejects incompatible or missing catalogue identifiers.
- Removed old QEM provenance migration behaviour. ACMG and QEM attestations remain separate and must be recorded explicitly.
- Kept validation and export sections visible before import, with unavailable exports disabled and clear empty-state messages.
- Preserved all 28 ACMG criteria, negative QEM questions, binary mappings and QuantBayes R integration.
