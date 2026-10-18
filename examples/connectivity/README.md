# Connectivity Monitor

A network connectivity monitor built on `createFsm`. The FSM tracks whether a server responds to health checks and drives the UI through event subscriptions alone. The health check is simulated client-side, and the example runs without a backend.

---

## What it demonstrates

- **Async work in `_onEnter`**: the `checking` state starts an async health check and feeds the result back as an FSM input. The FSM itself stays synchronous, and the async work happens in the side effect.
- **`AbortController` cleanup in `_onExit`**: each in-flight health check gets an `AbortController`. When the FSM leaves `checking`, `_onExit` calls `abort()` so stale callbacks cannot trigger unexpected transitions.
- **Timer management in `_onEnter` and `_onExit`**: the retry timer (offline) and the heartbeat timer (online) start in `_onEnter` and clear in `_onExit`. The co-location guarantees cleanup regardless of which input caused the transition.
- **Custom events from handlers**: `checking._onEnter` emits `checkCountUpdated` so the UI can display progress without polling state, and `offline._onEnter` emits `maxChecksReached` when the retry count hits `MAX_CHECKS`.
- **Event-driven UI updates**: [src/main.ts](./src/main.ts) subscribes to `transitioned` and the custom events. The UI reads `currentState()` once for the initial render, because initialization runs before the subscriptions exist, and reacts to events after that.

The [createFsm guide](https://machina-js.org/guide/fsm/) and the [events guide](https://machina-js.org/guide/events/) cover these APIs in depth.

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

The `online` state also runs a periodic heartbeat. A failed heartbeat fires `connectionLost` into the FSM, the same input that the browser `offline` event sends, and the FSM does not distinguish the source.

---

## The core `_onEnter` pattern

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
        ctx.checkController?.abort();  // cancel the in-flight check on state exit
        ctx.checkController = null;
    },
    healthCheckPassed: "online",
    healthCheckFailed: "offline",
}
```

`fsm` is declared before `createFsm()` so the `_onEnter` callbacks can close over it. `_onEnter` itself runs synchronously during `createFsm()`, and the closure is safe because only the promise continuations created inside `_onEnter` read `fsm`. Those continuations run after `createFsm()` returns and `fsm` is assigned. [src/fsm.ts](./src/fsm.ts) has the full explanation.

---

## Simulated health check

[src/health.ts](./src/health.ts) replaces a real HTTP endpoint with a client-side timer that resolves `{ ok: boolean }` after a short delay. In normal mode it resolves `{ ok: true }`. When the simulation button toggles failure mode, it resolves `{ ok: false }`.

The `.then(res => res.ok)` chain matches the structure of a real `fetch` response, so you can swap in a real endpoint without changing [src/fsm.ts](./src/fsm.ts).

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

Open `http://localhost:5173` in a browser. The "Simulate Connection Failure" button exercises the offline, retry, and reconnect cycle without dropping your real network connection.

---

## Testing

```sh
pnpm test
```

The tests use `jest.resetModules()` plus `import()` to get a fresh FSM singleton per test. `checkHealth` is mocked so the tests never wait on real timers, and `setInterval`/`clearInterval` are mocked for deterministic timer control.
