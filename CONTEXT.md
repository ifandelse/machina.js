# machina.js

Finite state machine library. States are config entries with handler functions, inputs come in, a handler decides what to do and which state comes next. The engine handles event emission, deferred input replay, and hierarchical delegation.

## Language

### Hierarchy

**Mount**:
A declaration site for a child FSM: one state whose config has a `_child` entry. A mount pairs a parent state name with the child instance it delegates to.
_Avoid_: slot, nesting, embedded FSM

**Child**:
The FSM instance a mount delegates to. The same child can appear at several mounts in one parent (a shared child). Identity is the instance, never the adapter around it.
_Avoid_: sub-machine, nested FSM, ChildLink (when you mean the instance)

**ChildLink**:
The adapter the engine puts around a child so Fsm children (no client argument) and BehavioralFsm children (client argument) present the same interface. The engine creates one per mount. The adapter is the only code that reads a child's event payload: the BehavioralFsm adapter extracts the client from built-in payloads, and the Fsm adapter doesn't report a client. It is exported as a type for inspection tooling.
_Avoid_: wrapper, proxy

**Mount table**:
The module that stores every mount of one FSM, grouped by child, and contains everything that knows children exist: child subscriptions, event relay and stale-event filtering, `nohandler` bubbling, child reset on parent entry, dispose cascade, and the walk persistence uses to collect child snapshots. It reads client state from the client registry and re-enters the parent's local dispatch through a bubble callback the engine supplies at construction.

### Clients

**Client registry**:
The module that owns per-client bookkeeping for one BehavioralFsm: the WeakMap from client to client record and the weak set of live clients. It answers "what state is this client in" and "which clients are live" for the engine and the mount table.

**Client record**:
The current state and the deferred input queue that the client registry stores for one client.
_Avoid_: ClientMeta (the type name stays; the concept is "client record"), metadata
