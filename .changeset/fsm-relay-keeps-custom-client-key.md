---
"machina": patch
---

An `Fsm` no longer strips a `client` key from a custom event's payload. The relay from the inner `BehavioralFsm` removed `client` from any object payload that had one, which was meant for the seven built-in payloads and also hit custom events such as `emit("seatAssigned", { client: "acme", seat: 3 })`, whose subscribers received `{ seat: 3 }`. The strip is now keyed by the built-in event names. Built-in payloads on an `Fsm` still arrive without `client`.
