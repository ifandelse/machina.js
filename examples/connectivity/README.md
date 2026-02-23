# Connectivity Monitor — machina.js Example

Demonstrates network connectivity monitoring using `createFsm`. The FSM tracks
whether the application can reach a server, handles transient blips gracefully,
and drives a real-time UI entirely through FSM event subscriptions.

No backend required. The health check is simulated client-side.

---

## What it demonstrates

- **Async operations in `_onEnter`**: The `checking` state kicks off an async
  health check and feeds the result back as an FSM input. The FSM itself stays
  synchronous; the async work lives in the side effect.
- **`AbortController` cleanup in `_onExit`**: Every in-flight health check gets
  an `AbortController`. When the FSM leaves `checking`, `_onExit` calls
  `abort()` so stale callbacks cannot trigger unexpected transitions.
- **Timer management via `_onEnter`/`_onExit`**: The retry timer (offline) and
  heartbeat timer (online) are both started in `_onEnter` and cleared in
  `_onExit`. This co-location means cleanup is guaranteed regardless of which
  input caused the transition.
- **Custom events from handlers**: `checking._onEnter` emits
  `checkCountUpdated` so the UI can display progress without polling state.
  `offline._onEnter` emits `maxChecksReached` when the retry cap is hit.
- **Event-driven UI updates**: `main.ts` subscribes to `transitioned` and
  custom events. The UI never reads FSM state directly — it only reacts to
  events.

---

## State diagram

```
              connectionLost
  online ─────────────────────> checking
    ^                              |   |
    |       healthCheckPassed      |   |
    +──────────────────────────────+   |
                                       | healthCheckFailed
              connectionRestored       v
  offline <─────────────────────── checking
    |   ^
    |   | retryCheck (timer, up to MAX_CHECKS)
    +───+
```

Transitions at a glance:

| From     | Input              | To       |
| -------- | ------------------ | -------- |
| online   | connectionLost     | checking |
| offline  | connectionRestored | checking |
| offline  | retryCheck         | checking |
| checking | healthCheckPassed  | online   |
| checking | healthCheckFailed  | offline  |
| checking | connectionLost     | offline  |

The `online` state also runs a periodic heartbeat. If the heartbeat check fails,
it fires `connectionLost` into the FSM — same input the browser `offline` event
sends. The FSM does not distinguish the source.

---

## The core pattern — `_onEnter` + async + `fsm.handle()`

```ts
checking: {
    _onEnter({ ctx }) {
        ctx.checkController = new AbortController();
        checkHealth(ctx.checkController.signal)
            .then(res => {
                fsm.handle(res.ok ? "healthCheckPassed" : "healthCheckFailed");
            })
            .catch(() => {
                fsm.handle("healthCheckFailed");
            });
    },
    _onExit({ ctx }) {
        ctx.checkController?.abort();  // cancel in-flight check on state exit
        ctx.checkController = null;
    },
    healthCheckPassed: "online",
    healthCheckFailed: "offline",
}
```

`fsm` is declared before `createFsm()` so `_onEnter` callbacks can close over
it. This is safe because the callbacks are async — they run after `createFsm()`
returns and `fsm` is assigned. See `fsm.ts` for the full explanation.

---

## Simulated health check

`health.ts` replaces a real HTTP endpoint with a client-side timer that resolves
`{ ok: boolean }` after a short delay. In normal mode it resolves `{ ok: true }`.
When the simulation button toggles failure mode, it resolves `{ ok: false }`.

The FSM's `.then(res => res.ok)` chain works identically against the real
shape of a `fetch` Response, so swapping in a real endpoint later requires no
changes to `fsm.ts`.

---

## Running

From this directory:

```sh
pnpm dev
```

From the monorepo root:

```sh
pnpm --filter @machina-examples/connectivity dev
```

Open `http://localhost:5173` in a browser. Use the "Simulate Connection Failure"
button to exercise the offline/retry/reconnect cycle without dropping your
actual network connection.

---

## Testing

```sh
pnpm test
```

Tests use `jest.resetModules()` + dynamic import to get a fresh FSM singleton
per test. `checkHealth` is mocked so tests never wait on real timers.
`setInterval`/`clearInterval` are also mocked for deterministic timer control.
