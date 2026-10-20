# Build Plan: `onDispose` lifecycle hook (#194)

## Context Source

- GitHub issue #194, "Add an `onDispose` lifecycle hook", filed by nickiv.
- Design session with Jim on 2026-10-19 and 2026-10-20. The design artifact with the decision flowcharts is at `docs/artifacts/ondispose-hook-design-2026-10-19.html`.
- Decisions Jim confirmed on 2026-10-20, all six listed under Key Design Decisions.
- Plan review on 2026-10-20, which added the mid-transition disposal task, the async acquisition docs example, the reentrancy and wrapper tests, and two wording corrections.

## Problem Summary

An FSM that acquires an instance-scoped resource such as a webcam stream, a socket, or a subscription has nowhere to release it when `dispose()` runs. `dispose()` today sets a flag and unsubscribes from child events. It then cascades to children and clears the emitter. User code never runs during it. The only workaround is a terminal state whose `_onEnter` releases the resource, plus an edge into that state from every state that can end. That welds a lifecycle concern onto the state graph.

This PR adds an optional top-level `onDispose` key to the config. The engine calls it from inside `dispose()`, once per live client, before the existing teardown. For an `Fsm` that means one call with the context. For a `BehavioralFsm` it means one call per client the FSM has initialized or rehydrated and that is still reachable. The only other engine change is a disposed re-check inside `transition()`, described below.

## Technical Approach

The hook is stored on `BehavioralFsm`, which already defines the teardown and the client registry. `Fsm` wraps a `BehavioralFsm` with its context as the one client, so the `Fsm` factory gets the feature through the existing delegation. `Fsm.dispose()` only gains an early-return guard and a `finally` around its delegate call.

The per-client walk reuses the `knownClients` iteration that the nohandler relay already performs at `behavioral-fsm.ts:797`. Each `WeakRef` is dereferenced. A dead ref is deleted from the set, which is the existing idiom. A live client gets `onDispose(buildHandlerArgs(client, "", meta))`, the same args construction `_onExit` uses at `behavioral-fsm.ts:258`.

The hook parameter type is `Pick<HandlerArgs<NoInfer<TCtx>>, "ctx" | "emit">`. The runtime passes the full object that `buildHandlerArgs` returns, so the engine has one args builder. TypeScript rejects `defer` and `inputName` inside an `onDispose` body, because neither has a meaning during teardown. `NoInfer` keeps `context` as the only inference site for `TCtx`, the same guard `initialState` uses for `TStateNames`.

Error handling collects instead of aborting. A throwing hook for one client must not skip the remaining clients or the teardown. Each hook call and each child `dispose()` call runs inside its own `try`/`catch` that pushes the error onto a local array. After `emitter.clear()`, a non-empty array becomes one `AggregateError` thrown to the caller. The ES2022 target already includes `AggregateError`.

Proposed `dispose()` order on `BehavioralFsm`, as pseudocode:

```
dispose(options):
  if disposed: return
  disposed = true
  errors = []
  if onDispose:
    for ref of knownClients:
      client = ref.deref()
      if !client: knownClients.delete(ref); continue
      meta = clients.get(client)
      if !meta: continue
      try: onDispose(buildHandlerArgs(client, "", meta))
      catch e: errors.push(e)
  for sub of childSubscriptions: sub.off()
  if !options.preserveChildren:
    for each unique childLink:
      try: childLink.dispose()
      catch e: errors.push(e)
  emitter.clear()
  if errors.length: throw new AggregateError(errors, `FSM "${id}": onDispose failed`)
```

The flag is set before the hook runs. Because the flag is already set, `handle()`, `transition()`, and `reset()` from inside the hook are silent no-ops, which matches the documented contract for a disposed FSM. `emit()` inside the hook still delivers, because the hook runs before `emitter.clear()` and the args' `emit` closure writes to the emitter directly.

### Disposal during a transition

`transition()` at `behavioral-fsm.ts:219` checks the disposed flag once on entry. After `_onExit` returns, the engine writes the new state and emits `transitioning`. It then runs `_onEnter` and emits `transitioned`. After that it resets the target state's child, replays the deferred queue, and finally bounces. A `dispose()` call from inside `_onExit` or from a `transitioning` listener runs the hook, and the transition then continues into `_onEnter`, which can acquire a fresh resource after the hook released the old one. With `preserveChildren`, the child reset also runs the surviving child's `_onEnter`.

The later steps already stop on their own. `dispatch()` and `transition()` return early when disposed, and the emitter is empty. The hole is the stretch from `_onExit` through the child reset. Three re-checks close it, each a plain `if (this.disposed) { return; }`:

1. After `_onExit` returns and before `meta.state = toState`.
2. After the `transitioning` emit and before `_onEnter`.
3. After `_onEnter` returns and before the `transitioned` emit and the child reset. The replay and bounce paths are already guarded, but `childLink.reset()` is not, and with `preserveChildren` it would reset a surviving child under a dead parent.

The documented contract is that a callback which calls `dispose()` runs to completion, and the engine stops the transition when that callback returns. The `finally` that decrements `transitionDepth` still runs. This is a behavior change only for code that disposes from inside `_onExit` or a `transitioning` listener and relied on the target state's `_onEnter` running afterward. The changeset states it.

## Key Design Decisions

- **Decision**: `dispose()` does not run `_onExit` on the current state. The docs describe the split instead.
    - **Why**: Every `_onExit` handler in the wild assumes a transition follows. Running it during teardown changes that contract and would need a major release. The connectivity example's interval, cleared in `_onExit`, stays a caller responsibility. The documented pattern is one explicit transition to a terminal state before `dispose()`.
    - **Trade-off**: State-scoped resources still leak when a caller disposes mid-state without that transition.

- **Decision**: The key is spelled `onDispose`, at the top level of the config.
    - **Why**: The `_` prefix on `_onEnter`, `_onExit`, and `_child` keeps hook names out of the input-name space inside `states`. The top level has no such collision, and `id` and `bubbles` already live there. The spelling matches the issue.

- **Decision**: The parameter type is `Pick<HandlerArgs<NoInfer<TCtx>>, "ctx" | "emit">`.
    - **Why**: `defer()` is a no-op outside a `handle()` call, except when `dispose()` is called from inside a handler. In that case `meta.currentActionArgs` is set, and a `defer()` inside the hook would push an entry with an empty input name onto a dying queue and emit a `deferred` event. The narrowed type removes the question. `inputName` would always be the empty string.
    - **Trade-off**: A reader comparing the hook to `_onEnter` sees a different parameter type. The docstring explains why.

- **Decision**: The parent's hook runs before the child cascade.
    - **Why**: Each level acquires its own resources, and the order between levels rarely affects them. Parent-first keeps the hook adjacent to the `disposed` flag and ahead of every step that discards state.

- **Decision**: Per-client `catch`, then one `AggregateError` after teardown.
    - **Why**: A `BehavioralFsm` can have thousands of clients. One throwing hook must not leave the rest unreleased, and it must not leave listeners or children alive. The caller still sees every failure.
    - **Trade-off**: The caller receives an `AggregateError` even for one failure. Consistency over a special case.

- **Decision**: No built-in `disposed` event in this PR.
    - **Why**: The issue does not need it, and the house rule is one concern per PR.

- **Decision**: `transition()` re-checks the disposed flag before the state write, before `_onEnter`, and before the child reset.
    - **Why**: Without the re-checks, a `dispose()` call from `_onExit` or a `transitioning` listener lets `_onEnter` acquire a resource after the hook ran. The hook's contract, "no user hook runs after `onDispose`", depends on those re-checks.
    - **Trade-off**: A behavior change for code that disposes from `_onExit` and relied on the target `_onEnter`. That pattern has no sensible use, and the changeset names it.

- **Decision**: The engine guarantees at most one hook call per tracked live client per instance. It doesn't promise cleanup for a client the collector has already reclaimed.
    - **Why**: The registry holds `WeakRef`s by design. A timer keeps its client alive only when the callback closes over the client. When the callback does not reference the client, the interval keeps running after collection with nothing left to clear it, and a media stream stored on that client leaks the same way. The docs state the guarantee and the limit plainly.
    - **Assumption**: Callers who need cleanup for every client keep a strong reference to each client until they transition it to a terminal state or call `dispose()`.

## Scope Contract

- **In scope**: `packages/machina/src/types.ts`, `packages/machina/src/behavioral-fsm.ts` including the `transition()` re-checks, `packages/machina/src/fsm.ts`, the three test files beside them, the docs guide pages listed in Task 6, `packages/machina/README.md`, `AGENTS.md` (the target of the `CLAUDE.md` symlink), one changeset.
- **Out of scope**: `machina-react`, `machina-test`, `machina-inspect`, `eslint-plugin-machina`, every example. A `release(client)` API for per-client teardown. A public `isDisposed()` accessor. `Symbol.dispose` support. A `disposed` event. Any change to what `_onExit` does. An asynchronous disposal API.
- **New dependencies**: none.

## Existing Patterns to Follow

- `buildHandlerArgs(client, "", meta)` is how lifecycle hooks get their args. Reuse it unchanged.
- The `knownClients` walk with `deref()` and dead-ref deletion at `behavioral-fsm.ts:797` and `behavioral-fsm.ts:829`.
- The shared-child dedup by `childLink.instance` in the existing `dispose()` at `behavioral-fsm.ts:699`. Keep it.
- `NoInfer` on config members that must not become inference sites, as on `initialState`.
- Tests execute the method under test in `beforeEach` and assert in `it`. Read `.ai/UnitTestGeneration.md` before writing any test. The existing `describe("dispose")` blocks at `fsm.test.ts:630` and `behavioral-fsm.test.ts:782` show the local naming style.
- Type pins live in `instance-types.test.ts` with `@ts-expect-error -- reason` directives and a trivial runtime `it` per block.
- Every exported type and config member carries a typedoc docstring. The API reference regenerates during the docs build.
- Prose in `.md` and `.mdx` files must pass Vale at the error level. Run `vale <file>` before committing docs.

## Implementation Tasks

### Task 1: `types.ts`, the config member

- **What**: Add `onDispose?: (args: Pick<HandlerArgs<NoInfer<TCtx>>, "ctx" | "emit">) => void` to `FsmConfig`, after `bubbles`. The docstring states when it runs and that the engine calls it at most once per tracked live client per instance. It explains the narrowed args, the synchronous contract, the terminal-state pattern for state-scoped cleanup, and the tolerance requirement. A terminal state's `_onEnter` can release the resource before `dispose()` runs, and the hook must handle an already-released resource. Update the `HandlerArgs` module comment so the hook list reads `_onEnter`, `_onExit`, and `onDispose`.
- **Done when**: `pnpm --filter machina build` passes and the generated `.d.ts` shows the member.

### Task 2: `behavioral-fsm.ts`, the `dispose()` rewrite

- **What**: Store the hook from the config in the constructor as a private readonly field. Rewrite `dispose()` to the order in Technical Approach: early return, flag, per-client hook loop with per-client `catch`, child unsubscribe, per-child `catch` around the cascade, `emitter.clear()`, then the `AggregateError`. Update the method docstring. The comment above the hook loop explains why the flag is set first and why the loop catches per client.
- **Done when**: the existing dispose tests in `behavioral-fsm.test.ts` still pass.

### Task 3: `behavioral-fsm.ts`, the `transition()` re-checks

- **What**: Add the three `if (this.disposed) { return; }` checks described under Disposal during a transition: one after `_onExit` returns and before `meta.state = toState`, one after the `transitioning` emit and before `_onEnter`, and one after `_onEnter` returns and before the child reset. Each gets a one-line comment that states which callback can dispose at that point. Update the `transition()` docstring, which currently reads "No-ops when disposed", to say that a disposal inside a lifecycle hook or listener ends the transition after that callback returns.
- **Done when**: the existing transition tests still pass, and the three regression scenarios in Task 5 (scenarios 14 to 16) pass.
- **Review follow-up (2026-10-20)**: the PR review found two more continuation paths. The third check moved to after the `transitioned` emit, so a `transitioned` listener that disposes with `preserveChildren` cannot trigger the child reset. `dispatch()` re-checks the flag after lazy client initialization, and `handleLocally()` re-checks it after the `handling` emit. A disposed FSM no longer runs the handler for the input that was in flight. Each path has a regression test.

### Task 4: `fsm.ts`, the wrapper

- **What**: `Fsm.dispose()` gains an early return on its own flag and wraps `this.bfsm.dispose(options)` in `try`/`finally` so `this.emitter.clear()` runs even when the delegate throws. The rest of the method stays as it is. The `createFsm` docstring gains one sentence pointing at `onDispose`.
- **Done when**: the existing dispose tests in `fsm.test.ts` still pass.

### Task 5: Tests

- **What**: New `describe` blocks in `fsm.test.ts` and `behavioral-fsm.test.ts`, following `.ai/UnitTestGeneration.md`. Fixtures use the house domains, traffic light or connectivity, with a fake resource on the context or client. The fixtures keep a strong reference to each client until the assertions finish. One scenario per branch:
    1. Hook runs once with the context on `Fsm.dispose()`.
    2. Hook runs once per initialized client on `BehavioralFsm.dispose()`. A client the FSM has not initialized doesn't get a call.
    3. A rehydrated client gets the call.
    4. A second `dispose()` call does not run the hook again.
    5. `emit()` inside the hook delivers to a subscriber registered before `dispose()`.
    6. `handle()` and `transition()` inside the hook don't change the client's state.
    7. `currentState(client)` inside the hook returns the client's last state.
    8. The parent hook runs before the child's hook, with the call order asserted through one shared mock.
    9. `preserveChildren: true` skips the child's hook.
    10. One throwing hook among three clients. The other two hooks still run, and teardown still clears listeners and disposes children. The caller receives an `AggregateError` whose `errors` array holds the thrown error.
    11. A throwing child `dispose()` among three children. The later two children still dispose, and the error is collected the same way.
    12. `dispose()` called from inside a handler runs the hook once and does not emit `deferred`.
    13. A config without `onDispose` disposes exactly as before.
    14. `dispose()` called from inside `_onExit`. The hook runs, the state write is skipped, the target state's `_onEnter` never runs, and `currentState()` reports the state the FSM was leaving.
    15. `dispose()` called from a `transitioning` listener, with `preserveChildren: true` and a child on the target state. The target `_onEnter` never runs and the child is not reset.
    16. `dispose()` called from inside `_onEnter`, where `_onEnter` also returns a bounce target and the deferred queue contains an input for the target state. The engine skips the child reset, the queue replay, and the bounce.
    17. The hook calls `dispose()` again on its own FSM. The inner call returns at once, the outer call continues, and a later client's hook still delivers an `emit()` to a subscriber.
    18. A throwing hook through the `Fsm` wrapper. The `AggregateError` reaches the caller, and afterward `on()` returns a no-op subscription and `emit()` delivers nothing.
        Type pins in `instance-types.test.ts`: `defer` and `inputName` are rejected inside the hook body, an annotated `ctx` parameter in the hook does not change the inferred context type, and the hook compiles on both factories including the curried forms.
- **Done when**: `pnpm --filter machina test` passes and each `@ts-expect-error` fails the suite when its violation is removed.

### Task 6: Docs

- **What**:
    - `guide/concepts.mdx`: the Lifecycle Hooks section gains `onDispose`. The Disposal section gains the split between `_onExit` and `onDispose`, the terminal-state pattern, the tolerance sentence, the synchronous sentence, the "no cleanup for collected clients" sentence, and the mid-transition rule: a callback that disposes runs to completion and the transition stops after it.
    - `guide/fsm.mdx`: the Config section lists the key. The `dispose` section shows the hook and the `AggregateError` behavior. It also includes the async acquisition example from the Before and After section below, where a late `getUserMedia()` result checks the `closed` flag before storing the stream.
    - `guide/behavioral-fsm.mdx`: the API table row for `dispose()` mentions per-client hook calls. A short subsection explains that whole-instance `dispose()` runs at shutdown and that a client ending is a state, with the terminal-state pattern for per-client release. It states the guarantee: at most one call per tracked live client, and no call for a collected client.
    - `packages/machina/README.md`: the `dispose(options?)` row mentions the hook. CLAUDE.md line 61 adds `onDispose` to the lifecycle hooks line.
    - Each file passes `vale` at the error level.
- **Done when**: `pnpm --filter @machina/docs build` passes and the API reference page for `FsmConfig` shows the member.

### Task 7: Changeset, gate, PR

- **What**: `.changeset/ondispose-hook.md` with `"machina": minor`, written in the style of the existing changesets. It describes the hook, the `AggregateError` contract, and the `transition()` re-checks as a behavior change for code that disposes from `_onExit`. Run `pnpm run checks`. Open the PR from a `feat/ondispose-hook` branch. The description leads with the mental model shift: resource lifetime picks the hook, state-scoped in `_onExit`, instance-scoped in `onDispose`. It states the `_onExit` decision and the `AggregateError` contract. `Fixes #194`.
- **Done when**: checks pass and the PR is open.

## Technical Risks

- **WeakRef timing**: A client whose last strong reference dropped gets 0 or 1 hook calls depending on when the collector runs, never 2. A test that drops a reference and asserts an exact count will flake. Task 5 scenarios hold strong references throughout.
- **Hook order across clients**: `knownClients` iterates in first-seen order. The docs promise no order.
- **`AggregateError` surprise**: Callers who wrap `dispose()` in `try`/`catch` and inspect `error.message` get the aggregate message. The changeset calls this out.
- **`transition()` re-checks**: A behavior change for code that disposes from `_onExit` or a `transitioning` listener and relied on the target `_onEnter`. The changeset calls this out.
- **Async acquisition**: A request started in `_onEnter` can resolve after `dispose()`. The hook cannot cancel it. The docs example with the `closed` flag is the mitigation, and it is the caller's responsibility.
- **Docs prose gate**: Every new sentence must pass Vale at the error level. Budget time for the rewrite loop.

## Dependencies

None. The change is confined to `packages/machina` plus docs.

## Handoff Notes for Developer

- `Fsm` has no separate hook field. Its config flows through to the `BehavioralFsm` constructor unchanged, and its context is the one entry in `knownClients`.
- `currentState(client)` reads the WeakMap directly and ignores the disposed flag, so it works inside the hook.
- `rehydrate()` adds to `knownClients` at `behavioral-fsm.ts:489` and `behavioral-fsm.ts:528`. Scenario 3 in Task 5 depends on that.
- `dehydrate()` has no disposed guard by design. Leave it alone.
- In `transition()`, the state write happens before the `transitioning` emit. The docstring lists them in the other order. Leave the order alone, and place the first re-check before the write.
- The with-react example skips `dispose()` in effect cleanup because of StrictMode. The hook makes that question more likely to come up in `machina-react`, and it is out of scope here. Mention it in the PR description under follow-ups.
- The design artifact's "Your decisions" panel records the six confirmed choices. The artifact is a local file and is not published.

## Before and After: the issue's example

The issue submitted this sketch of the API it wanted:

```ts
const fsm = createFsm({
    id: "camera",
    initialState: "init",
    context: {
        stream: null
    },
    onDispose({ ctx }) {
        if (ctx.stream)
            ctx.stream.getTracks().forEach(track => track.stop());
    },
    states: {
        init: {
            _onEnter({ ctx }) {
              navigator.mediaDevices
                .getUserMedia(mediaConstraints)
                .then((stream) => {
                  ctx.stream = stream;
                  ...
                })
            },
        },
    },
});
```

After this plan, the same FSM looks like this. It compiles against the new `FsmConfig` and follows the repo's code style. It also handles the context type and the late `getUserMedia()` result, which the sketch leaves open.

```ts
import { createFsm } from "machina";

const mediaConstraints = { video: true, audio: false };

const camera = createFsm({
    id: "camera",
    initialState: "init",
    context: {
        // `null as MediaStream | null` widens the inferred context type.
        // The sketch's `stream: null` infers `{ stream: null }`, and the
        // later assignment of a MediaStream would be a type error.
        stream: null as MediaStream | null,
        // Set by onDispose. getUserMedia() can resolve after dispose(), and
        // the hook cannot cancel it. The late result checks this flag and
        // stops its own tracks.
        closed: false,
    },
    onDispose({ ctx }) {
        ctx.closed = true;
        if (ctx.stream) {
            ctx.stream.getTracks().forEach(track => track.stop());
            // Clearing the field makes a second release harmless, which the
            // hook contract requires.
            ctx.stream = null;
        }
    },
    states: {
        init: {
            _onEnter({ ctx }) {
                navigator.mediaDevices
                    .getUserMedia(mediaConstraints)
                    .then(stream => {
                        if (ctx.closed) {
                            stream.getTracks().forEach(track => track.stop());
                            return;
                        }
                        ctx.stream = stream;
                        camera.handle("ready");
                    })
                    .catch(() => {
                        camera.handle("failed");
                    });
            },
            ready: "streaming",
            failed: "error",
        },
        streaming: {
            stop: "idle",
        },
        idle: {
            start: "init",
        },
        error: {},
    },
});

// When the screen or component goes away:
camera.dispose();
```

What `camera.dispose()` does, in order:

1. Sets the disposed flag. Every later `handle()`, `transition()`, and `reset()` call is a silent no-op, including the `camera.handle("ready")` inside a late `.then`.
2. Calls `onDispose` once with `{ ctx, emit }`. The hook sets `ctx.closed`, then stops the tracks and clears `ctx.stream`.
3. Clears every `on()` subscription.
4. Throws an `AggregateError` only if the hook threw.

What changed versus the sketch:

- The hook receives `ctx` and `emit` only. A `defer()` call or an `inputName` read inside it is a compile error.
- The context declares `MediaStream | null`, which the sketch needed anyway.
- The `closed` flag covers a `getUserMedia()` result that arrives after disposal. The sketch would store that stream on a disposed FSM and never stop it.
- Braces on every conditional and arrow functions throughout, per the repo's code style.
- The `done` terminal state the issue described as the workaround is gone. The state graph contains only camera states.
