# Relational database integration

The toolkit outputs portable records. It does not open a connection to a hospital EHR or LIMS and does not create patient accounts. If a laboratory wants to import records into its own SQL database, a two-table model is usually sufficient for a first prototype.

```sql
CREATE TABLE evidence_review (
    item_id TEXT PRIMARY KEY,
    gene TEXT NOT NULL,
    transcript TEXT,
    hgvs_c TEXT,
    genome_build TEXT,
    disease TEXT,
    classification TEXT,
    guideline_basis TEXT,
    reviewer TEXT,
    review_date TEXT,
    signoff INTEGER NOT NULL CHECK (signoff IN (0, 1)),
    source_record_json TEXT NOT NULL
);

CREATE TABLE criterion_review (
    item_id TEXT NOT NULL,
    criterion_code TEXT NOT NULL,
    review_status TEXT NOT NULL,
    evidence_status TEXT NOT NULL,
    applied_strength TEXT NOT NULL,
    source_ref TEXT,
    verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
    qem_rule_id TEXT NOT NULL,
    qem_raw_outcome TEXT NOT NULL CHECK (qem_raw_outcome IN ('TRUE', 'FALSE', 'NA')),
    qem_source_ref TEXT,
    qem_verified INTEGER NOT NULL CHECK (qem_verified IN (0, 1)),
    criterion_record_json TEXT NOT NULL,
    PRIMARY KEY (item_id, criterion_code),
    FOREIGN KEY (item_id) REFERENCES evidence_review(item_id)
);
```

The schema is **illustrative SQL**, not an EHR standard. For ingestion, validate the JSON/TSV records first, then perform inserts within a database transaction. Retain the authoritative JSON, its schema and rule-set versions, and source evidence references. Patient and case linkage, access control, encryption, validation, audit events and identifiers are the receiving institution's responsibility.

Do not infer patient identity from a variant's HGVS coordinate. A variant can be observed in many patients and interpreted in different disease contexts. For future FHIR interoperability, map to the relevant published HL7 Genomics Reporting profiles and validate against the chosen implementation-guide release; a generic JSON document is not automatically a FHIR resource.
