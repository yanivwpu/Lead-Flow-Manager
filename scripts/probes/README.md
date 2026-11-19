# Read-only Railway queue inventory

Run through the existing Windows package only against the pinned production service. This is diagnostic code, not an application startup hook or a migration. It does not change Redis data, jobs, Railway settings or the deployed application. No BullMQ/app modules are imported. Authentication, optional SELECT/CLIENT metadata, and two MULTI/EXEC transactions containing EXISTS, LLEN, ZCARD and HGET are the only client operations. The probe has no retry loop, no writes, no Lua, no key scan and no job-body reads.

## Version 2 correction

Version 1's `catch` reduced URL parsing, module loading, constructor, socket, authentication/TLS and thrown EXEC errors to `inventory_failed`. The supplied #332 commit and service identity passed that initial guard, but the generic result contains insufficient evidence to identify the actual Redis failure. Connected Railway OAuth confirms REDIS_URL exists but does not expose its value; no configuration change has been inferred or applied.

The app's existing `parseRedisUrl` accepts an assignment prefix. Version 1 passed the raw variable to `new URL()` and rejected otherwise usable `REDIS_URL=redis://...` values. Version 2 normalizes whitespace, matching quotes, an optional REDIS_URL assignment, and the URI portion of a recognized redis-cli -u/--uri wrapper without executing a command. URI query options remain available to ioredis. Unsupported protocols/fragments are rejected. TLS is based on the parsed hostname/protocol; certificate verification remains enabled. Common ioredis CJS/default export shapes are supported.

The result now includes `probeVersion: 2`, a fixed `stage`, a fixed `reason` and, where recognized, an allowlisted error code. Stages identify configuration parsing, module loading/client creation, connection or count reads. Reasons distinguish missing modules, DNS/refusal/timeout, authentication, TLS, ACL permissions, quota/rate limits, unsupported/invalid commands, wrong key types and invalid responses. Per-command failures include only the fixed command name and known queue-field label, never command arguments. Original connection error categories survive a later generic connection-close exception. EXECABORT previous errors and ioredis's one-element error tuples are handled explicitly. Invalid responses never become invented zero counts.

Raw error text, stack traces, URLs, hosts, usernames/passwords, tokens, arbitrary error properties and sensitive environment variables are never emitted by the probe. Missing identity fails before module loading or connection. Cleanup failures cannot dump secrets or suppress the JSON result. There is a 45-second overall bound plus ten-second connection/command timeouts. Successful probes still take two snapshots ten seconds apart.

## Verification

`node --import tsx --test tests/queue-inventory-safety.test.ts tests/queue-inventory-transport.test.ts`

The tests exercise fixed-category redaction and strict identity guards, then run the actual installed ioredis client in child processes against loopback RESP/TLS fixtures. They verify nonzero active/waiting/delayed/failed values, successful wrapped configuration, missing modules, refused connections, authentication, wrong key types, aborted/unsupported transactions, TLS certificate rejection and read timeouts. These fixtures implement no data-writing commands and are not Redis databases. No production connection is made. The Windows payload must exactly match the verified standalone script; existing CLI pins and noninteractive SSH-key safeguards are retained.

Build with `python3 scripts/build-queue-inventory-package.py`. This only creates the ZIP and does not execute it. Download the final commit's **WhachatCRM-Queue-Inventory-Windows** CI artifact, Extract All, and double-click Run-Probe.cmd. Return only its single JSON result. READ_COMPLETE is not release/drain approval; an actual production result is still required to establish production counts.
