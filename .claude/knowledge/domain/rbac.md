---
title: RBAC Matrix
owner: domain-analyst
---

# Role-based access control

Five roles. The live capability matrix is rendered in
[src/pages/Admin.tsx:231-242](src/pages/Admin.tsx). This file mirrors it.

| Capability | controller | pu_lead | finance | hr | viewer |
| --- | :---: | :---: | :---: | :---: | :---: |
| View cockpit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit forecast (own PU) | ✓ | ✓ | — | — | — |
| Edit forecast (any PU) | ✓ | — | — | — | — |
| Approve cycle | ✓ | — | — | — | — |
| Run ingestion | ✓ | — | — | — | — |
| Edit HR mappings | ✓ | — | — | — | — |
| Import HR data | ✓ | — | — | ✓ | — |
| Override staleness on HR import | ✓ | — | — | — | — |
| View employee PII | ✓ | ◐ | ✓ | ✓ | — |
| View costs | ✓ | — | ✓ | — | — |
| Create scenario | ✓ | ✓ | ✓ | — | — |
| Promote scenario | ✓ | — | — | — | — |
| Generate review pack | ✓ | — | ✓ | — | — |

`◐` = partial (`pu_lead` sees PII only for employees in their PU scope).

## When adding a new capability

1. Add the row to `RBAC_ROWS` in `src/pages/Admin.tsx`.
2. Gate the action at the call site (see `canEditCycle`, `canLock` style
   checks in `Admin.tsx:38-39`).
3. Mirror the row here.
4. Add a test in `src/store.rbac.test.ts` that the wrong role is rejected.

## Cycle-transition permissions

| Transition | Allowed roles |
| --- | --- |
| `openCycle` | `controller`, `pu_lead` |
| `startEditing` | `controller`, `pu_lead` |
| `startReconciling` | `controller`, `pu_lead` |
| `lockCycle` | `controller` only |
| `archiveCycle` | `controller` only |
