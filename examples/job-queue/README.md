# Job Queue

A machina example of persisting `BehavioralFsm` clients across page reloads. One FSM definition serves the whole queue, and `dehydrate()` snapshots persist across refreshes through `localStorage`. The [persisting clients guide](https://machina-js.org/guide/persisting-clients/) covers the pattern in depth.

## What This Demonstrates

**The two-step restore.** `rehydrate()` is silent by design: it places a client at its saved state without firing `_onEnter` or any events. After rehydration, a job that was mid-`processing` is missing its tick timer. After rehydrating, [src/main.ts](./src/main.ts) dispatches `resume`, and the `resume` handler on `processing` restarts the timer without transitioning:

```ts
// On page load, for each saved job:
fsm.rehydrate(job, saved.snapshot); // silent: state and deferred queue restored
if (fsm.currentState(job) === "processing") {
    fsm.handle(job, "resume"); // rehydrate() starts nothing, so restart the timer
}
```

**Snapshots rather than state strings.** Each save calls `fsm.dehydrate(job)` and stores the returned `ClientSnapshot` beside the serialized job. The snapshot form preserves the job's deferred inputs, while a bare `compositeState()` string restores just the state path. This example needs the queue: a `pause` dispatched while a job is still `queued` defers until `processing`, and that pending input must persist across a reload.

**Save on each event that mutates the serialized data.** A `transitioned` subscriber alone would miss two cases. The app persists from each of these subscriptions:

- `transitioned`, for state changes
- `deferred`, because a queued pre-emptive pause does not transition, and a reload before the next transition would drop it
- handled `tick` inputs, because progress changes while the job stays in `processing`

Each save serializes the jobs to `localStorage` under `machina-job-queue-v1`.

**Recovery from bad saves.** When `rehydrate()` throws, because a saved state name no longer exists in the config, main.ts clears the stored data and starts fresh.

## Job States

```
queued ──start──► processing ──(5 ticks)──► completed
                    │    ▲
              pause │    │ resume
                    ▼    │
                  paused ┘

processing ──(5% per tick)──► failed ──retry──► processing
```

Each job advances one step per tick (2s per step, 5 steps total), and each tick has a 5% chance of failing the job. `_onExit` on `processing` clears the tick timer on every exit path (pause, fail, complete).

## Running

From this directory:

```sh
pnpm dev
```

From the repo root:

```sh
pnpm --filter @machina-examples/job-queue dev
```

Add a few jobs, start them, and reload the page mid-processing to watch them resume where they stopped. Pause a job while it is still queued to watch a deferred input replay after the reload.

## Testing

```sh
pnpm test
```

`fsm.test.ts` covers the queued handlers, the happy path to completion, pause and resume, and the failed-to-retry path.

## File Overview

| File            | Purpose                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `src/fsm.ts`    | The `createBehavioralFsm` definition, the point of this example                                   |
| `src/config.ts` | Tuning constants and the serialized storage shapes                                                |
| `src/main.ts`   | Persistence wiring: save on `transitioned`, `deferred`, and `tick`, rehydrate plus resume on load |
| `src/ui.ts`     | Job cards and per-state action buttons                                                            |
| `src/style.css` | Styling                                                                                           |
