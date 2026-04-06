# Product Brief: Job Queue Example App

## Problem Statement

machina v6 added `rehydrate()` to BehavioralFsm — a method for silently placing a previously-serialized client at a known state without triggering lifecycle hooks or events. There is no example in the codebase that demonstrates this feature. Developers discovering `rehydrate` in the docs or API reference have no runnable reference implementation showing the persist/restore pattern.

The existing examples cover other BehavioralFsm features (dungeon-critters demonstrates per-client state tracking), but none involve serialization, persistence, or cold resume.

## Target User

machina developers who want to understand how and when to use `rehydrate()` on a BehavioralFsm. They already understand machina's core concepts (states, transitions, handlers) and are evaluating the behavioral pattern for workflows that need persistence.

## MVP Scope

A web-based example app that lives in `examples/job-queue/` and demonstrates the `rehydrate()` persist/restore cycle as its centerpiece.

### Domain

A simulated job queue. Jobs are client objects driven by a single BehavioralFsm. Job "work" is simulated via timers — no real async operations.

### States (5, flat — no child FSMs)

- **queued** — job is waiting to be processed
- **processing** — job is actively running (simulated progress: step N of M)
- **paused** — user-initiated pause; job frozen mid-workflow
- **failed** — job encountered a simulated error; can be retried
- **completed** — job finished successfully (terminal state)

### Persistence

- Auto-persist to localStorage on every state transition (subscribe to `transitioned` event)
- On page load, read localStorage and restore all jobs via `rehydrate()`
- "Clear Storage" button wipes localStorage and resets the UI to a fresh state — provides the "control group" contrast for the rehydrate demo

### UI / Interaction

- "Add Job" button creates a new client and queues it
- Each job displayed as a card/row showing: job name/id, current state, progress indicator (when processing)
- Per-job action buttons contextual to current state:
    - queued: Start
    - processing: Pause
    - paused: Resume
    - failed: Retry
    - completed: (no actions — terminal)
- "Clear Storage" button (prominent, clearly labeled)
- Visual indication when jobs have been restored from storage (so the viewer knows rehydrate happened, not just "the page remembered stuff")

### Tech Stack (matching existing examples)

- Vanilla TypeScript, no framework
- Vite build
- Plain CSS with custom properties
- Single page
- File structure follows existing convention: `fsm.ts`, `config.ts`, `ui.ts`, `main.ts`, `style.css`, `fsm.test.ts`

### Polish Level

Conference talk or better. Consistent with shopping-cart, traffic-intersection, connectivity, and dungeon-critters examples in visual quality and code organization.

## Explicitly Out of Scope

- **Child FSMs / hierarchical state** — flat FSM only. Composite dot-path rehydration is documented separately.
- **Real async work** — no network requests, file operations, or CPU-bound tasks. Jobs are simulated.
- **Server-side persistence** — localStorage only. No database, no API.
- **React or any UI framework** — vanilla DOM manipulation, per existing example conventions.
- **Job configuration/editing** — no custom step counts, no priority, no scheduling. Jobs are uniform.
- **Production job queue features** — no concurrency limits, no dependency graphs, no dead letter queues.
- **machina-inspect or eslint-plugin-machina integration** — this example focuses on runtime behavior, not static analysis.

## User Stories

- As a machina developer, I want to see a working example of `rehydrate()` so that I understand the persist/restore pattern without reading source code.
    - Acceptance Criteria:
        - [ ] Page loads with no jobs on first visit (empty localStorage)
        - [ ] "Add Job" creates a new job client and renders it in the UI
        - [ ] Jobs transition through states via UI buttons (Start, Pause, Resume, Retry)
        - [ ] Processing jobs show visible progress (step indicator or progress bar)
        - [ ] Processing jobs can encounter simulated failure

- As a machina developer, I want to see state survive a page refresh so that I understand what `rehydrate()` does.
    - Acceptance Criteria:
        - [ ] State is auto-persisted to localStorage on every transition
        - [ ] Refreshing the page restores all jobs at their persisted states via `rehydrate()`
        - [ ] A job that was mid-processing resumes from its paused/processing state, not from the beginning
        - [ ] The UI visually indicates that jobs were restored from storage (not fresh-initialized)

- As a machina developer, I want to see the contrast between a fresh start and a restored start so that I understand what happens without `rehydrate()`.
    - Acceptance Criteria:
        - [ ] "Clear Storage" button wipes localStorage and resets the UI
        - [ ] After clearing, a refresh shows an empty job queue (no restoration)

## Edge Cases & Open Questions

- **What happens when the FSM definition changes between persist and restore?** If a developer adds/removes states and then loads stale localStorage data, `rehydrate()` will throw (invalid state). The example should handle this gracefully — clear stale storage and start fresh, with a visible message explaining why.
- **Processing jobs and page refresh timing.** A job mid-processing has a timer running. On refresh, the timer is gone. Should a restored "processing" job auto-resume its timer, or come back as "paused"? Persisting as "processing" and auto-resuming the timer on rehydrate demonstrates the pattern more completely — but the choice should be made during architecture.
- **localStorage size limits.** Not a real concern for a demo with a handful of jobs, but the example shouldn't encourage unbounded job creation. A reasonable cap (e.g., 20 jobs) or a "clear completed" button would prevent confusion.
- **Job identity across serialization.** Clients are plain objects. After `JSON.parse`, they're new object references. The example needs to make clear that `rehydrate()` is registering a _new_ object in the WeakMap — it's not "reconnecting" to an old reference.

## Success Metrics

- A developer who has never used `rehydrate()` can read the example code and understand the persist/restore cycle in under 10 minutes.
- The "refresh and it comes back" moment is immediately visible and understandable without reading code.
- The example runs in the machina docs site without modification.

## Handoff Notes for Architect

- Follow the file structure convention established by existing web examples: `fsm.ts`, `config.ts`, `ui.ts`, `main.ts`, `style.css`, `fsm.test.ts`.
- `main.ts` is wiring only — no business logic, no DOM manipulation. Subscribe to FSM events, delegate to `ui.ts`.
- The FSM definition in `fsm.ts` should be clean enough to read as documentation. This is a teaching example — code clarity trumps DRYness.
- The rehydrate proposal is at `docs/proposals/rehydrate-behavioral-fsm.md`. The dev report is at `docs/archive/reports/dev-report-rehydrate-behavioral-fsm.md`.
- The persist/restore logic is the showcase. Make it prominent in the code — not buried in a utility. A reader skimming `main.ts` should immediately see the `rehydrate()` call and understand the flow.
- localStorage serialization is the caller's responsibility. machina provides `compositeState()` for reading state and `rehydrate()` for writing it back. The example should use `currentState()` (not `compositeState()`) since the FSM is flat.
