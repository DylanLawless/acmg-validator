# Contributing

Please open an issue before changing criterion semantics or the canonical evidence schema. Include a synthetic reproduction, the applicable rule specification and version, and an explanation of how existing JSON/TSV records would be affected. Never post patient data, unpublished clinical evidence or credentials.

Run `npm run check` before submitting a pull request. Preserve historical schema compatibility where possible. Document any breaking migration separately. Keep classification logic, evidence provenance, QEM mapping, file formats and UI presentation as independent concerns.
