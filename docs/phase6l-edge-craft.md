# Phase 6l — Edge Craft

## Goal

The happy path already works. This phase removes the tiny moments that make a polished CLI feel unfinished.

## Stable public error references

Known user-facing failures now have semantic references instead of falling through to `ERR-UNEXPECTED`:

```text
ERR-PATCH-NOT-FOUND
ERR-VERIFICATION-STALE
ERR-PROMOTION-BLOCKED
ERR-USAGE
ERR-COMMAND-NOT-FOUND
```

These references are deliberately public and grep-friendly. Internal exception classes can evolve without forcing issue reports, screenshots, or runbooks to depend on a stack trace.

## Typo-aware recovery

A typo should not send a user to generic diagnostics.

```text
behavectl verfy bp_...
```

now stops safely and points to:

```text
behavectl verify
behavectl help
```

The suggestion is conservative: only near matches within a small edit-distance budget are offered.

## First-minute contract

`npm run ux:check` now also asserts that:

1. a mistyped command gets a useful local recovery path;
2. known failures expose stable public error references;
3. generic `doctor` guidance is not shown when a more precise recovery exists.

## Release-language consistency

The README now describes `v0.1.0-alpha.1` as an **unpublished alpha candidate**, matching the actual release state: the package is staged, but public release remains blocked on retained authenticated RC evidence.

## Principle

> Precision is part of the interface. A user should never have to translate an internal failure into the next correct action.
