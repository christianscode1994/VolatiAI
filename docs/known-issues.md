
## signLatest orphaned "pypi-daily-requests" property — WONTFIX

signLatest() in sector-slow returns a signature object that includes an
extra "pypi-daily-requests" property (dead code from an early refactor).

Impact: cosmetic only. /latest returns a valid signature. Nothing in the
codebase verifies /latest signatures — the only verify() calls are in
node_modules (unrelated noble-curves library).

Fix would require 100-line inspection + brace-tracing + signature comparison
for zero functional benefit. Deferred indefinitely.
