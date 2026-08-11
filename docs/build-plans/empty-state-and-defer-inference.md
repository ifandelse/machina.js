# Build Plan: Fix States-Config Inference (#188, #189) + Typed Hierarchy Contracts (`bubbles`)

## Context Source

- GitHub issue #188 — An empty state object (`{}`) silently disables literal-type validation for the entire states config
- GitHub issue #189 — `defer({ until })` is not narrowed to the state-name union when `TStates` is inferred
- Design review artifact (approved): https://claude.ai/code/artifact/136f64cf-a9fe-40fa-be38-cfb92a26acd1
- Related (groundwork, not in scope): #183 — typed custom events for `on()`/`emit()`

This plan covers one PR with three layers, each validated in a type-level spike before this plan was written:

1. **Core fix** for #188/#189 (shared root cause in `ValidateStates` inference).
2. **D1 — child-input surfacing**: a parent's `handle()` accepts inputs handled by its `_child` FSMs (recursively).
3. **D2 — `bubbles` declarations + wiring contract**: an FSM declares inputs it fires-but-doesn't-handle; any config that mounts it via `_child` must handle or re-declare them, enforced at compile time.

They ship together because D1/D2 exist to repair what the core fix correctly breaks: configs that only compiled because #188 had disabled their input checking (the traffic-intersection example, one core test).

## Problem Summary

`ValidateStates` currently does two jobs with one type: it _validates_ the states config and it is the _inference source_ for `TStates` (TypeScript reverse-engineers `TStates` from the config object through the mapped type). Both bugs are failures of that double duty:

- **#188**: TypeScript's reverse-mapped-type inference refuses to process a state object with no inferable properties. When that happens, `TStates` silently falls back to `Record<string, Record<string, unknown>>`, `keyof TStates & string` becomes `string`, and every literal check — shorthand targets, `initialState`, `handle()` inputs, `defer({ until })` — degrades to "any string goes."
- **#189**: handler bodies are context-sensitive, so TypeScript type-checks them _before_ the self-referential `TStates` inference settles. At that moment `keyof TStates & string` is still `string`, which is what `defer`'s `until` parameter gets baked in as. Handler _return types_ are checked later (post-inference) — which is why return-target typos were caught while `defer` typos weren't.

Spike-verified corrections and extensions to the issue write-ups:

- **#188 is broader than filed**: a state whose properties are _all unannotated handler functions_ (no string shorthand — e.g. a state with only `_onEnter`/`_onExit`) breaks inference exactly like `{}`. This is the common real-world variant — it is why the traffic-intersection example currently gets zero input checking. Pins must cover it.
- #188's claim that all three call forms are affected is wrong for the explicit-both form (`createBehavioralFsm<C, typeof states>`) — a concrete `typeof states` skips inference. Covered with pins anyway.
- #188 also silently breaks `createFsm` and degrades instance-level unions (`transition()`/`handle()` parameters widen to `string`). Covered.

## Technical Approach

**The mental model shift**: one type stops doing two jobs. Each job gets the mechanism that actually works for it:

1. **Literal capture** — `TStates` is inferred from a naked intersection member (`states: TStates & ...`). Plain object-literal inference doesn't care what's inside a state, so empty and function-only states stop poisoning anything.
2. **Early state-name capture** — a new `TStateNames extends string = keyof TStates & string` parameter is inferred _keys-only_ from `ValidateStates`' `Record<TStateNames, ...>` shape. Keys-only inference lands before handler bodies are checked, so `defer({ until })`, lifecycle returns, and shorthand targets see the real literal union inside handler bodies. This fixes #189. Verified against TS 5.9.3.
3. **Validation** — `ValidateStates` becomes a `Record` keyed by `TStateNames` with named special keys plus an index signature. Every value-position reference to `TStateNames` is wrapped in `NoInfer`. **The `NoInfer` wrapping is load-bearing**: without it, shorthand _values_ become inference candidates and out-prioritize the keys — a typo'd target would add itself to the union and legalize itself (observed directly in the spike).

The final `types.ts` shapes (all spike-validated verbatim; scorecard: 13 negative pins + full must-compile suite + 12 contract scenarios):

```ts
export type ValidateStates<
    TCtx,
    TStates extends Record<string, Record<string, unknown>>,
    TStateNames extends string = keyof TStates & string,
> = Record<
    TStateNames,
    {
        _onEnter?: HandlerFn<TCtx, NoInfer<TStateNames>>;
        _onExit?: HandlerFn<TCtx, NoInfer<TStateNames>>;
        _child?: MachinaInstance;
        "*"?: HandlerFn<TCtx, NoInfer<TStateNames>>;
    } & {
        [input: string]: HandlerDef<TCtx, NoInfer<TStateNames>>;
    }
>;
```

**D1 — child-input surfacing.** A parent's config literally contains its child instances, and each instance's type carries its own input union, so `InputNamesOf` walks into `_child` values. Grandchildren come along for free (each level folded in the level below when it was created). Semantically sound: `handle()` on a parent delegates to the active child _before_ local handlers, so child inputs genuinely are the parent's inputs.

```ts
export type OwnInputNamesOf<TStates> = Exclude<
    { [S in keyof TStates]: keyof TStates[S] & string }[keyof TStates],
    SpecialStateKeys
>;

export type InputNamesOf<TStates> = OwnInputNamesOf<TStates> | ChildInputNamesOf<TStates>;

type ChildInputNamesOf<TStates> = {
    [S in keyof TStates]: TStates[S] extends { _child: infer C } ? InputNamesOfInstance<C> : never;
}[keyof TStates];
```

**D2 — `bubbles` declarations + wiring contract.** An FSM that fires an input at itself expecting a container to catch it (nohandler bubbling — the traffic-intersection `phaseComplete` pattern) declares that input at the config level:

```ts
const controller = createFsm({
    id,
    initialState: "green",
    bubbles: ["phaseComplete"], // "I fire this; whoever mounts me must deal with it"
    states: {
        /* handlers only — no fake undefined entries */
    },
});
```

Declared bubbles join the FSM's own typed input union (the self-`handle()` call compiles, typos don't) and ride the instance type as a fourth class generic `TBubbles`. A config mounting the FSM via `_child` must _cover_ them — handle them in any state, re-declare them in its own `bubbles` (passing the obligation upward), or carry a `"*"` catch-all — or compilation fails on the `_child` property with a message naming the missing inputs. The contract composes across arbitrarily many hierarchy levels and only materializes when a hierarchy forms; standalone FSMs owe nothing.

```ts
type HasCatchAll<TStates> = {
    [S in keyof TStates]: "*" extends keyof TStates[S] ? true : never;
}[keyof TStates] extends never
    ? false
    : true;

type CoverageOf<TStates, TBubbles extends string> =
    | OwnInputNamesOf<TStates>
    | TBubbles
    | (HasCatchAll<TStates> extends true ? string : never);

type UncoveredChildBubbles<
    TStates extends Record<string, Record<string, unknown>>,
    S extends string,
    TBubbles extends string,
> = TStates[S] extends { _child: infer C }
    ? Exclude<BubblesOfInstance<C>, CoverageOf<TStates, TBubbles>>
    : never;

export type ChildCoverage<
    TStates extends Record<string, Record<string, unknown>>,
    TStateNames extends string,
    TBubbles extends string,
> = {
    [S in TStateNames]: UncoveredChildBubbles<NoInfer<TStates>, S, NoInfer<TBubbles>> extends never
        ? unknown
        : {
              _child: {
                  "child bubbles up inputs this FSM neither handles nor re-declares": UncoveredChildBubbles<
                      NoInfer<TStates>,
                      S,
                      NoInfer<TBubbles>
                  >;
              };
          };
};
```

`FsmConfig` ties it together (note: NO `| undefined` in the ValidateStates index signature — an earlier draft used `input: undefined` entries as the declaration mechanism; `bubbles` supersedes it):

```ts
export interface FsmConfig<
    TCtx,
    TStates extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
    TStateNames extends string = keyof TStates & string,
    TBubbles extends string = never,
> {
    id: string;
    initialState: NoInfer<TStateNames>;
    context?: TCtx;
    bubbles?: readonly TBubbles[];
    states: TStates &
        ValidateStates<TCtx, TStates, TStateNames> &
        ChildCoverage<TStates, TStateNames, TBubbles>;
}
```

Classes gain a trailing `TBubbles extends string = never` generic (type-only; existing 3-argument annotations and extractor patterns keep working — pinned). Factories gain `TStateNames` and `TBubbles` trailing defaulted params and return `Fsm<TCtx, StateNamesOf<TStates>, InputNamesOf<TStates> | TBubbles, TBubbles>` (analog for the three `createBehavioralFsm` signatures). New extractor `BubblesOfInstance<TFsm>` reads the fourth generic.

**Runtime changes: none.** The engine never reads `bubbles`; `canHandle`/`handleLocally`/`wrapChildLinks`/`createChildLink` are untouched. The entire feature — including the hierarchy contract — is type-level.

## Key Design Decisions

- **One PR for all three layers**
    - **Why**: the core fix correctly rejects the bubble-up call in traffic-intersection and the delegated call in `fsm.test.ts` — both only compiled because of the bug. D1/D2 are the principled repairs; shipping the fix alone would force casts into a flagship example, then rip them out a PR later.

- **`Record<TStateNames, ...>` keyed by the names param, not `keyof TStates`**
    - **Why**: any mapped type keyed by `keyof TStates` re-enters the broken self-referential inference (verified: it kills contextual typing entirely — every destructured handler param goes implicit-`any`).

- **Naming: `bubbles`, not `emits`, not `delegates`**
    - `emits` collides with the existing `emit()`/`on()` event system (and #183 will want that vocabulary for typed event maps — `FsmEventMap` already exists). `delegates` names the _opposite_ direction in machina's own docs ("`_child` delegates inputs to the child first; unhandled inputs bubble up"). `bubbles` matches the codebase's vocabulary and DOM precedent (`event.bubbles`). Decided with Jim 2026-08-11.

- **Coverage is FSM-wide, not mount-state-local**
    - **Why**: a bubbled input re-dispatches against the parent's _current_ state at bubble time, which can be any state. Any state declaring the key (or the parent re-declaring in `bubbles`, or a `"*"` anywhere) counts. Matches runtime semantics exactly.

- **`MachinaInstance` stays in the `HandlerDef` union, for a new reason**
    - Its docstring cites `ValidateStates` constraint-fallback — a scenario the redesign eliminates. It's now load-bearing differently: `_child: fsmInstance` must satisfy the index signature. Update the docstring; don't remove the member.

- **Error anchors move, elaborations carry the signal**
    - Shorthand-typo errors anchor on the _state object_ line (not the property), with a chain ending in the same `TS2820`-style "Did you mean" message. Uncovered-mount errors have a noisy first line (large generic types; occasionally a misleading `TS2719 "two different types with this name"`) but the chain names the violation and the exact missing inputs. `@ts-expect-error` pins must sit on the anchor lines.

- **Known intended behavior changes** (release-note material):
    - Property-style wide `defer` annotations (`defer: (o?: { until: string }) => void`) are now rejected; the blessed `HandlerArgs<TCtx>` annotation still compiles (method-style bivariance) — pinned.
    - Configs that "worked" only because #188 disabled checking will surface their real typos as new compile errors.

## Scope Contract

**In scope**: `packages/machina/src/types.ts`; factory + class generic signatures in `fsm.ts` / `behavioral-fsm.ts` (type-level only); docstring/comment updates; test-site repairs; new type + runtime pins; traffic-intersection switch to `bubbles`; docs page updates.

**Out of scope**: any engine/runtime behavior change; #183's typed event maps (this PR lays its groundwork — post a coordination comment there, see Task 7); removing `MachinaInstance` from `HandlerDef` for non-`_child` keys (pre-existing looseness, separate concern).

## Existing Patterns to Follow

- Type pins live in `packages/machina/src/instance-types.test.ts` using `Expect<Equal<...>>` helpers and `@ts-expect-error -- reason` directives (self-verifying both directions under ts-jest).
- Each type-pin `describe` carries a trivial runtime `it` so Jest counts it.
- Docstrings on exported types are typedoc-consumed (API reference pages regenerate during the `@machina/docs` build).
- `pnpm run checks` is the CI gate. ⚠️ Turbo cascades: a red `machina#test` fails example/docs tasks that are actually fine — fix root causes, then rerun.

## Implementation Tasks

### Task 1: `types.ts` — core restructure + D1 + D2 types

- **What**: apply every shape from Technical Approach verbatim. Rewrite the stale "key trick: `keyof TStates & string` is self-referential" comment block (~line 323–335) to describe the three-mechanism split, including _why_ `NoInfer` is mandatory on value positions. Update `HandlerDef`'s docstring (`MachinaInstance` rationale; also remove the duplicated docstring block above it, ~lines 275–316). Add `BubblesOfInstance` beside the other instance extractors. Document `bubbles` thoroughly — it's new public API.
- **Done when**: `packages/machina` compiles (tests fail until Task 3 — expected).

### Task 2: `fsm.ts` + `behavioral-fsm.ts` — signatures

- **What**: classes gain trailing `TBubbles extends string = never`; `createFsm` (`fsm.ts:230`) and the three `createBehavioralFsm` signatures (`behavioral-fsm.ts:1138–1152`) gain trailing `TStateNames` + `TBubbles` defaulted params, config typed `FsmConfig<..., TStateNames, TBubbles>`, returns per Technical Approach. Internal `as FsmConfig<..., Record<string, Record<string, unknown>>>` casts unchanged (trailing params default). Update the big `createBehavioralFsm` docstring: the `@example` should show `bubbles`.
- **Done when**: `pnpm --filter machina build` passes.

### Task 3: Repair test sites that leaned on the widening bug

Verified inventory (five sites; nothing else in the monorepo breaks):

1. `instance-types.test.ts` (~line 231): move the `@ts-expect-error` for the `"onilne"` shorthand typo up one line onto `connecting: {`; note the new anchor in the directive reason.
2. `fsm.test.ts` (~line 1255): **no repair needed** — D1 makes `parent.handle("poweron")` type-check as-is. Leave the config untouched; it becomes an incidental integration test for D1.
3. `behavioral-fsm.test.ts` lines ~2166, ~2200, ~2233, ~2624: `"mystery" as any` / `"noop" as any` → `as never` (input unions are now correctly `never`/narrow, and `any` is not assignable to `never`). Convert only the failing sites; leave `unknownClient as any` (client-typed) alone.
4. `behavioral-fsm.test.ts` ~line 5286: the `go(): string` escape hatch (returns `"__proto__"` to exercise runtime `invalidstate`) → `go() { return "__proto__" as never; }`, and update the adjacent comment explaining the bypass.
5. `examples/traffic-intersection/src/fsm.ts` (~line 200 area): add `bubbles: ["phaseComplete"]` to the phase-controller config, with a comment tying it to the existing bubble-mechanism block comment above `red:`. Remove nothing else.

- **Done when**: `pnpm --filter machina test` and `pnpm --filter @machina-examples/traffic-intersection test` green.

### Task 4: Pins — acceptance criteria for both issues plus D1/D2

In `instance-types.test.ts` unless noted:

- **#188 pins**: configs with (a) an empty state `{}` AND (b) a function-only state (the broader variant from the spike — this is the one real configs hit) each keep validation: `@ts-expect-error`'d shorthand typo (anchored on the state line), invalid `initialState`, invalid `handle()` input — across curried, full-inference, and explicit-both forms, plus one `createFsm` case. Positive: `StateNamesOfInstance`/`InputNamesOfInstance` stay exact literal unions for both variants.
- **#189 pins**: replace the positive-only `defer` block (~lines 380–420) and its "genuine, pre-existing gap" NOTE with paired positive/negative pins under curried and full-inference forms; also one negative pin with `bubbles` present (inference must stay intact alongside the new param).
- **D1 pins**: `parent.handle(childInput)` and `parent.handle(grandchildInput)` compile with no casts; unknown inputs still rejected; `Equal` pin that `InputNamesOfInstance<parent>` is exactly own ∪ child ∪ grandchild inputs; BehavioralFsm-parent-over-Fsm-child variant.
- **D2 pins** (the 12 spike scenarios): covered mount compiles (handler or shorthand); uncovered mount errors at `_child`; re-declaration in own `bubbles` covers and re-exports (grandparent then owes it); bubble-free child mounts anywhere; `"*"` counts as coverage; coverage on a non-mount state counts; both Fsm and BehavioralFsm parents; `BubblesOfInstance` extracts single and multi-element unions (`never` when absent); declared bubbles join the child's own `handle()` union; bubble names do NOT become valid transition targets (`@ts-expect-error`); explicit-both + `bubbles` limitation pinned as an expected error (`Type 'string' is not assignable to type 'never'`) with a comment documenting the all-four-type-args workaround.
- **Compat pins**: `HandlerArgs<TCtx>`-annotated handler still compiles inside a narrowed config; existing 3-argument `Fsm<Ctx, S, I>` annotations and extractor patterns still work against 4-generic instances.
- **Runtime pin** (`behavioral-fsm.test.ts` or `fsm.test.ts`): an input listed in `bubbles` but unhandled → `canHandle()` false, `handle()` emits `nohandler`, and in a hierarchy it reaches the parent's handler — freezing the runtime semantics the type contract describes.
- **Done when**: all pins pass and each `@ts-expect-error` is verified live (temporarily fixing the violation must fail the suite with "unused directive").

### Task 5: Display-quality pass (timeboxed, cosmetic)

- **What**: attempt an eager-resolution wrapper on factory return types so rejected-`handle()` error text shows the flat name list instead of `InputNamesOf<{...}>` (hover types are already exact; only diagnostic text degrades). Timebox to ~an hour; if it fights back, drop it and note the wart in the PR description.
- **Done when**: either error text improves with the full suite green, or the attempt is documented and reverted.

### Task 6: Docs

- **What**: `guide/hierarchical.mdx` gains a "Declaring bubbled inputs" section (the `bubbles` property, the wiring contract, the re-declaration pass-through pattern, the traffic-intersection example). `guide/typescript`-adjacent content: note the error-anchor behavior for shorthand typos and the explicit-both + `bubbles` caveat. API reference pages regenerate via the docs build — verify `FsmConfig`/`HandlerDef`/new extractor pages render. README if it shows a config example with hierarchy.
- **Done when**: `pnpm --filter @machina/docs build` green and pages reviewed.

### Task 7: Final gate + PR + #183 coordination

- **What**: `pnpm run checks`. PR description leads with the mental-model shift (one type doing two jobs → three mechanisms), then D1/D2 as the repairs strict typing demanded, the error-anchor change, and the intended behavior changes. `Fixes #188`, `Fixes #189`. After merge, comment on #183: the `TBubbles` plumbing (trailing class generic, extractor updates, explicit-slot caveats) is the template a `TEvents` map needs, and the vocabulary is now reserved — `bubbles` = inputs passed up the hierarchy, event-map naming free for `on()`/`emit()`.
- **Done when**: checks green, PR open, #183 comment posted.

## Technical Risks

- **TypeScript-internals dependency**: correctness rests on inference-pass ordering (keys-only capture lands before context-sensitive handler checking). Validated on TS 5.9.3 (the repo's pinned toolchain). The Task 4 pins are the tripwire for future TS releases.
- **Error-message noise**: uncovered-mount errors have a noisy first line and occasionally a misleading `TS2719`; the elaboration names the missing inputs. Shorthand-typo anchors move one line up. Downstream `@ts-expect-error` users will need the same adjustment made in Task 3.
- **New generics on public classes**: trailing + defaulted, and verified non-breaking for 3-argument annotations and infer-pattern extractors — but type-level consumers doing exotic positional matching could notice. Pinned; release-note it.
- **Ecosystem code that relied on widening**: real typos in previously-unchecked configs (empty-state or function-only-state) will surface as new compile errors. That's the fix working; release-note it.

## Dependencies

None. Type-level changes within `packages/machina` plus test/example/docs adjustments.

## Handoff Notes for Developer

- Every final type shape appears **verbatim** in Technical Approach — this document is self-sufficient. A scratch mirror with the full scorecard (13 regression pins, 12 contract scenarios, probes) may exist at `/private/tmp/claude-501/-Users-jimcowart-git-oss-machina-js/<session>/scratchpad/repro/`, but `/tmp` is volatile (it was wiped once during design already) — treat the plan, not the scratchpad, as authoritative.
- Failure signatures to recognize if inference misbehaves during implementation:
    - Destructured handler params going implicit-`any` → something re-introduced a `keyof TStates`-keyed mapped type into the contextual path.
    - A state-name or bubble union containing _values_ (e.g. a typo'd target appearing as a "valid" name) → a `NoInfer` wrapper got dropped.
    - `TS2578 unused @ts-expect-error` on a typo pin → the error anchor moved; put the directive on the state-object line.
- Build order matters: Tasks 1–2 will break tests until Task 3 lands; run the suite only after all three.
