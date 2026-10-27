# machina-react

## 0.2.0

### Minor Changes

- 0b957ab: `useFsmEvent` and `useBehavioralFsmEvent` accept custom event names (machina #183). The event name type is the built-in names plus the names of the instance's declared event map, and each callback payload is typed from the same map. An FSM without an event map accepts any name with an `unknown` payload. The new `FsmEventMapOf`, `BehavioralFsmEventMapOf`, `FsmEventName`, and `BehavioralFsmEventName` types are exported.

    The `machina` peer range rises to `>=8.2.0`, the first release that exports `EventMapOfInstance`. The generated declaration files import it. Against an older core, every hook fails type checking, including the ones that existed before this release.

## 0.1.0

### Minor Changes

- 8ab61de: Initial experimental release. machina-react provides React hooks that subscribe components to machina FSM instances through `useSyncExternalStore`. The exports split into snapshot hooks, which rerender a component when the machine changes, and event hooks, which run callbacks without causing rerenders. Under an FSM with an input payload map, the snapshot's `handle` enforces the declared payloads, and the hook types reuse core's payload map types, which sets the peer floor at `machina >= 8.0.0`. machina-react does not create or manage FSM instances, and it is client-only: rendering the hooks on the server throws, because they don't pass `useSyncExternalStore` a server snapshot.
