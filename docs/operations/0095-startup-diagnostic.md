# 0095 startup failure: read-only production diagnostic

The fact that the previously successful PR #11 build now fails at 0095 confirms
that the trigger is the current database schema/data, not the later
cannibalization-threshold code. The expected evolution is: 0095 originally
created a unique opportunity-cluster index; 0099 removed it to retain historical
opportunities; normal planner runs then created more than one historical row per
cluster; and a restart replayed 0095 before 0099 and tried to restore the obsolete
uniqueness rule.

Before any further redeploy or database modification, an operator can run
`scripts/diagnose-0095-read-only.sql`. It explicitly starts a read-only
transaction and returns only aggregate counts and index-presence flags. It checks
every data-dependent unique index created by 0095, with special checks for the
retired and final opportunity indexes. It does not select identifiers, URLs,
queries, content, credentials, or database error details.

An `opportunity-history-duplicates` count greater than zero together with
`retired-opportunity-unique-index-present = 0` confirms the expected replay
failure: the old 0095 `CREATE UNIQUE INDEX` cannot succeed against legitimate
post-0099 history. Any nonzero count in another duplicate check identifies an
additional 0095 unique-index hazard that must be handled separately rather than
deleting or rewriting production data.
