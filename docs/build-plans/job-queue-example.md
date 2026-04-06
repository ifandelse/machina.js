# Build Plan: Job Queue Example

## Context Source

Product brief: `docs/briefs/job-queue-example.md`

## Problem Summary

machina v6 added `rehydrate()` to BehavioralFsm — a method for silently restoring a previously-serialized client to a known state without triggering lifecycle hooks or events. There's no runnable example in the codebase demonstrating the persist/restore pattern. Developers discovering `rehydrate` have no reference implementation showing how to serialize state, persist it, and cold-resume clients after a page reload.

This example fills that gap: a simulated job queue where jobs are BehavioralFsm clients, state is auto-persisted to localStorage on every transition, and page refresh restores all jobs via `rehydrate()`. The centerpiece teaching moment is that `rehydrate()` is silent — `_onEnter` doesn't fire — so the app must explicitly re-establish side effects (timers) for in-flight jobs.

## Technical Approach

A single `BehavioralFsm<JobClient>` drives all jobs. Each job is a plain object (the client) with its own progress, step count, and metadata. The FSM definition has five flat states: `queued`, `processing`, `paused`, `failed`, `completed`. No child FSMs, no hierarchy.

On every `transitioned` event, `main.ts` serializes all active jobs and their current states to localStorage. On page load, `main.ts` reads localStorage, reconstructs job client objects, calls `fsm.rehydrate(job, savedState)` for each, and then calls `fsm.handle(job, "resume")` for any job in the `processing` state to restart its timer. This two-step restore (rehydrate + resume) is the key pattern the example teaches.

The UI is vanilla DOM manipulation: a job list where each job is a card showing its state, progress, and contextual action buttons. A "restored from storage" badge appears on rehydrated jobs. A banner summarizes how many jobs were restored. A "Clear Storage" button wipes localStorage and resets the UI to demonstrate the contrast.

## Key Design Decisions

- **`resume` input on `processing` state for post-rehydrate timer restart**
    - **Why**: Keeps side-effect knowledge inside the FSM definition. After `rehydrate()` (which skips `_onEnter`), `main.ts` dispatches `resume` to restart the timer. This is the teaching moment — it shows developers that rehydrate is silent and the app owns re-establishing side effects.
    - **Trade-off**: Slightly more complex than just calling `_onEnter` manually, but avoids reaching into FSM internals and demonstrates a real-world pattern.

- **State persisted alongside client, not on it**
    - **Why**: `rehydrate()` takes state as a separate argument (`fsm.rehydrate(client, state)`). The serialized shape stores `state` as a sibling field, not a property of the client object. This matches the API's design and avoids polluting the client.
    - **Trade-off**: Slightly more code in the serialize/deserialize path, but accurately represents the BehavioralFsm mental model (state is in the WeakMap, not on the client).

- **Random failure chance during processing**
    - **Why**: Demonstrates the `failed` → `retry` → `processing` cycle. Random chance (configurable in `config.ts`) keeps the demo interesting without being deterministic.
    - **Trade-off**: Less predictable for scripted demos, but more realistic and engaging for exploration.

- **Configurable step duration and step count**
    - **Why**: Lets the viewer slow down or speed up the demo. Default should be slow enough to observe (~2 seconds per step), fast enough to not bore (~5 steps total, ~10 seconds per job).
    - **Trade-off**: One more thing in config, but trivial complexity.

- **Job cap of 20**
    - **Why**: Prevents localStorage bloat and keeps the UI manageable. "Add Job" button disables at cap.
    - **Trade-off**: Arbitrary limit, but reasonable for a demo.

## Existing Patterns to Follow

- **File structure**: `src/fsm.ts`, `src/config.ts`, `src/ui.ts`, `src/main.ts`, `src/style.css`, `src/fsm.test.ts` — matches shopping-cart, connectivity, etc.
- **Package naming**: `@machina-examples/job-queue` with `"machina": "workspace:*"` dependency.
- **Vite config**: Identical to other examples — `umami()` + `workspaceSource()` plugins.
- **`main.ts` as wiring only**: Subscribe to FSM events, delegate to `ui.ts`, wire DOM events to `fsm.handle()`. No business logic, no DOM manipulation.
- **`ui.ts` as pure DOM**: Functions accept data, return cleanup functions. No FSM knowledge. `textContent` only (no `innerHTML` interpolation).
- **`config.ts` as single source of truth**: State name constants, input name constants, display labels, timing values, type definitions.
- **`fsm.ts` with factory function**: `createJobQueueFsm()` for test isolation, plus a default export instance.
- **Let hoisting for timer closures**: Same pattern as connectivity and shopping-cart for self-referencing FSM in timer callbacks.
- **Event subscription pattern**: `handling` captures `inputName`, `transitioned` triggers UI updates and persistence.
- **Cleanup on `beforeunload`**: `.off()` all subscriptions, `fsm.dispose()`.

## Implementation Tasks

### Task 1: Project Scaffolding

- **What**: Create the `examples/job-queue/` directory with all boilerplate files: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, and empty source stubs.
- **Files**: Create:
    - `examples/job-queue/package.json`
    - `examples/job-queue/tsconfig.json`
    - `examples/job-queue/vite.config.ts`
    - `examples/job-queue/index.html`
    - `examples/job-queue/src/main.ts` (stub)
    - `examples/job-queue/src/fsm.ts` (stub)
    - `examples/job-queue/src/ui.ts` (stub)
    - `examples/job-queue/src/config.ts` (stub)
    - `examples/job-queue/src/style.css` (empty)
- **Basic Tests**: `pnpm install` succeeds, `pnpm --filter @machina-examples/job-queue dev` starts without errors.
- **Done when**: Vite dev server starts and serves a blank page.

### Task 2: Config and Types

- **What**: Define all constants, types, and configuration values for the job queue domain.
- **Files**: `examples/job-queue/src/config.ts`
- **Contents**:
    - State name constants: `STATE_QUEUED`, `STATE_PROCESSING`, `STATE_PAUSED`, `STATE_FAILED`, `STATE_COMPLETED`
    - State union type: `JobState`
    - Input name constants: `INPUT_START`, `INPUT_PAUSE`, `INPUT_RESUME`, `INPUT_RETRY`, `INPUT_TICK`
    - `JobClient` interface: `{ id: number, name: string, currentStep: number, totalSteps: number, timer: ReturnType<typeof setTimeout> | null, createdAt: string, restoredFromStorage: boolean }`
    - `PersistedJob` interface (serialization shape, excludes `timer`, includes `state`)
    - `StorageShape` interface: `{ nextId: number, jobs: PersistedJob[] }`
    - Timing constants: `STEP_DURATION_MS` (default 2000), `FAILURE_CHANCE` (default 0.15)
    - Limits: `MAX_JOBS` (20), `TOTAL_STEPS` (5)
    - Display labels: `STATE_LABELS`, `STATE_DESCRIPTIONS`
    - localStorage key constant: `STORAGE_KEY`
- **Basic Tests**: Types compile, constants are importable.
- **Done when**: All types and constants exported, no compile errors.

### Task 3: FSM Definition

- **What**: Implement the BehavioralFsm that drives all job clients.
- **Files**: Create `examples/job-queue/src/fsm.ts`, create `examples/job-queue/src/fsm.test.ts`
- **FSM states**:
    - `queued`: Handlers: `start` → transitions to `processing`.
    - `processing`: `_onEnter` starts a repeating timer that dispatches `tick`. `tick` handler: increment `currentStep`, check for random failure (→ `failed`), check for completion (→ `completed`), otherwise stay. `pause` → `paused`. `resume` handler: restarts the timer without leaving state (post-rehydrate path). `_onExit` clears timer.
    - `paused`: `resume` → `processing` (triggers `_onEnter`, starts timer).
    - `failed`: `_onEnter` clears timer. `retry` → resets `currentStep` to 0, transitions to `processing`.
    - `completed`: Terminal. `_onEnter` clears timer. No handlers.
- **Factory function**: `createJobQueueFsm()` returns a new instance. Module also exports a default `fsm` instance.
- **Let hoisting**: For the FSM variable, so timer closures can call `fsm.handle(client, "tick")`.
- **Basic Tests** (`fsm.test.ts`):
    - Job transitions through `queued` → `processing` → `completed` (mock timer or test step-by-step with manual `tick`)
    - `pause` from `processing` → `paused`, `resume` from `paused` → `processing`
    - `retry` from `failed` → resets step and goes to `processing`
    - `resume` in `processing` state doesn't transition (stays in `processing`, restarts timer)
    - Timer is cleared on `_onExit` from `processing`
    - `rehydrate()` places client in correct state, no events fired
    - `resume` after `rehydrate` into `processing` restarts the timer
    - Stale state rehydration throws (try/catch pattern)
- **Done when**: All tests pass, FSM is fully functional without UI.

### Task 4: UI Module

- **What**: Build all DOM rendering and interaction functions.
- **Files**: `examples/job-queue/src/ui.ts`
- **Functions**:
    - `renderJobList(jobs, states, onAction)` — renders all job cards. Each card shows: job name, state badge (color-coded), progress bar (when processing — `currentStep / totalSteps`), "restored" badge (if `restoredFromStorage`), contextual action button (Start/Pause/Resume/Retry based on state).
    - `renderRestoredBanner(count)` — shows "N jobs restored from localStorage" banner at top. Auto-dismisses after a few seconds or on user interaction.
    - `renderEmptyState()` — shows placeholder when no jobs exist.
    - `updateJobCard(job, state)` — updates a single card without re-rendering the whole list (for progress ticks).
    - `initAddJobButton(onClick)` — wires "Add Job" button, returns cleanup function. Disables at job cap.
    - `initClearStorageButton(onClick)` — wires "Clear Storage" button, returns cleanup function.
    - `setAddJobEnabled(enabled)` — enables/disables "Add Job" based on job count.
- **Principles**: Pure DOM, `textContent` only, cached element refs, no FSM knowledge.
- **Basic Tests**: None — UI is tested via manual interaction (consistent with other examples).
- **Done when**: All UI functions exported, DOM updates work when called with mock data.

### Task 5: Main Module (Wiring)

- **What**: Wire FSM events to UI, DOM events to FSM inputs, and implement the persist/restore cycle.
- **Files**: `examples/job-queue/src/main.ts`
- **Responsibilities**:
    1. **On page load**: Read localStorage. If data exists, deserialize jobs, call `fsm.rehydrate(job, state)` for each, call `fsm.handle(job, "resume")` for any in `processing` state, render UI with restored badge, show banner.
    2. **Handle stale storage gracefully**: Wrap rehydrate in try/catch. On error, clear localStorage, show a message ("Stored data was stale — starting fresh"), render empty state.
    3. **Subscribe to `transitioned`**: On every transition, serialize all jobs + states to localStorage, update the affected job's card in the UI.
    4. **Subscribe to `handling`**: Capture `inputName` for logging/debugging (match existing pattern).
    5. **Wire "Add Job"**: Create a new `JobClient` with incremented ID, call `fsm.handle(job, "start")` — wait, no. New jobs start in `queued`. Since BehavioralFsm lazy-initializes on first `handle()`, we need to handle this: call `fsm.handle(job, "__initialize")` or similar to register the client. Actually — just calling any input that the `queued` state doesn't handle will still register the client in `initialState`. But cleaner: the first `handle()` call triggers `_onEnter` for `initialState`. So `fsm.handle(job, "noop")` or we add an explicit no-op. **Better approach**: add a `queued._onEnter` that emits a custom event, and trigger initialization by handling any valid input. Since the job starts in `queued` and the user clicks "Start" to begin, the first `handle(job, "start")` call will lazy-init into `queued`, fire `_onEnter`, then process the `start` input and transition to `processing`. But we need the job to appear in `queued` state _before_ the user clicks Start. So we need to trigger initialization separately. **Solution**: call `fsm.handle(job, "start")` would skip `queued` entirely. Instead, we should handle a no-op input first to register the client, or we can accept that lazy init + first real input = the right pattern. **Final answer**: After adding a job, we just need to render it. The FSM tracks state in a WeakMap — `currentState(job)` returns `undefined` for unregistered clients. We can either: (a) register the job by calling a dummy input that `queued` ignores, so `_onEnter` fires and the client is tracked, or (b) track "pending" jobs in our own array and consider `undefined` state as `queued`. Option (a) is cleaner — add an `_init` input to `queued` that does nothing, or just call any unhandled input (which triggers `_onEnter` + `nohandler`). Actually, the simplest: FSM has `initialState: "queued"`, and we handle initialization by calling `fsm.handle(job, "initialize")` where `initialize` is a handler on `queued` that does nothing (or isn't even defined — the `nohandler` event fires but the client is registered in `queued`). **Cleanest**: define `initialize` as a no-op handler on `queued`. This is explicit, documented, and doesn't rely on side effects of `nohandler`.
    6. **Wire per-job action buttons**: Delegate to `fsm.handle(job, inputName)`.
    7. **Wire "Clear Storage"**: Clear localStorage, dispose FSM, create fresh FSM instance, clear job array, re-render empty state.
    8. **Cleanup on `beforeunload`**: `.off()` all subscriptions, clear all timers, `fsm.dispose()`.
- **Basic Tests**: None in this file — integration behavior tested via FSM tests and manual interaction.
- **Done when**: Full persist/restore cycle works: add jobs → refresh → jobs restored → "restored" badge visible → Clear Storage → refresh → empty.

### Task 6: Styling

- **What**: CSS for the job queue UI. Conference-talk quality, consistent with existing examples.
- **Files**: `examples/job-queue/src/style.css`
- **Elements to style**:
    - Page layout: centered container, header with title + action buttons
    - Job cards: border, state-colored left accent, job name, state badge, progress bar, action button
    - State colors via CSS custom properties: `--color-queued`, `--color-processing`, `--color-paused`, `--color-failed`, `--color-completed`
    - Progress bar: simple CSS bar, width driven by inline style (`currentStep / totalSteps * 100%`)
    - "Restored" badge: subtle tag, maybe with a fade-out animation
    - Restored banner: top banner, dismissible
    - Empty state: centered placeholder text
    - Responsive: works on mobile-ish widths (conference projector is ~1280px)
    - Transitions: smooth state badge color changes, progress bar animation
- **Basic Tests**: Visual inspection only.
- **Done when**: UI looks polished, state transitions are visually clear, "restored" indication is obvious.

### Task 7: index.html

- **What**: Entry HTML file with semantic structure matching the UI module's expectations.
- **Files**: `examples/job-queue/index.html`
- **Structure**:
    - Title and meta description explaining the example
    - Header: "Job Queue" title, "Add Job" button, "Clear Storage" button
    - Main: job list container (empty div, populated by `ui.ts`)
    - Restored banner container (hidden by default)
    - Script tag: `<script type="module" src="/src/main.ts"></script>`
- **Done when**: HTML loads, all element IDs match what `ui.ts` expects.

### Task 8: Integration Testing and Polish

- **What**: End-to-end verification of the full persist/restore cycle. Fix any rough edges.
- **Files**: All files in `examples/job-queue/`
- **Verification checklist**:
    - [ ] Fresh visit: empty queue, no localStorage data
    - [ ] Add Job: creates job in `queued` state
    - [ ] Start: job moves to `processing`, progress bar advances
    - [ ] Pause/Resume: job pauses and resumes correctly
    - [ ] Failure: random failure triggers `failed` state, Retry works
    - [ ] Completion: job reaches `completed`, no action buttons
    - [ ] Refresh mid-processing: job restored in `processing`, timer auto-resumes via `resume` input
    - [ ] Refresh with mixed states: all jobs restored at correct states
    - [ ] "Restored" badges appear on rehydrated jobs
    - [ ] Banner shows "N jobs restored from localStorage"
    - [ ] Clear Storage: wipes localStorage, UI resets to empty
    - [ ] Refresh after Clear Storage: empty queue
    - [ ] Stale storage: manually corrupt localStorage, reload — graceful recovery with message
    - [ ] 20-job cap: "Add Job" disables at limit
    - [ ] `pnpm --filter @machina-examples/job-queue test` passes
    - [ ] `pnpm --filter @machina-examples/job-queue build` succeeds
    - [ ] `pnpm --filter @machina-examples/job-queue lint` passes
- **Done when**: All checklist items pass, example is ready for the docs site.

## Technical Risks

- **Risk**: BehavioralFsm lazy initialization means a client isn't tracked until the first `handle()` call. Jobs added to the UI but not yet started won't have a state in the WeakMap.
    - **Mitigation**: Add an explicit `initialize` no-op handler on `queued` state. Call `fsm.handle(job, "initialize")` immediately after creating a job. This registers the client and fires `_onEnter` for `queued`.
    - **Likelihood**: High (certain to encounter). Low risk — straightforward solution.

- **Risk**: `JSON.parse` produces new object references. After deserialization, the rehydrated client is a _new_ object — not the same reference as before serialization. Timer handles (`setTimeout` return values) are not serializable.
    - **Mitigation**: Exclude `timer` from serialization (set to `null` on deserialize). The `resume` input re-establishes timers. Document this clearly in code comments.
    - **Likelihood**: High (certain). Low risk — the design already accounts for it.

- **Risk**: Multiple rapid page refreshes during processing could lead to localStorage writes from `beforeunload` racing with reads on load.
    - **Mitigation**: Not a real concern for a demo app. localStorage is synchronous. The last write before unload wins, and the next load reads it.
    - **Likelihood**: Low. No mitigation needed.

## Dependencies

- `machina` (workspace dependency) — core library with `createBehavioralFsm` and `rehydrate()`
- `vite` — dev server and build
- `typescript` — compilation
- Shared Vite plugins: `vite-plugin-umami`, `vite-plugin-workspace-source` (from `examples/`)
- No external runtime dependencies

## Handoff Notes for Developer

- **The `resume` input is the key pattern.** In `processing`, `resume` restarts the timer without transitioning. In `paused`, `resume` transitions to `processing` (which fires `_onEnter`, starting the timer normally). This dual meaning is intentional and is the main thing the example teaches about post-rehydrate side-effect recovery.
- **Don't bury the persist/restore logic.** The brief explicitly says: "A reader skimming `main.ts` should immediately see the `rehydrate()` call and understand the flow." Keep the restore logic at the top of `main.ts`, not in a helper module.
- **Use `currentState()` not `compositeState()`** — the FSM is flat, no children.
- **Timer cleanup matters.** Every path out of `processing` (`_onExit`, `pause`, failure, completion) must clear the timer. The `_onExit` hook is the safety net, but handlers that transition away should also clear to avoid a stale tick firing between `_onExit` calls. Double-clearing is fine — `clearTimeout(null)` is a no-op.
- **`restoredFromStorage` is a UI hint, not FSM state.** It's a boolean on the client object, set during the restore path in `main.ts`, consumed by `ui.ts` for the badge. The FSM doesn't know or care about it.
- **The rehydrate proposal doc** is at `docs/proposals/rehydrate-behavioral-fsm.md` and the dev report at `docs/archive/reports/dev-report-rehydrate-behavioral-fsm.md` — useful context if the FSM behavior is unclear.
