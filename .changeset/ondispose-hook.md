---
"machina": minor
---

Add a config-level `onDispose` hook (#194). `dispose()` calls it once per live client, with `{ ctx, emit }`, after it sets the disposed flag and before it clears listeners or disposes child FSMs. An `Fsm` gets one call with its context. A `BehavioralFsm` gets one call per client it has initialized or rehydrated and that is still reachable. Resource lifetime decides where cleanup goes: a resource scoped to one state stays in that state's `_onExit`, and a resource scoped to the FSM or to a client goes in `onDispose`. `dispose()` still does not run `_onExit`.

The release also changes how `dispose()` behaves in two situations. A throwing hook, or a throwing child disposal, no longer stops teardown: `dispose()` runs every remaining hook, clears listeners, disposes children, and then throws one `AggregateError` that lists every failure. And a `dispose()` call from inside `_onExit`, a `transitioning` listener, or `_onEnter` now ends the transition when that callback returns, so the target state's `_onEnter`, the child reset, the deferred replay, and the bounce no longer run on a disposed FSM. Code that disposed from `_onExit` and relied on the target `_onEnter` running afterward will see that hook skipped.
