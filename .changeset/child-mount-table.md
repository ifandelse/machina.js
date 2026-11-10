---
"machina": minor
---

Internal refactor of child delegation in `BehavioralFsm`. Everything about `_child` now lives in one new module, the mount table: it installs the `ChildLink` adapters, delegates inputs, resets and reports child state, relays child events, bubbles unhandled inputs, cascades `dispose()`, and groups shared children for `dehydrate()` and `rehydrate()`. The per-client records moved to a second new module, the client registry. The existing engine tests pass without edits. The mount table reads `_child` from each state once, at construction, which is one change from the old engine. Deleting `_child` from `states` after the FSM exists no longer unmounts the child. Machina never supported mutating state objects after construction.

One exported type changes: `ChildLink.onAny` is replaced by `ChildLink.subscribe(listener)`, where the new `ChildListener` type carries `onEvent(eventName, data, client)` and `onUnhandled(inputName, args, client)`. The adapter resolves `client` before calling the listener. machina-inspect reads only `instance` and `canHandle`, so it is unaffected. Code that implemented `ChildLink` by hand needs the new member.
