# Simulation concepts, briefly

## Vehicles are agents

An agent has its own state and makes a local decision. A car knows its speed,
desired speed, route, the vehicle ahead, and whether it must stop at a signal.
It decides how much to accelerate or brake. It does not need a neural network
or a separate operating-system thread. One loop can update many agents.

Congestion emerges from interactions: a driver brakes, the next driver reacts,
and queues can grow if arrivals exceed the rate vehicles can leave. There is no
need for a rule saying "create a traffic jam here." A perfectly uniform ring can
remain stable, however; use an explicit braking perturbation and suitable
density/driver parameters when demonstrating stop-and-go waves.

## Car-following: IDM

The Intelligent Driver Model computes acceleration from desired speed, the gap
ahead, and how quickly that gap is closing. Drivers accelerate toward a preferred
speed and brake as the following gap becomes too small. We will implement the
published model ourselves, with documented parameters.

Conceptually: acceleration = tendency to reach desired speed − tendency to avoid
the vehicle ahead. Important settings include desired speed, preferred time gap,
minimum stopped gap, acceleration, and comfortable braking.

Reference: Treiber, Hennecke, and Helbing, 2000,
[Congested Traffic States in Empirical Observations and Microscopic Simulations](https://doi.org/10.1103/PhysRevE.62.1805).

A formula alone does not guarantee collision-free discrete updates. We must
handle stopping inside a timestep, tiny gaps, insertion, and transfers between
lanes consistently. Safety checks should expose errors rather than silently
teleport or delete cars. Keep meters, seconds, and meters/second inside the
engine; convert speeds to km/h only for display.

## Simulation time and reproducibility

At a fixed step of 0.1 seconds, ten updates represent one simulated second.
At 2× playback, we perform more fixed updates per real second; we do not double
the physics timestep. A slower laptop may take longer to finish the same run,
but should execute the same sequence of model updates.

At each step, read a common previous state, compute proposed actions, resolve
conflicting movements deterministically, then commit the next state. Updating
cars in place can accidentally let later cars see a different time than earlier
cars. Use an explicit policy for simultaneous lane-change/junction requests.

A seeded random generator produces repeatable driver variation and arrivals.
For fair A/B comparisons, pre-generate the same origin-destination departure
schedule and driver attributes; merely using the same seed is insufficient if
different network behavior changes the order of random calls. Record engine
version, timestep, scenario, demand, and any timed control changes too.

We will compare results with a smaller timestep to check that conclusions are
not numerical artifacts. Exact cross-browser bitwise equality is not assumed.

## Networks, roads, and capacity

A graph stores places as nodes and permitted travel as directed edges. A
two-way road normally has two directed road records. Lanes belong to roads;
connectors state which incoming lanes can reach which outgoing lanes. Start
with fixed routes, then use Dijkstra's algorithm to find routes with minimum
free-flow travel time. Dijkstra repeatedly expands the cheapest known route.

Separate three ideas:

- Width, in meters, describes physical geometry.
- Lanes and length determine how many vehicles can fit with safe gaps.
- Flow capacity, in vehicles/hour, is the rate vehicles can pass a location.

Doubling a drawn road's width does not automatically double its capacity. In the
first lane-based model, users change lane count explicitly; width sets lane
geometry rather than inventing an unvalidated width-to-capacity formula.
Following gaps, lane use, signals, and merges determine effective throughput.
An optional inflow/service limit would be a separately labeled constraint.

Closed ring experiments set a vehicle count/density. Open networks specify
departures per unit time and origin/destination. If entry is blocked, retain
vehicles in an external queue and count them; silently dropping arrivals makes
a congested design look better than it is.

## Junctions and signals

A turn is a connector with a physical path and length. Two turns conflict when
they use incompatible space at the same level. Initially use protected phases:
only a compatible set of movements can enter at once. Include amber and
all-red clearance, allow vehicles already inside to finish, and check exit
space before letting another car enter. Green is permission, not a guarantee
that there is room to move.

A red signal can be treated as a virtual stationary obstacle at the stop line
when computing approach braking. Junction occupancy still needs separate
rules; removing that obstacle at green is not enough to prevent collisions.

## Flyovers

Two roads may cross on the screen without connecting in the graph. Give them
different levels and distinct connections. At the crossing, flyover traffic has
no shared conflict with the road below. Ramps create explicit entry/exit and
merge connections. Rendering elevated roads last with shadows makes this
visible without requiring a 3D physics engine.

A flyover can remove a crossing conflict while moving the bottleneck to a merge
or the downstream road. Compare total network outcomes, not only the queue at
the original junction. Grade-dependent engine behavior is a later extension.

## Lane changes, later

First implement lane choice and safe connector transfers without discretionary
overtaking. Then consider MOBIL: change lanes if doing so is safe and provides
enough benefit, accounting for the braking imposed on others. Resolve two cars
requesting the same gap together. Mandatory lane changes near turns/merges
need explicit rules and tests as well.

[MOBIL reference](https://doi.org/10.3141/1999-10): Kesting, Treiber, and Helbing, 2007. This is an extension milestone, not a prerequisite for the first ring.

## What the results mean

- **Travel time:** arrival minus actual network entry for completed trips. Report
  external entry wait separately, plus total time from requested departure.
- **Delay:** actual time minus free-flow time for the relevant trip. State
  whether entry wait is included and keep the convention consistent.
- **Flow:** vehicles crossing a specified detector per time interval, scaled to
  vehicles/hour. Always show the detector and measurement window.
- **Queue:** vehicles below a stated speed threshold on a lane; initially use
  0.5 m/s. Label it a slow/stopped vehicle count unless measuring spatial queue length.
- **Completion:** requested, waiting outside, entered, completed, and still active.

An average over completed trips can hide vehicles stuck at the end. Always show
completion counts and unfinished queues beside it. Check conservation:
requested = waiting outside + active + completed for a run without cancellations.
On a closed ring, the total population stays constant and trip-completion
metrics are replaced with speed, density, and detector flow.

For comparisons, use identical travel demand and observation duration, explain
warm-up handling, and repeat experiments over several seeds. Matching model
invariants is verification; matching observed real traffic is validation. We can
verify our code before having the data needed to validate real-world predictions.
