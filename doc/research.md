# Research and references

Reviewed 7 November 2026 using upstream GitHub READMEs, documentation source, and
selected implementation/build files. This was source research, not a benchmark
or hands-on test of the demos. Branch links may change over time.

## 1. Eclipse SUMO — modeling reference

- [Repository](https://github.com/eclipse-sumo/sumo)
- [Documentation](https://sumo.dlr.de/docs/)
- [Intersection model source documentation](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/Simulation/Intersections.md)
- [Python control interface documentation](https://github.com/eclipse-sumo/sumo/blob/main/docs/web/docs/TraCI/Interfacing_TraCI_from_Python.md)

SUMO is a microscopic simulator: it tracks individual vehicles on large networks.
Its core is C++, with Python tooling and the TraCI interface for advancing time,
reading traffic state, and changing signals. Its ecosystem includes a network
editor, routing tools, and desktop visualization.

The intersection documentation is particularly useful: vehicles follow explicit
paths inside junctions, obey movement priorities, and account for blocked exits.
Junctions are more than points where vehicles disappear and reappear.

**Takeaway:** separate the network, vehicle behavior, control, and measurement.
Model lane-to-lane turns and downstream space. Later, SUMO could serve as an
external comparison for selected cases; identical results are not expected from
different models. We will implement our engine rather than embed SUMO.

## 2. traffic-simulation.de — closest browser interaction reference

- [Interactive application](https://traffic-simulation.de/)
- [Repository and implementation guide](https://github.com/movsim/traffic-simulation-de)
- [Vehicle models](https://github.com/movsim/traffic-simulation-de/blob/master/js/models.js)

Uses JavaScript and HTML5 Canvas. Vehicles have a position along a lane, a speed,
and driver parameters. Its documented models include IDM, an ACC extension, and
MOBIL for lane changes. The README notes that ACC is generally used in the
simulation, so we should not describe every demo as unmodified IDM.

Scenarios include ring roads, on-ramps, bottlenecks, and intersections. The source
documents draggable obstacles, signals and speed limits, speed-colored cars,
interactive controls, and trajectory/detector downloads.

**Takeaway:** start with curated scenarios and immediate visual feedback. A
"brake one car" experiment can reveal a backward-moving congestion wave. Put
density and inflow controls in their appropriate scenarios: a closed ring has a
fixed population, while an open road receives arriving vehicles.

## 3. A/B Street — street editing and comparison reference

- [Repository](https://github.com/a-b-street/abstreet)
- [Browser application linked upstream](https://play.abstreet.org/0.3.49/abstreet.html)
- [User guide](https://a-b-street.github.io/docs/user/index.html)
- [Simulation module](https://github.com/a-b-street/abstreet/blob/main/sim/src/lib.rs)

Uses Rust, with a browser build through WebAssembly. It combines OpenStreetMap
networks, trips, street/intersection editing, and transport simulation. Its source
separates low-level agent mechanics from higher-level trip management. The README
has a 2025 update explaining that work has developed into several related tools;
this is a useful design reference without assuming the original app is the
current focus of all development.

**Takeaway:** let users duplicate a baseline, make one intervention, and compare
the effects. Selecting a road or junction should reveal its properties. Keep
editing and running as distinct modes so network changes do not invalidate
vehicles already in motion. Defer OpenStreetMap import until our own small
networks work reliably.

## 4. CityFlow — network schema and signal experiments

- [Repository](https://github.com/cityflow-project/CityFlow)
- [Road network format](https://github.com/cityflow-project/CityFlow/blob/master/docs/source/roadnet.rst)
- [Build configuration](https://github.com/cityflow-project/CityFlow/blob/master/CMakeLists.txt)

CityFlow has a C++ simulation core, Python bindings through pybind11, and a focus
on traffic-signal control research. Its JSON network distinguishes roads, lanes,
road links, lane links, and signal phases. It also includes visualization/replay
support. Performance claims in its README are project-specific benchmarks, not
targets established for our application.

**Takeaway:** represent a green signal as permission for specific movements,
rather than coloring an entire intersection green. Separate network structure
from traffic demand and the signal policy. Begin with fixed signal timing;
reinforcement learning would be a later research extension.

## 5. UXsim — readable experiments and meaningful outputs

- [Repository](https://github.com/toruseo/UXsim)
- [Beginner notebook](https://github.com/toruseo/UXsim/blob/main/demos_and_examples/demo_notebook_01en.ipynb)
- [Peer-reviewed description](https://doi.org/10.21105/joss.07617)

UXsim is mainly Python, with an optional C++ acceleration path. It is explicitly
a macroscopic/mesoscopic simulator, so it is not a direct template for detailed
independent lane-level vehicles. Its examples construct nodes, links, timed
origin-destination demand, and report completed trips, travel time, and delay.

**Takeaway:** make experiments small and reproducible, with explicit units and
simple output tables. Learn from its analysis workflow and scenario format
without confusing its aggregate model with our microscopic model.

## 6. HighwayEnv — modular vehicle behavior and focused scenarios

- [Repository](https://github.com/Farama-Foundation/HighwayEnv)
- [Documentation](https://highway-env.farama.org/)

Python and Gymnasium provide driving environments such as highways, merges,
intersections, and roundabouts, with graphical rendering. Its main purpose is
driving decision-making research; it is less directly suited to a public network
planning app.

**Takeaway:** give vehicle behavior a clear interface and test it in small,
controlled situations. Independent agents can use ordinary rules; machine
learning is not required for an agent-based model.

## UI direction inspired by these projects

- Center: a large 2D network canvas with pan/zoom, lane markings, moving cars,
  elevated-road shadows, and a speed/congestion legend.
- Left: scenario presets, vehicle demand, signal settings, and selected-road
  properties. Use plain labels and units beside controls.
- Bottom: play/pause, reset, single step, speed multiplier, and simulated time.
- Right or below: completed trips, queues, travel time, throughput, and charts.
- Compare mode: baseline and modified scenario using the same demand schedule,
  with differences in metrics. Run sequentially first to limit browser load.
- Vehicle inspector: show speed, destination, and a simple reason for waiting,
  such as "red signal" or "vehicle ahead".

Use shape and labels alongside color. Keyboard-accessible controls and a textual
results table should accompany the canvas. A polished 2D schematic is enough
for the demo; 3D would add considerable work without proving the model.

## Attribution and deployment references

We will write the simulation and editor ourselves using published ideas. If we
later reuse source or artwork, check the specific licenses first. For example,
the inspected repositories identify SUMO as EPL-2.0, A/B Street as Apache-2.0,
UXsim as MIT, and traffic-simulation.de includes a GPL-3.0 license file.

Useful platform references:

- [Web Workers, MDN source](https://github.com/mdn/content/blob/main/files/en-us/web/api/web_workers_api/using_web_workers/index.md): worker isolation and message passing.
- [Netlify Next.js runtime](https://github.com/opennextjs/opennextjs-netlify): native Next.js deployment support.
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration): check current limits when deploying.

Direct Vercel and Netlify documentation pages were blocked by this environment's
network policy during research. Netlify support was checked through the upstream
runtime README; exact hosting quotas, pricing, and deployment behavior still need
verification during deployment. No traffic simulator or demo was installed.
