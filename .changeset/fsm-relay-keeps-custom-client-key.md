---
"machina": patch
---

A custom event's payload now keeps its own `client` key at both relay points. The `Fsm` wrapper removed `client` from any object payload that had one, which was meant for the seven built-in payloads and also hit custom events such as `emit("seatAssigned", { client: "acme", seat: 3 })`, whose subscribers received `{ seat: 3 }`. The parent's child-event routing read the same key as the parent's client, so a mounted child's custom event with its own `client` key was dropped before it reached parent subscribers. Both sites are now keyed by the built-in event names. Built-in payloads on an `Fsm` still arrive without `client`, and a `BehavioralFsm` child's built-in events are still filtered by client.
