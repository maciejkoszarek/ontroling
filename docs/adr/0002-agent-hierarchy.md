# ADR-0002 — Claude Code agent hierarchy

- Status: Accepted
- Date: 2026-04-22
- Deciders: Orchestrator (Claude Opus 4.7) + user

## Context

The goal is autonomous ("vibe-coding") development: the user describes a
change in plain English; Claude plans, writes code, tests, verifies in the
browser, and commits — without manual babysitting.

A single generic agent cannot do this well:

- Domain knowledge is heavy (28 forecast metrics, 10 PUs, RBAC matrix,
  virtual roll-ups, cycle state machine). Mixing domain context with code
  context pollutes the context window.
- Verification tools (`preview_*`, console, network) belong to a different
  mental model than source code tools.
- Some checks are about *data* correctness (invariants like `HC_END =
  HC_BEGIN + J − L`), not *code* correctness; they need their own agent.

## Decision

Adopt a 9-agent hierarchy with one orchestrator (main chat) delegating
through the `Agent` tool:

| Agent | Responsibility (one-liner) |
| --- | --- |
| `architect` | ADRs + structural decisions; never edits code |
| `domain-analyst` | Answers "what is X in this repo?" from `.claude/knowledge/domain/*` |
| `feature-developer` | End-to-end feature implementation in `src/` |
| `test-engineer` | Vitest + RTL tests; later Playwright |
| `code-reviewer` | Pre-commit diff review; read-only |
| `qa-verifier` | Browser verification via `preview_*` |
| `data-integrity` | Validates domain invariants on the data |
| `refactor-agent` | On-demand cleanup; never in default loop |
| `release-manager` | Version/tag/CHANGELOG on explicit "release" |

**Every agent uses Opus 4.7.** Uniform reasoning depth outweighs the token
savings of mixing in Sonnet for "lighter" roles.

## Consequences

Positive
- Parallelism: multiple subagents can operate in one turn.
- Context protection: the orchestrator stays lean because specialists read
  deeply without returning their raw reads.
- Clear responsibility boundaries make failures diagnosable ("`data-integrity`
  rejected the change" is actionable).

Negative / trade-offs
- Higher token cost than a single generic agent.
- More files to maintain (`.claude/agents/*.md`).
- Requires discipline — the orchestrator must actually delegate, not try to
  do everything inline.

Rejected alternatives
- **Single generic agent** — context window pollution, inconsistent
  specialization.
- **Two-tier split (dev / reviewer)** — too coarse; hides the domain vs
  architecture distinction that matters in this codebase.
