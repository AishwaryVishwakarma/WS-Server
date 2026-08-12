# ADR-0002: Durable admin analytics

**Status:** Accepted
**Date:** 2026-08-12
**Deciders:** Whispering Shadows maintainers

## Context

The first admin overview reads exact aggregate totals from operational tables.
Those tables preserve creation times for users, stories, comments, likes, and
bookmarks, but story views are only a cumulative counter and moderation status
changes overwrite their previous value. Multiple API replicas also cannot
share the endpoint's in-memory cache.

Analytics must remain inexpensive, admin-only, exportable, and honest about
which values are all-time, period-based, current snapshots, or forward-only.

## Decision

- Keep operational tables as the source for totals and events whose timestamps
  already exist.
- Add an append-only `analytics_event` table for recorded views and moderation
  transitions. Historical values for these metrics begin at migration time.
- Keep PostgreSQL reporting SQL behind small typed repository methods. Use
  TypeORM QueryBuilder for ordinary rankings and parameterized SQL for date
  series, unions, cohorts, and percentiles.
- Cache complete response envelopes in Redis for 60 seconds. Redis failure
  degrades to uncached database reads; it never makes the admin page fail.
- Use the same query contract for JSON and CSV so exports cannot disagree with
  the visible dashboard.
- Support preset and bounded custom UTC ranges. All returned metric metadata
  states its semantic scope.

## Options Considered

### Operational tables only

| Dimension | Assessment |
| --- | --- |
| Complexity | Low |
| Cost | Low |
| Historical accuracy | Insufficient for views and moderation |

### Duplicate every domain event

| Dimension | Assessment |
| --- | --- |
| Complexity | High |
| Cost | Higher writes and storage |
| Historical accuracy | High but unnecessarily duplicative |

### Hybrid event capture (selected)

| Dimension | Assessment |
| --- | --- |
| Complexity | Medium |
| Cost | Low incremental writes |
| Historical accuracy | Exact after deployment for missing facts |

## Consequences

- View and moderation history is forward-only; the UI must label this.
- Existing period metrics remain queryable without event duplication.
- Analytics writes must be best-effort and must not block reader/moderator
  actions if event capture is temporarily unavailable.
- Large installations may later roll events into daily aggregate tables.

## Revisit When

- Raw event queries exceed the dashboard latency budget.
- Retention needs identity-safe warehouse joins beyond 365 days.
- Product analytics requires funnels spanning anonymous browser sessions.
