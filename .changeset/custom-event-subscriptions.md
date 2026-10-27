---
"machina": minor
---

`on()` accepts custom event names (#183). On both `Fsm` and `BehavioralFsm`, the `on(eventName, callback)` overload is keyed by the built-in event map intersected with a wide map. `fsm.on("checkCountUpdated", cb)` compiles without the `"*"` wildcard and without a cast on the event name. A built-in name keeps its narrowed payload. A custom name's payload is `unknown`. The wildcard overload is unchanged and now sits first in the overload list, so `on("*", (eventName, data) => ...)` resolves as before. The new `EventMap` type is exported. The change is type-only. The emitter already delivered custom events by name at runtime.
