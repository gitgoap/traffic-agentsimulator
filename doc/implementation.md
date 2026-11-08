# What we implemented, and why

## Separate a traffic model from a moving picture

The TypeScript engine has no React, Canvas, database, or browser imports. Give
it a scenario and seed, then advance it by a number of steps. This lets a browser
worker, a test, and the command-line experiment runner use the same model.

The worker advances simulation time; the main thread draws snapshots and handles
input. Pausing a hidden tab avoids misleading background progress. Each reset
gets a new run identifier so an old message cannot replace a new run's state.

The initial proposal mentioned Tailwind and Recharts. We used plain CSS with a
small theme and native SVG charts instead: two sampled charts do not require a
chart framework, and the interface can be styled without another build tool.
React and Next.js still provide the component and server framework.

## Roads form a graph, not just a drawing

A directed road contains lanes and geometry. The compiler creates physical
lane segments plus connectors for legal junction movements. Immediate U-turns
are excluded; boundary nodes are sources/sinks rather than through junctions.
Dijkstra routing uses free-flow road travel time as its weight. It does not
reroute drivers around congestion during a run.

Distances follow the geometry in meters. Changing a road's lane count changes
the number of parallel vehicle streams. Changing lane width changes their
placement; it does not apply an invented capacity multiplier. The editor checks
references, minimum road lengths, ring density, and route reachability before
restarting the engine with the changed scenario.

Flyovers cross without a shared graph node. A ramp explicitly connects to an
elevated merge junction. Road and node levels control drawing order; they do
not add vehicle engine-power or grade physics. Lane assignment is fixed for
each route, with legal lane mapping when a receiving road has fewer lanes.
Discretionary overtaking and MOBIL remain extensions.

## Safety requires more than an acceleration equation

Each step reads the same previous state before committing new vehicle states.
Cars look ahead through segment boundaries so the leader's rear is respected
even after its front has entered a connector. Junction reservations exclude
conflicting paths and persist until a vehicle's rear clears the movement.
Entry also requires space on the receiving lane.

Signals alternate horizontal/vertical approach groups, each with green, 3 seconds
amber, and 2 seconds all-red. Conflicting turns within a green group still yield;
green does not override reservations. Manual all-red blocks new entries, while
vehicles already in the junction may clear it.

IDM gives acceleration, not a mathematical collision guarantee for discretized
updates. Stopping inside a step uses the stopping distance rather than moving
backwards. A conservative distance bound caps travel when the previous state's
available gap would be exhausted. Activations are counted as `safetyBounds` in
exports; they must not be hidden when assessing timestep sensitivity. Amber is
handled conservatively as a stop requirement, not a calibrated dilemma-zone
model. Connector conflict checks are conservative and can reduce throughput.

## The same demand must really be the same demand

Each origin/destination stream has a seeded exponential interarrival process:
the mean arrival rate is specified in vehicles/hour. Driver attributes are
generated alongside departures, independently of network events. Streams are
ordered canonically so rearranging demand rows does not change arrivals.

The paired experiment uses three common seeds and checks that demand, duration,
model type, and ring population match. The network and signals may differ.
Reported variation is the sample standard deviation across these three runs,
not a confidence interval or proof of statistical significance. No warm-up
period is removed. A changed scenario clears old comparison results.

## Count the cars that could not enter

At every snapshot, requested demand equals completed + active + waiting outside.
Departures during the final timestep are counted as waiting if they have not
entered. The 300-active-vehicle demo cap retains excess arrivals outside; it
never erases them.

Network travel time begins at actual entry; entry wait begins at requested
departure. Total trip time includes both. These averages cover completed trips,
so unfinished and waiting counts are displayed alongside them. Exit/detector
flow is a count over the full elapsed simulation time, scaled to vehicles/hour;
it is not an instantaneous capacity estimate.

## A simple full-stack sharing model

Scenarios and the latest saved summary live in a versioned server record. Local
development uses atomic files; deployment uses Supabase/PostgreSQL through its
HTTPS API. Database requests and the service-role key stay on the server.

We chose capability-based editing instead of accounts for this demo. Creation
returns a random 256-bit private edit key once. The server stores its SHA-256
hash and uses a constant-time comparison. Public links contain only a random
record ID. The browser keeps the edit key locally; losing it loses edit access.
Creating a new shared copy still works, but cannot delete the old one.

Updates include the expected revision. Concurrent updates cannot silently
overwrite each other. Public responses exclude the hash and edit key. Request
validation, bounded JSON, same-host writes, and quotas protect the endpoints.
Production quotas use an atomic PostgreSQL function shared across serverless
instances. Hosting proxies must supply trustworthy client-IP headers; local
quotas are only an in-process development convenience. Anonymous public sharing
can still require additional provider abuse controls for a large public launch.

The initial proposal included accounts and separate run-history tables. The
implemented demo needs one scenario record with its latest summary; full run
history can be retained through JSON/CSV exports. Accounts and recovery would
be a separate product feature. A saved client summary is labeled as such and is
not a server-validated research result.
