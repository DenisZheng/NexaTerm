# Implementation
1. Add a bounded UTF-8 writer and exclusive file factory.
2. Add failure-injection and actual filesystem unit tests.
3. Review and run available checks; Rust compilation/tests require CI because this container has no rustc/cargo.
4. Update backend contract and existing Draft PR. Integration and manual acceptance remain follow-up, not completed claims.

## Evidence
- Added exclusive File factory and bounded UTF-8 sink; 13 Rust tests (12 cross-platform plus Unix symlink test).
- Local line-budget, git diff --check and Trellis context validation passed.
- rustc/cargo unavailable locally; Rust tests are NOT claimed passed. CI pending new commit. No frontend changes, so prior frontend results are baseline evidence only.
- Actual capture integration, UI consent, asynchronous queue and disconnect ownership are explicitly pending next cut.
