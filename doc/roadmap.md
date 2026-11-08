# Incremental development roadmap

The seven deliverables below are implemented in the demo. This table preserves
the original development plan and effort estimates; it is not a claim that these
many days were spent. Current checks and limitations are in
[verification](verification.md) and [implementation](implementation.md).
Deployment integration still requires the owner's hosting/database configuration.

Each milestone should produce something runnable and explainable. Add the
associated brief concept note, demonstrate it, and run the relevant checks before
moving on. The first deploy should happen early, not after every feature exists.

| Milestone                         | Deliverable                                                                                                                                   | Evidence before continuing                                                                                                                                           | Focused effort estimate |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1. Minimal moving traffic         | TypeScript engine; single-lane ring; Canvas cars; play/pause/reset; count and speed controls                                                  | One car approaches desired speed; following gaps remain valid; population conserved; seeded reset repeats                                                            | 2–3 days                |
| 2. Responsive browser demo        | Web Worker; fixed timestep; single step and playback speed; speed chart; deploy minimal app                                                   | Pause freezes simulation time; playback speed preserves state after equal tick counts; worker reset ignores stale messages; deployed smoke test                      | 1–2 days                |
| 3. One signalized junction        | Open approaches, departure demand, stop lines, physical connectors, protected phases, entry queues                                            | Red stopping; clearance; no conflicting occupancy; blocked exits; vehicle conservation; completed and unfinished trip metrics                                        | 3–4 days                |
| 4. Small road network and flyover | Directed routing; explicit lane counts/widths; fixed lane assignment; legal transfers and ramp merges; junction versus flyover presets        | Reachable legal routes; same-level conflicts; separate-level crossings independent; safe merges; downstream bottleneck test                                          | 3–5 days                |
| 5. Scenario editing               | Add/move nodes and roads; edit lanes/signals/demand; selection inspector; pause/reset for geometry changes; local save and JSON import/export | Reject bad references, invalid dimensions, impossible routes, and conflicting signal phases; import/export round trip; editor interaction tests                      | 3–5 days                |
| 6. Full-stack sharing             | Next.js APIs; Supabase migrations and ownership; saved scenario revisions and run summaries; public read-only links                           | Save/load works across sessions; unauthorized edits fail; malformed/oversized requests rejected; cloud outage handled                                                | 2–4 days                |
| 7. Comparison and presentation    | Baseline copy; controlled A/B runs; metrics and charts; CSV; polished layouts; experiment write-up                                            | Same demand schedule; multiple seeds; entry wait and unfinished trips reported; timestep sensitivity; representative browser performance and final deployment checks | 3–4 days                |

Estimate: 17–27 focused development days, or roughly 4–6 full-time weeks including
some learning and integration. If working part-time or learning the web stack,
allow 6–10 weeks or more. Dates are not commitments. Re-estimate after the first
engine and worker milestones. A deadline-driven application can demonstrate
milestones 1–4 with presets before shipping the editor and cloud sharing.

## First implementation slice

Begin with a few cars on a ring. Keep the engine independent of React. Implement
deterministic stepping and car-following, test simple following cases, then draw
the state and wire up controls. After it works, deliberately brake a selected
vehicle and observe the response at different densities. Move calculation into
the worker and deploy this small example before expanding the network model.

This avoids trying to debug agent rules, junction conflicts, editing, networking,
and deployment all at the same time.

## Test strategy

- Engine tests: acceleration/following, stopping mid-step, insertion, routing,
  junction conflicts, merges, population conservation, deterministic scenarios.
- Scenario tests: single vehicle, platoon, ring perturbation, red-light queue,
  blocked exit, merge bottleneck, and elevated crossing. Detect overlaps instead
  of resolving them by deleting vehicles.
- Browser tests: controls, worker communication, local save/import, editor
  interactions, sharing, and useful errors. A running animation alone does not
  establish a correct simulation.
- Experiment checks: compare timesteps, verify metrics against simple known
  cases, and keep requested/completed/unfinished counts visible.
- Performance checks: measure update cost and UI responsiveness on representative
  devices and networks, then choose the demo's vehicle/network caps.

Use small reproducible cases rather than asserting a whole city's exact output.
Keep genuine repository defects separate from deployment/configuration failures.

## Research story for the application

Question: under the same departure demand, how do a signal-timing change and a
grade-separated crossing affect travel time, entry queues, and network throughput?

Build a baseline network, change one factor, reuse demand/driver schedules, and
repeat across seeds. Report variation, incomplete trips, and model assumptions.
Do not assume adding lanes or a flyover must improve every measure. Include a
short limitations section about lane-based homogeneous traffic and missing local
calibration. This makes the demo an understandable experiment as well as a UI.

## Defer until the core is reliable

Discretionary MOBIL lane changes, adaptive or learned signals, mixed motorcycles
and buses, free-form curved geometry, OpenStreetMap imports, live traffic feeds,
3D, emissions estimates, collaborative editing, and server-side batch computation.
Choose later extensions based on the research question and measured bottlenecks.
