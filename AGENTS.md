# machina.js

Focused finite state machine library for JavaScript and TypeScript. States in, states out.

- **Repo**: https://github.com/ifandelse/machina.js
- **Docs**: https://machina-js.org
- **Version**: 7.0.0
- **License**: MIT

## Architecture

Monorepo managed by pnpm workspaces + Turborepo:

```
packages/
  machina/          # Core library (npm: "machina")
    src/
      index.ts          # Public exports
      types.ts          # All type definitions (no runtime code)
      fsm.ts            # Fsm class + createFsm factory
      behavioral-fsm.ts # BehavioralFsm class + createBehavioralFsm factory
      emitter.ts        # Minimal event emitter
      *.test.ts         # Tests live alongside source
  machina-inspect/  # Static analysis — graph IR + structural checks
  machina-test/     # Jest/Vitest custom matchers for FSM testing
  eslint-plugin-machina/ # ESLint plugin wrapping machina-inspect
  docs/             # Astro Starlight documentation site
examples/           # Working examples (connectivity, dungeon-critters, etc.)
```

The core library is ~1000 lines of TypeScript across 5 files.

## Build / Test / Lint

```bash
pnpm install                          # Install dependencies
pnpm build                            # Build all packages (turbo)
pnpm test                             # Run all tests (turbo → jest)
pnpm lint                             # Lint all packages (turbo → eslint)
pnpm run checks                       # lint + test + build (CI gate)

# Package-level (from packages/machina/)
pnpm --filter machina test             # Run core lib tests only
pnpm --filter machina build            # Build core lib only (tsdown)
pnpm --filter machina test -- --watch  # Watch mode
```

Build tooling: **tsdown** (bundles to CJS + ESM + .d.ts), **Jest** with ts-jest, **ESLint 9**, **Prettier**, **Husky** pre-commit hooks with lint-staged.

TypeScript 5.9+, target ES2022, strict mode.

## Core Concepts

Two factory functions, one mental model:

- **`createFsm(config)`** — single-client FSM. Owns its context object. Use for one instance of a thing.
- **`createBehavioralFsm<TClient>()(config)`** — multi-client FSM. State tracked per-client in a WeakMap, nothing stamped on client objects. One FSM definition, many independent clients. Curried: `TClient` can't be inferred from the config, so it's fixed by the first (zero-arg) call, then the returned function infers everything else from `config`.

**Handlers** receive `{ ctx, inputName, defer, emit }` as a destructured first argument (no `this` binding). Return a state name string to transition; return nothing to stay put. String shorthand (`timeout: "yellow"`) handles the always-transition case.

**Lifecycle hooks**: `_onEnter(args)` fires on state entry (can return a state name to "bounce"). `_onExit(args)` fires on state exit. Both receive the same args object as regular handlers.

**Child FSMs**: `_child: fsmInstance` on a state delegates inputs to the child first — `canHandle()` answers for the entire `_child` chain, so delegation reaches any depth and the deepest handler wins over ancestors. Unhandled inputs bubble up. `compositeState()` returns the dot-delimited path (e.g. `"active.uploading.retrying"`). Children auto-reset when the parent re-enters their state.

**Bubbled inputs**: `bubbles: ["someInput"]` on a config declares inputs the FSM fires at itself but never handles, expecting a container to catch them. Declared bubbles join the FSM's typed input union, and any config mounting it via `_child` must handle or re-declare them (or carry a `"*"`) or it fails to compile. Type-level only — the engine never reads `bubbles`.

**Input payload maps**: `createFsm<TInputs>()(config)` and `createBehavioralFsm<TClient, TInputs>()(config)` fix a map of input name → argument tuple before config inference starts. Handler payload parameters are inferred from the map, `handle()` enforces payloads at the call site, and the map is the complete input vocabulary — undeclared handler keys, undeclared `bubbles` entries, and wrong payloads are compile errors. Type-only; the engine never reads it. `InputMapFromUnion` derives a map from a discriminated event union. `InputMapOfInstance` extracts it from an instance (machina-test's `walkAll` uses this to require typed payload generators). One known limit: a forwarder that takes a whole event union and calls `handle(event.type, event)` does not compile — TypeScript cannot correlate the two unions; narrow with a `switch` or cast the payload.

**Deferred input**: `defer()` in a handler queues the current input for replay after the next transition. `defer({ until: "stateName" })` targets a specific state.

**Events**: `transitioning`, `transitioned`, `handling`, `handled`, `nohandler`, `invalidstate`, `deferred`. Subscribe with `fsm.on(event, cb)` which returns `{ off() }`. BehavioralFsm event payloads include a `client` field.

## Code Style

- Always use curly braces on conditionals, even single-line bodies. No braceless `if (x) return;`.
- Strict equality only (`===`, `!==`). No loose `==` / `!=`. Prefer falsy checks (`!handler`) over `== null`.
- Arrow functions throughout. No `function` keyword in new code.
- Comments explain _why_, not _what_.
- ESM imports. The library ships CJS + ESM via tsdown.

## Common Gotchas

- **`this` is not the FSM inside handlers.** Handlers receive `{ ctx }` — `ctx` is the context (Fsm) or client (BehavioralFsm). This is intentional and the biggest change from v4.
- **BehavioralFsm shares the FSM instance across all clients.** Per-user/per-client data MUST go on the client object (`ctx`), not on the FSM. Storing timers, flags, or counters on `this` inside a BehavioralFsm handler is always a bug.
- **All FSM methods are synchronous.** Async work happens outside — kick off the fetch/timer in `_onEnter`, then call `handle()` or `transition()` when it resolves.
- **`_onEnter` can return a state name** to immediately bounce to another state. `_onExit` return values are ignored.
- **String shorthand targets are validated at compile time.** `timeout: "yellw"` is a type error, not a runtime surprise.
- **Transition depth is capped at 20** to catch infinite `_onEnter → transition` loops.

## PR Guidelines

- Run `pnpm run checks` (lint + test + build) before submitting.
- Keep PRs focused. One concern per PR.
- Tests live in `*.test.ts` files alongside the source they test.

## Prose Linting

Vale checks every Markdown file in this repo, through the just-say-so hooks in a session, at pre-commit, and in CI. Policy and scope:

- **Only the lines you add are judged.** Legacy alerts on untouched lines never block anything.
- **Error-level alerts block.** They stop the end of your turn (Stop gate), the commit, and the CI job. Warnings and suggestions are advice.
- **A legitimate domain term that gets flagged** belongs in the vocabulary: `.vale/styles/config/vocabularies/Machina/accept.txt`, one term per line. The `/just-say-so:allow` command writes there too.
- **Do not change rule levels in `.vale.ini` to pass a check.** Levels encode calibration decisions, and each override carries a comment with its evidence. Propose the change to the user instead.
