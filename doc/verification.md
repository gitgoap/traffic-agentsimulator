# Verification evidence

These checks apply to the current cloud workspace and local production build.
They do not establish that a public deployment or a live Supabase integration
has been tested. No deployment has been performed.

## Checks

- `npm run check`: formatting, TypeScript, engine/API/database tests, and an
  optimized Next.js production build. All 35 engine/API/database tests passed.
- `npm run test:e2e`: seven workflows each in desktop Chromium and mobile
  Chromium, against the production server. All 14 browser checks passed after
  integration fixes, including the final application source.
- An automated axe accessibility scan is part of both browser configurations.
  It checks WCAG A/AA rules on the initial workspace; this does not replace a
  full accessibility audit of every editor state and assistive technology.
- `npm audit --omit=dev --audit-level=high`: no reported production dependency
  vulnerabilities at the time checked.

Installation from the committed lockfile was also exercised with `npm ci`.

## Engine evidence

Tests cover free acceleration, following/braking, seeded replay, equal-tick
batching, interventions, lane and connector spacing, junction conflicts, signal
clearance, blocked arrivals, merges, population conservation, route legality,
the final-step departure boundary, demand-row reordering, multiple seeds, and a
smaller-timestep comparison. High-density cases exercise the 300-active-vehicle
limit while retaining excess demand outside.

The engine tests inspect vehicle states, not only visual movement. The browser
tests verify controls, worker communication, road/node editing, rejected input,
local saves, import/export, sharing/update/delete ownership, comparison exports,
keyboard field notes, and mobile horizontal overflow.

## Backend evidence

The API tests use temporary local storage and exercise creation, sanitized public
reads, edit-key checks, conditional revisions, deletion, size/type/origin checks,
and creation quotas. Local storage is checked across repository instances.

The Supabase adapter is tested with mocked HTTP responses. The SQL migration is
applied twice to PGlite (embedded PostgreSQL), including its quota function,
row-level security, and anonymous permission denial. A live Supabase project
must still be checked after deployment credentials are configured.

## Interpreting performance and model results

`npm run experiment` records headless compute time and can write a full JSON
result. Those timings measure this machine's engine execution, not an arbitrary
visitor's browser frame rate. The UI cap is 300 active vehicles, 40 nodes, 60
directed roads, and at most eight incident directed roads per junction. Imported
scenario data is bounded to 100 KB after validation. These are demo limits.

Metrics expose a conservative numerical `safetyBounds` count. A passing spacing
test does not mean that no numerical bounds were applied or that behavior is a
validated real-world prediction. Compare timestep settings and completed,
unfinished, and external-queue counts before interpreting differences.

The tested flyover and crossroads are illustrative networks, not calibrated
infrastructure designs. Their results are not evidence that a real flyover will
improve a specific city junction. See the concepts and implementation notes for
fixed-lane assumptions, conservative junction reservations, and limitations.

## Checks still requiring deployment

Hosted worker delivery, the host's function/runtime configuration, live Supabase
credentials and persistence across redeploys, and provider-specific quotas all
remain to be verified. GitHub Actions is configured; a local passing run does
not establish the status of a future hosted CI run.
