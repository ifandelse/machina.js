---
"machina-react": minor
---

Initial experimental release. machina-react provides React hooks that subscribe components to machina FSM instances through `useSyncExternalStore`. The exports split into snapshot hooks, which rerender a component when the machine changes, and event hooks, which run callbacks without causing rerenders. Under an FSM with an input payload map, the snapshot's `handle` enforces the declared payloads. machina-react does not create or manage FSM instances, and it is client-only: rendering the hooks on the server throws, because they don't pass `useSyncExternalStore` a server snapshot.
