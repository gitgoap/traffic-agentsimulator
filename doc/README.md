# Project direction

Status: the demo application is implemented. Deployment remains a separate handoff.

Build a small, understandable traffic laboratory: users choose or edit a road
network, specify travel demand, run independent vehicle agents, and compare
traffic outcomes. Implement our own engine using published models and cite them.

Read these short notes in order:

1. [Research and references](research.md): existing projects and useful ideas.
2. [Architecture](architecture.md): proposed stack, modules, and deployment.
3. [Simulation concepts](concepts.md): agents, time, roads, and measurements.
4. [Roadmap](roadmap.md): small deliverables and checks at each stage.

Start with the ring-road preset: play, pause, brake a car, and inspect the speed
chart. Then explore the crossroads and flyover presets. The editor, paired
experiments, local saving, sharing API, and database adapter are also implemented.
See [implementation decisions](implementation.md), [verification](verification.md),
and [deployment handoff](deployment.md) for the current behavior and limits.

The first model assumes cars following lanes, with an eventual left-hand-traffic
preset. It will not initially represent the lane-free, mixed motorcycle/car/bus
traffic common in Indian cities. Its results illustrate mechanisms; interpreting
them as Bengaluru forecasts would require observed data and calibration.

For future changes, update the relevant concept note and record substantial
design changes in architecture.md. Explain the engineering ideas, rather than
documenting every function. The research and original roadmap preserve the
project's rationale; implementation.md records adjustments made during development.
