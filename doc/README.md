# Project direction

Status: proposal, 7 November 2026. No application implementation has started.

Build a small, understandable traffic laboratory: users choose or edit a road
network, specify travel demand, run independent vehicle agents, and compare
traffic outcomes. Implement our own engine using published models and cite them.

Read these short notes in order:

1. [Research and references](research.md): existing projects and useful ideas.
2. [Architecture](architecture.md): proposed stack, modules, and deployment.
3. [Simulation concepts](concepts.md): agents, time, roads, and measurements.
4. [Roadmap](roadmap.md): small deliverables and checks at each stage.

Recommended first deliverable: a single-lane ring road with a few cars,
play/pause/reset, a demand/density control, and a speed chart. It proves that
vehicle behavior produces traffic before we build an editor or database.

The first model assumes cars following lanes, with an eventual left-hand-traffic
preset. It will not initially represent the lane-free, mixed motorcycle/car/bus
traffic common in Indian cities. Its results illustrate mechanisms; interpreting
them as Bengaluru forecasts would require observed data and calibration.

During implementation, update the relevant concept note and record substantial
design changes in architecture.md. Explain the engineering ideas, rather than
documenting every function. These choices are proposed and may change after the
first working simulation and performance measurements.
