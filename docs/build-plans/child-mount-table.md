# Build Plan: child delegation behind a mount table

## Context Source

- Architecture review run on 2026-11-06 against master at d18aced. The HTML report lived in the OS temp directory and is not in the repo. Candidate 1 of six.
- Grilling session with Jim on 2026-11-08. Eight questions, each resolved; the answers are listed under Key Design Decisions.
- Vocabulary recorded in `CONTEXT.md` (Hierarchy and Clients sections) during the session.
- ADR 0001, `docs/adr/0001-engine-installs-childlink-wrappers-in-config-states.md`, records the one decision that constrains the release type.

## Problem Summary

`BehavioralFsm` is one 1,163-line class. Thirteen of its members know that a state can mount a child FSM: `dispatch`, `canHandle`, `transition`, `compositeState`, `planSnapshotWrites`, `rehydrateCompositePath`, `collectChildSnapshots`, `dispose`, `wrapChildLinks`, `setupChildSubscriptions`, `bubbleNohandler`, `isChildActiveForClient`, and the module-level `createChildLink`. The loop "walk `Object.keys(states)` for `_child`" appears four times, "dedupe by `childLink.instance`" appears three times, and "iterate `knownClients`, deref, delete the dead ref" appears three times. Comments at `behavioral-fsm.ts:817-822` and `:884-891` and the 8.1.x changelog record three bugs that came from one of those copies drifting from the others.

The inbound relay in `setupChildSubscriptions` (`:893-988`) also reads every child event's payload. It checks the event name against `BUILT_IN_EVENT_NAMES` and tests `"client" in payload` to decide whether the payload names a parent client. That is the parent engine reasoning about the wire format of a child it does not own.

This refactor moves everything that knows children exist into one module, the mount table, and moves per-client bookkeeping into a second small module, the client registry. The public interface of `Fsm` and `BehavioralFsm` does not change. The release is a minor.

## Technical Approach

### Client registry (`client-registry.ts`)

Stores the `WeakMap<TClient, ClientMeta>` and the `Set<WeakRef<TClient>>` that the engine declares today at `behavioral-fsm.ts:108-112`. Its interface:

- `get(client)`: the client record, or `undefined`. No side effects.
- `set(client, record)`: write the record. Adds a weak ref the first time the client is seen. This replaces the "guard `knownClients` before writing" sequence that appears twice today (`:567-574`, `:607-612`).
- `has(client)`.
- `stateOf(client)`: the record's state, or `undefined`. A convenience for the mount table.
- `liveClients()`: iterates every live client, deleting dead refs as it goes. Each of the loop's existing copies becomes one call to this method.

`getOrCreateClientMeta` stays in the engine, because it triggers the initial transition. It calls `registry.set` instead of writing two collections.

### Mount table (`mount-table.ts`)

Constructed once per engine instance with four arguments: the states object, the client registry, a bubble callback, and a relay callback. Construction does the two walks that `wrapChildLinks` and `setupChildSubscriptions` do today, in that order:

1. For every state with a `_child`, validate the value (the two checks at `:865-874`, plus the one inside `createChildLink` at `:1182-1186`, become one check), build a `ChildLink` with `createChildLink`, and write it back into `states[name]._child`. ADR 0001 records why the write stays.
2. Group mounts by child instance. Subscribe once per child.

Lookups the engine and persistence use:

- `mountAt(stateName)`: the `ChildLink` at that state, or `undefined`.
- `mountsByChild()`: every distinct child with the list of state names that mount it. This is the grouping `collectChildSnapshots` builds for itself at `:663-680`.

Outbound operations the engine calls, one per engine touch point:

- `delegate(client, stateName, inputName, args)`: returns `true` and forwards when the mount at `stateName` can handle the input; returns `false` otherwise. Replaces `:179-192` in `dispatch`.
- `canHandle(client, stateName, inputName)`: the recursive check at `:224`.
- `resetAt(client, stateName)`: the child reset at `:363-366`.
- `pathAt(client, stateName)`: the child composite path at `:397-403`.
- `dispose()`: unsubscribe, then dispose each distinct child once. Replaces `:816-838`.

Inbound relay, owned by the table. The subscription callback receives already-resolved facts from the adapter (next section) and applies the three rules that exist today:

- Unhandled input with a known client: if that client's current state mounts this child, call `bubble(client, inputName, args)`.
- Unhandled input with no client: for every live client whose current state mounts this child, call `bubble`.
- Any other event with a known client: relay if that client's state mounts this child.
- Any other event with no client: relay once if any live client's state mounts this child.

"Client's state mounts this child" is `mountAt(registry.stateOf(client))?.instance === child`. That one expression replaces `isChildActiveForClient`.

### ChildLink adapters resolve the client

`ChildLink.onAny` is replaced by `subscribe(listener)`, where the listener has two callbacks:

- `onEvent(eventName, data, client: object | undefined)`
- `onUnhandled(inputName, args, client: object | undefined)`

One method rather than two because the engine test at `behavioral-fsm.test.ts:2881` pins one `child.on("*")` call per shared child. The BehavioralFsm adapter opens that one wildcard subscription, and for a built-in event name reads `payload.client`; for a custom event it passes `undefined`. For `nohandler` it reads `inputName`, `args` and `client` from the payload and calls `onUnhandled`. The Fsm adapter always passes `undefined` for the client. `BUILT_IN_EVENT_NAMES` moves to `mount-table.ts` with the adapters, and `fsm.ts` imports it from there.

After this change, the only code reading a child event payload is the adapter for that child's kind. The table never reads a payload.

### Engine wiring

The constructor builds the registry, then the table:

```
this.registry = new ClientRegistry();
this.mounts = new MountTable(this.states, this.registry, {
    bubble: (client, inputName, args) => {
        const meta = this.registry.get(client)!;
        meta.currentActionArgs = args;
        this.handleLocally(client, inputName, args, meta);
    },
    relay: (eventName, data) => (this.emitter as any).emit(eventName, data),
});
```

The `bubble` callback keeps the `currentActionArgs` write because candidate 5 replaces that field. `handleLocally` stays private; the closure is the only path in.

### Persistence reads mounts through the table

`collectChildSnapshots` replaces its pass-1 grouping loop with `mountsByChild()`. `planSnapshotWrites` and `rehydrateCompositePath` replace their `this.states[x]._child as ChildLink` reads with `mountAt(x)`. Their logic, their error messages and their validate-then-write order do not change. Candidate 2 moves the logic later.

## Key Design Decisions

- **Decision**: Vocabulary is mount, child, ChildLink, mount table, client registry, client record. Recorded in `CONTEXT.md`.
    - **Why**: Each recorded identity bug came from confusing the per-mount adapter with the child instance. Distinct names make the distinction visible in code review.

- **Decision**: The engine constructs the client registry and the mount table reads from it. (Option b in the session.)
    - **Why**: Both the relay and `dispose()` walk live clients. Giving the table ownership of `knownClients` would make `dispose()` ask the table for something unrelated to children. The registry is also the interface through which candidate 2's persistence module will read and write client records.
    - **Trade-off**: One more file in a five-file library.

- **Decision**: The table re-enters local dispatch through a `bubble` callback supplied at construction. (Option a.)
    - **Why**: Cheapest way to cut the cycle. An "unhandled by child" event on the parent's emitter would add an emitter hop on the input path. Returning `false` from `delegate` cannot work, because a child's `nohandler` is an event emitted after the handler ran, and it can also fire for an input the parent never dispatched.

- **Decision**: The BehavioralFsm adapter extracts the client from built-in payloads. The table never reads a payload.
    - **Why**: The adapter knows which kind of child it wraps. The engine today guesses from the payload shape.

- **Decision**: Persistence uses `mountAt` and `mountsByChild` in this PR, and keeps its logic in the engine.
    - **Why**: Deletes the fourth `_child` walk and the third dedupe now. The 20 dehydrate `describe` blocks in `behavioral-fsm.test.ts` cover the shared-child and off-path cases that walk serves.

- **Decision**: Two callbacks (`bubble`, `relay`) are acceptable.

- **Decision**: `behavioral-fsm.test.ts` and `fsm.test.ts` are not edited. Redundant dedupe assertions stay. The dispose-mid-transition tests stay only in `fsm.test.ts`.
    - **Why**: Unchanged tests are the proof that behavior did not change. Pruning and mirroring are parked for candidate 3.

- **Decision**: The engine keeps writing `ChildLink` wrappers into `config.states`. Ships as a minor. ADR 0001.

## Scope Contract

- **In scope**: `packages/machina/src/behavioral-fsm.ts`, two new files `client-registry.ts` and `mount-table.ts` with their test files, the `ChildLink` interface in `types.ts`, the `BUILT_IN_EVENT_NAMES` import in `fsm.ts`, `CONTEXT.md`, `docs/adr/0001-*.md`, one changeset. The generated API page for `ChildLink` updates during the docs build.
- **Out of scope**: any public method on `Fsm` or `BehavioralFsm`, event names or payloads, `compositeState` strings, `dehydrate` output, the persistence logic itself (candidate 2), the Fsm relay in `fsm.ts` (candidate 3), `currentActionArgs` (candidate 5), machina-inspect, machina-test, machina-react, eslint-plugin-machina, examples. Removing the in-place `states` mutation.
- **New dependencies**: none.

## Existing Patterns to Follow

- Tests execute the method under test in `beforeEach` and assert in `it`. Read `.ai/UnitTestGeneration.md` before writing any test. Fixtures use house domains (traffic light, connectivity).
- Whole-object assertions (`toEqual`, `toMatchObject`) over indexing into `mock.calls`.
- Curly braces on every conditional, strict equality, arrow functions, and comments that say why.
- Each exported type and member carries a typedoc docstring; `ChildLink`'s docstring must describe `subscribe` and `ChildListener`.
- Prose in `.md` files must pass Vale at the error level.

## Implementation Tasks

Each task is one commit. The tests for the engine pass after every commit.

### Task 1: `client-registry.ts`

- **What**: Create the class with `get`, `set`, `has`, `stateOf`, `liveClients`. Replace `clients` and `knownClients` in the engine with one `registry` field. Replace the three deref loops (`:797-803`, `:932-945`, `:972-982`) with `for (const client of this.registry.liveClients())`. Replace the two guarded writes (`:567-574`, `:607-612`) with `registry.set`. Write `client-registry.test.ts`: set-then-get, `has`, `stateOf` for unseen and seen clients, `liveClients` skipping a collected ref (hold strong references in the other cases), and `set` adding one ref per client across repeated writes.
- **Done when**: `pnpm --filter machina test` passes with no change to the two engine test files.

### Task 2: `mount-table.ts`, install and lookups

- **What**: Create the class. Move `createChildLink` and `BUILT_IN_EVENT_NAMES` into it; `fsm.ts` imports the set from the new module. Constructor performs the install walk with one combined validation. Add `mountAt` and `mountsByChild`. Engine constructor builds the table after the registry. Replace the four `this.states[x]?._child as ChildLink` reads in `dispatch`, `canHandle`, `transition` and `compositeState` with `delegate`, `canHandle`, `resetAt` and `pathAt`. Delete `wrapChildLinks`.
- **Done when**: engine tests pass. `setupChildSubscriptions` still exists and still works against the installed wrappers.

### Task 3: `ChildLink.subscribe`

- **What**: Replace `onAny` in the `ChildLink` interface and both adapters with `subscribe(listener)`, and add the `ChildListener` type. The BehavioralFsm adapter reads `payload.client` for built-in names and `inputName`, `args`, `client` for `nohandler`. The Fsm adapter passes `undefined`. Update the docstring. The only caller that changes in this task is `setupChildSubscriptions`, which passes both callbacks and uses the resolved client in place of its own payload parsing.
- **Done when**: build and tests pass.

### Task 4: relay and bubbling move into the table

- **What**: Add the `bubble` and `relay` callbacks to the table's constructor options. Move the subscription loop, the four relay rules, `bubbleNohandler` and `isChildActiveForClient` into the table, written against `onEvent`, `onUnhandled`, `registry.stateOf`, `registry.liveClients` and `mountAt`. Delete `setupChildSubscriptions`, `bubbleNohandler`, `isChildActiveForClient` and `childSubscriptions` from the engine. The engine's constructor passes the two closures shown under Engine wiring.
- **Done when**: engine tests pass, including the subscription-count test at `behavioral-fsm.test.ts:2881` and the stale-event tests.

### Task 5: dispose cascade

- **What**: Engine `dispose()` calls `this.mounts.dispose()` in place of the unsubscribe loop and the dedupe-and-cascade loop (`:816-838`). The table collects child dispose errors and rethrows them as one `AggregateError`; the engine merges that into its own error list so the caller still receives one `AggregateError` with a flat `errors` array.
- **Done when**: the existing `dispose` tests pass, including the throwing-child cases.

### Task 6: persistence reads through the table

- **What**: `collectChildSnapshots` uses `mountsByChild()` for its grouping. `planSnapshotWrites` and `rehydrateCompositePath` use `mountAt`. Nothing else in those methods changes.
- **Done when**: the 20 dehydrate and rehydrate `describe` blocks pass unchanged.

### Task 7: `mount-table.test.ts`

- **What**: Test the table through its interface with a fake child (an object stamped with `MACHINA_TYPE` that records calls and exposes a tiny emitter), a real `ClientRegistry`, and `jest.fn()` for `bubble` and `relay`. Scenarios:
    1. A raw child is wrapped in place; `mountAt` returns a `ChildLink` whose `instance` is the raw child.
    2. A non-object `_child` and a plain-object `_child` each throw with the state name in the message.
    3. A child mounted at two states gets one subscription (count calls on the fake child's `on`).
    4. `mountsByChild` groups both state names under that one child.
    5. `delegate` forwards when the child's `canHandle` is true and returns `false` otherwise.
    6. `canHandle` recurses into the child.
    7. `resetAt` and `pathAt` call the adapter with the client.
    8. Built-in event with a client in a mounting state is relayed once; with the client in another state it is dropped.
    9. Custom event is relayed once when any live client is in a mounting state, and not at all when none is.
    10. Unhandled input with a client calls `bubble` for that client only when its state mounts the child.
    11. Unhandled input without a client calls `bubble` once per live client in a mounting state and skips the others.
    12. `dispose()` unsubscribes, disposes a shared child once, and aggregates a throwing child's error.
- **Done when**: the file passes, and each scenario fails when the corresponding table code is commented out (spot-check three).

### Task 8: docs, changeset, gate, PR

- **What**: Commit `CONTEXT.md` and `docs/adr/0001-*.md`. Remove the sentence in `types.ts` that says `ChildLink` is "never exported to users"; it is exported, and the docstring should say what tooling reads. Add `.changeset/child-mount-table.md` with `"machina": minor` describing the internal split and the `ChildLink` member change (`onAny` replaced by `subscribe`). Run `pnpm run checks` and `vale` on every touched `.md`. Open the PR from `refactor/child-mount-table`. The description leads with the mental model shift: the engine runs one machine for one client at a time, the mount table knows about children, the registry knows about clients.
- **Done when**: checks pass and the PR is open.

## Technical Risks

- **Relay order**: today the engine subscribes to children in `Object.keys(states)` order and relays in that order. The table must iterate the same way or a test that asserts event order across two children will fail. Keep insertion order; `Map` preserves it.
- **`AggregateError` flattening**: Task 5 must unwrap the table's aggregate into the engine's list, or callers see a nested `AggregateError`. The existing throwing-child tests catch this.
- **`ChildLink` type change**: `onAny` disappears from an exported interface. machina-inspect reads only `canHandle` and `instance`, so nothing in the monorepo breaks. Any external code that implemented `ChildLink` by hand would break; none is known. The changeset says so.
- **`BUILT_IN_EVENT_NAMES` move**: `fsm.ts` imports it from `behavioral-fsm.ts` today. Moving it to `mount-table.ts` means `behavioral-fsm.ts` and `fsm.ts` both import from the new module, which is the direction we want. Check for a circular import: `mount-table.ts` must import only from `types.ts`, `json-safe.ts` is not needed there.
- **Vale on the plan and ADR**: each must pass at the error level before commit.

## Dependencies

None. Confined to `packages/machina` plus two root-level docs.

## Handoff Notes for Developer

- `getOrCreateClientMeta` (`:1084-1111`) is the only place a record is born with `state: undefined`. Keep that behavior; `transition`'s same-state guard depends on it.
- `canHandle` on the engine must stay side-effect free, so the table's `canHandle` takes the state name, not the client record, and never triggers initialization.
- `Fsm` constructs its `BehavioralFsm` and then reads `config.states` for its own `states` field (`fsm.ts:90-92`). The table's install walk runs in the engine constructor, so that ordering still holds.
- The `Fsm` adapter's `rehydrate`, `dehydrate` and `planRehydrate` throw. Move them unchanged.
- The fake child in Task 7 needs `MACHINA_TYPE` set to `"BehavioralFsm"` or `"Fsm"` so `createChildLink` picks an adapter. Test both kinds for scenarios 8 to 11, since the Fsm kind always resolves no client.
- `behavioral-fsm.test.ts:5993` reads `(fsm as any).emitter.listeners.size`. The engine keeps its emitter, so that test still works.
