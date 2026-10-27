# machina

## 8.2.0

### Minor Changes

- 11620d4: `on()` accepts custom event names (#183). On both `Fsm` and `BehavioralFsm`, the `on(eventName, callback)` overload is keyed by the built-in event map intersected with a wide map. `fsm.on("checkCountUpdated", cb)` compiles without the `"*"` wildcard and without a cast on the event name. A built-in name keeps its narrowed payload. A custom name's payload is `unknown`. The wildcard overload is unchanged and now sits first in the overload list, so `on("*", (eventName, data) => ...)` resolves as before. The new `EventMap` type is exported. The change is type-only. The emitter already delivered custom events by name at runtime.
- e8381ec: Add typed custom events (#183). A vocabulary bag in the curried factories' existing map slot declares an event map alongside, or instead of, the input map: `createFsm<{ events: MyEvents }>()({...})`, `createFsm<{ inputs: MyInputs; events: MyEvents }>()({...})`, and `createBehavioralFsm<TClient, { events: MyEvents }>()({...})`. A bare input map in that slot keeps its 8.0 meaning. The slot tells the two apart by their values, so an input map with an input named `inputs` is still an input map. A malformed bag reports TS2344 on the type argument, the same as a malformed input map. That covers a misspelled member beside a valid one and an `events` member that reuses one of the seven built-in names, since the engine owns those payloads.

    Under an event map, `emit()` in handlers, in `onDispose`, and on the instance is keyed by the declared names and checks each payload. A payload is optional only when its declared type admits `undefined`. `on()` accepts the built-in names plus the declared names with typed payloads, and an undeclared name is a compile error on both. A `BehavioralFsm` custom payload is exactly the declared type, with no `client` field added. `Fsm`, `BehavioralFsm`, `FsmConfig`, `HandlerArgs`, `HandlerFn`, and `HandlerDef` gain a trailing `TEvents` generic that defaults to the wide map, so existing annotations keep resolving. The new exports are `EventMapLike`, `EmitArgs`, `EventMapOfInstance`, `VocabularyLike`, `VocabularyInputs`, and `VocabularyEvents`. The map is type-only, and runtime behavior is unchanged.

### Patch Changes

- 11620d4: A custom event's payload now keeps its own `client` key at both relay points. The `Fsm` wrapper removed `client` from any object payload that had one, which was meant for the seven built-in payloads and also hit custom events such as `emit("seatAssigned", { client: "acme", seat: 3 })`, whose subscribers received `{ seat: 3 }`. The parent's child-event routing read the same key as the parent's client, so a mounted child's custom event with its own `client` key was dropped before it reached parent subscribers. Both sites are now keyed by the built-in event names. Built-in payloads on an `Fsm` still arrive without `client`, and a `BehavioralFsm` child's built-in events are still filtered by client.

## 8.1.0

### Minor Changes

- 04c296f: Add a config-level `onDispose` hook (#194). `dispose()` calls it once per live client, with `{ ctx, emit }`, after it sets the disposed flag and before it clears listeners or disposes child FSMs. An `Fsm` gets one call with its context. A `BehavioralFsm` gets one call per client it has initialized or rehydrated and that is still reachable. Resource lifetime decides where cleanup goes: a resource scoped to one state stays in that state's `_onExit`, and a resource scoped to the FSM or to a client goes in `onDispose`. `dispose()` still does not run `_onExit`.

    The release also changes how `dispose()` behaves in two situations. A throwing hook, or a throwing child disposal, no longer stops teardown: `dispose()` runs every remaining hook, clears listeners, disposes children, and then throws one `AggregateError` that lists every failure. And a `dispose()` call from inside an engine callback now stops the engine work that would have followed it. That covers `_onExit`, `_onEnter`, and the `transitioning` and `transitioned` listeners during a transition, the `handling` listener during `handle()`, and the initial `_onEnter` during lazy client initialization on a `BehavioralFsm`. The callback itself runs to completion. The target state's `_onEnter`, the child reset, the deferred replay, the bounce, and the announced input handler no longer run on a disposed FSM. Code that disposed from `_onExit` and relied on the target `_onEnter` running afterward will see that hook skipped.

## 8.0.0

### Major Changes

- 75e5029: Add typed input payloads (#195). A curried factory form fixes an input payload map (input name → argument tuple) before config inference starts: `createFsm<TInputs>()({...})` and `createBehavioralFsm<TClient, TInputs>()({...})`. Under a map, handler payload parameters are inferred from the map's tuples, `handle()` enforces them at the call site, and the map is the complete input vocabulary: handler keys outside it are compile errors. `handle()` keeps the input name and its payload correlated when the caller's input name is a union. A named interface works as a map. `InputMapFromUnion` derives a map from a discriminated event union. `InputMapOfInstance` extracts the map back off a constructed instance, for tooling. Under a map, `bubbles` entries are constrained to the map's keys: an unfireable bubble is rejected at the declaration. The map is type-only, and runtime behavior is unchanged.

    The major bump covers one type-level break. The curried factories gained a type parameter, and an instantiation expression that supplies explicit type arguments (`typeof createBehavioralFsm<Client, X>`) now binds its second argument to the input map instead of the states object, and the old binding fails to compile. Direct calls compile unchanged. Spell such annotations with the class and extraction types instead: `BehavioralFsm<Client, StateNamesOf<typeof states>, InputNamesOf<typeof states>>`.

## 7.0.1

### Patch Changes

- 01285e4: Updated documentation

## 7.0.0

### Major Changes

- 749d583: Fix the states-config type-inference collapse (#188, #189) and add typed hierarchy contracts. Previously, a state that was an empty object (`{}`) — or, far more commonly, a state containing only unannotated handler functions such as a lone `_onEnter`/`_onExit` — silently disabled literal-type validation for the entire config: shorthand transition targets, `initialState`, `handle()` input names, and `defer({ until })` all degraded to accepting any string. `ValidateStates` no longer does double duty as both validator and inference source; the states literal, the state-name union, and the validation check are now three separate mechanisms, so those config shapes are fully validated. **This is the headline breaking change: configs that compiled only because checking was silently off will now surface their latent typos as real compile errors.** Relatedly, `defer({ until })` is now narrowed to the declared state names (with a "Did you mean" suggestion on typos), and a handler annotated with an explicitly widened `defer: (o?: { until: string }) => void` property signature no longer compiles — annotate with `HandlerArgs<TCtx>` instead.

    One deliberate runtime behavior change: `canHandle()` now recurses through the current state's `_child` chain instead of checking a single level, so the delegation gate's answer matches the depth `handle()`'s forwarding can actually reach. Inputs that previously dead-ended as `nohandler` at an ancestor now arrive at the descendant that declares them, an ancestor's local handler no longer wins against a deeper descendant's handler (the same child-first precedence machina always had one level deep, now applied consistently — matching UML/SCXML/XState innermost-first semantics), and `nohandler`/`handled` event traces shift accordingly. Everything else in this release is compile-time only.

    New capabilities: a parent's `handle()` now accepts inputs handled by its `_child` FSMs, recursively through grandchildren, with no casts (`InputNamesOf` folds child instance unions in). And an FSM can declare inputs it fires at itself but never handles — `bubbles: ["someInput"]` — expecting its container to catch them via nohandler bubbling. Declared bubbles join the FSM's own typed input union, ride the instance type as a new fourth class generic (`TBubbles`, defaulting to `never` — existing three-argument `Fsm`/`BehavioralFsm` annotations still resolve), and form a compile-time wiring contract: a config that mounts the FSM via `_child` must handle each declared bubble, re-declare it in its own `bubbles`, or carry a `"*"` catch-all, or compilation fails on the `_child` property naming exactly what's missing. The contract composes through arbitrarily deep hierarchies and costs nothing at runtime — the engine never reads `bubbles`. A new `BubblesOfInstance` extractor is exported alongside the existing instance-type utilities. One sharp edge: the explicit-both call form (`createBehavioralFsm<Client, typeof states>`) disables inference for the trailing type parameters, so combining it with `bubbles` requires supplying all four type arguments explicitly; the curried and zero-argument forms are unaffected. Rejected `handle()`/`transition()` calls now display the flat list of valid names in compiler errors (e.g. `'"go" | "stop"'`) instead of an unresolved internal type alias, in every config shape.

### Minor Changes

- 59746b5: Add `dehydrate(client)` and a snapshot-aware overload of `rehydrate(client, snapshot)` to `BehavioralFsm`. `dehydrate()` returns a plain, JSON-serializable snapshot of everything machina tracks for a client — current state, pending deferred inputs, and the same for every `_child` in the hierarchy, active or not. The object form of `rehydrate()` restores it, requeuing deferrals at every level with no lifecycle hooks or events, so a restored client behaves identically to one that never left memory. The existing string form of `rehydrate()` (composite-state-only, no deferrals) is unchanged. Throws for an Fsm child on the client's active path (consistent with the existing string-form `rehydrate()` throw) — an off-path Fsm child elsewhere in the hierarchy, no matter how deeply nested under other `BehavioralFsm` children, is skipped rather than blocking `dehydrate()` for clients that never reach it. Also throws for deferred arguments that can't survive a serialization boundary — the error names the exact input, its `until` target, and the offending value's path.

### Patch Changes

- eb71113: Fix two pre-existing `BehavioralFsm` bugs sharing root causes with issues found and fixed for `dehydrate()`/`rehydrate()` in the previous release. `transition()` and the string form of `rehydrate()` used the `in` operator to validate state names, which walks the prototype chain — a state name like `"__proto__"` or `"constructor"` (never actually declared) passed validation via the inherited `Object.prototype` member, silently wedging clients in an undeclared pseudo-state instead of being rejected as unknown. Both now use `Object.hasOwn()`, matching the existing object-form `rehydrate()` fix; the fix only reclassifies these names as unknown, it doesn't change how `transition()` (emits `invalidstate`) or `rehydrate()` (throws) already handle unknown states. Separately, `setupChildSubscriptions()` deduplicated by the `ChildLink` wrapper object rather than the underlying FSM instance — since a fresh wrapper is minted per declaring state, a child FSM shared across two or more parent states was subscribed to twice, which could double-fire relayed events on the parent for client-less child events (an Fsm child's events, or a `BehavioralFsm` child's custom `emit()` with no client in the payload) when different clients were active on different declaring states at once. Deduplication is now keyed by the shared instance, and event-relay filtering compares the same way, so a shared child's events are forwarded exactly once regardless of which declaring state is active. `dispose()`'s cascade loop had the same wrapper-keyed pattern — a shared child was cascade-disposed once per declaring state rather than once. That double call was harmless (`dispose()` is idempotent), but it now dedupes by instance too, removing the wrapper-vs-instance identity mistake from the codebase entirely.

## 6.3.0

### Minor Changes

- Added BehavioralFsm.rehydrate

## 6.2.0

### Minor Changes

- Add property based testing/walkAll utility.

## 6.1.0

### Minor Changes

- Add machina-inspect and eslint-plugin-machina

## 6.0.0

### Major Changes

- Machina v6
