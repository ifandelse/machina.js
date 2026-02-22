// =============================================================================
// fsm.ts — Network Connectivity Monitor FSM
//
// This file is intentionally the star of the example. Read it as documentation
// that happens to execute. The goal: understand createFsm, _onEnter side
// effects, and the async loop that feeds results back as inputs.
//
// Three states: online → offline → checking → (online or offline)
//
// The key teaching pattern is in checking._onEnter:
//   1. FSM enters "checking"
//   2. _onEnter fires checkHealth() — a side effect, not a synchronous return
//   3. When the health check settles, we call fsm.handle() with the result
//   4. The FSM transitions based on that input
//
// This works because createFsm() returns synchronously. The checkHealth()
// callback runs on a future microtask, well after `fsm` is assigned. Closing
// over `fsm` in _onEnter is intentional and safe.
// =============================================================================

import { createFsm } from "machina";
import { checkHealth, setSimulationMode } from "./health";

// How often to retry while offline (milliseconds).
const RETRY_INTERVAL_MS = 5000;

// Max number of health checks before the FSM stops trying.
// Beyond this cap, the FSM stays in offline and the retry timer stops.
// The user would need to trigger a manual reconnect (e.g., the simulate button).
const MAX_CHECKS = 5;

// How often to probe while online (milliseconds).
// Think of it as a heartbeat — if connectivity drops without the browser
// firing an "offline" event (which only detects network interface changes,
// not server availability), this catches it.
const HEARTBEAT_INTERVAL_MS = 15000;

// Context shape. retryTimer and checkController are runtime bookkeeping —
// mixing them with domain data is a deliberate trade-off for keeping cleanup
// co-located with the FSM.
type ConnectivityContext = {
    checkCount: number;
    lastCheckTime: number | null;
    retryTimer: ReturnType<typeof setInterval> | null;
    heartbeatTimer: ReturnType<typeof setInterval> | null;
    checkController: AbortController | null;
    heartbeatController: AbortController | null;
};

// Re-export so main.ts can import from this module without knowing about health.ts.
export { setSimulationMode };

// `fsm` is declared before createFsm() so _onEnter callbacks can close over
// it. This is safe because those callbacks are async — they run after
// createFsm() returns and `fsm` is assigned.
// eslint-disable-next-line prefer-const
let fsm: ReturnType<typeof createConnectivityFsm>;

function createConnectivityFsm() {
    return createFsm({
        id: "connectivity-monitor",
        initialState: "online",
        context: {
            checkCount: 0,
            lastCheckTime: null,
            retryTimer: null,
            heartbeatTimer: null,
            checkController: null,
            heartbeatController: null,
        } as ConnectivityContext,

        states: {
            // -----------------------------------------------------------------
            // online — connection is healthy, sitting idle
            // -----------------------------------------------------------------
            online: {
                _onEnter({ ctx }) {
                    // Reset check count on a successful connection.
                    // If we got here via checking → online, this clears the
                    // count so the next offline period starts fresh.
                    ctx.checkCount = 0;

                    // Start a periodic heartbeat to detect connectivity failures.
                    // Browser "offline" events only fire when the network interface
                    // goes down — they won't catch a dropped connection or a
                    // server-side failure. The heartbeat fills that gap.
                    // Same pattern as offline's retry timer: _onEnter starts it,
                    // _onExit clears it.
                    ctx.heartbeatTimer = setInterval(() => {
                        // Create a controller per heartbeat so _onExit can abort
                        // an in-flight check — same discipline as checking state.
                        ctx.heartbeatController = new AbortController();
                        checkHealth(ctx.heartbeatController.signal)
                            .then(res => {
                                if (!res.ok) {
                                    fsm.handle("connectionLost");
                                }
                            })
                            .catch(() => {
                                // Aborted or failed — treat as connectivity loss.
                                fsm.handle("connectionLost");
                            });
                    }, HEARTBEAT_INTERVAL_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.heartbeatController !== null) {
                        ctx.heartbeatController.abort();
                        ctx.heartbeatController = null;
                    }
                    if (ctx.heartbeatTimer !== null) {
                        clearInterval(ctx.heartbeatTimer);
                        ctx.heartbeatTimer = null;
                    }
                },

                // Window "offline" event, simulation button, or heartbeat failure.
                // Goes to checking first — verify the server is actually down
                // before committing to offline with retry timers. A transient
                // blip gets caught here without alarming the user.
                connectionLost: "checking",
            },

            // -----------------------------------------------------------------
            // offline — connection is gone, retry timer is running
            //
            // _onEnter starts the interval. _onExit always clears it — whether
            // we leave via connectionRestored, retryCheck, or any other input.
            // This co-location of start/stop is the reason retryTimer lives on
            // context rather than as a module-level variable.
            // -----------------------------------------------------------------
            offline: {
                _onEnter({ ctx, emit }) {
                    ctx.retryTimer = setInterval(() => {
                        if (ctx.checkCount >= MAX_CHECKS) {
                            // Cap hit: stop the timer and stay offline.
                            // Emit a custom event so the UI can show a message.
                            if (ctx.retryTimer !== null) {
                                clearInterval(ctx.retryTimer);
                                ctx.retryTimer = null;
                            }
                            emit("maxChecksReached");
                            return;
                        }
                        // Fire retryCheck into the FSM as if the user clicked
                        // "retry". Same code path, same handler, no special casing.
                        fsm.handle("retryCheck");
                    }, RETRY_INTERVAL_MS);
                },

                _onExit({ ctx }) {
                    // Always clear the timer when leaving offline, regardless
                    // of which input caused the transition.
                    if (ctx.retryTimer !== null) {
                        clearInterval(ctx.retryTimer);
                        ctx.retryTimer = null;
                    }
                },

                // Window "online" event (or simulation button) drives this.
                connectionRestored: "checking",

                // Retry timer fires this automatically on interval.
                retryCheck: "checking",
            },

            // -----------------------------------------------------------------
            // checking — intermediate state, health check in flight
            //
            // _onEnter kicks off checkHealth() and feeds the result back as
            // an input. This is the _onEnter → async side effect → fsm.handle()
            // loop. The FSM is synchronous; we're just kicking off async work.
            // -----------------------------------------------------------------
            checking: {
                _onEnter({ ctx, emit }) {
                    ctx.lastCheckTime = Date.now();
                    ctx.checkCount++;

                    // Emit the updated check count so the UI can display it.
                    // This is a custom event — not a built-in FSM lifecycle event.
                    // The UI subscribes to this and updates the check counter display.
                    emit("checkCountUpdated", { checkCount: ctx.checkCount });

                    // Create a controller so we can abort the health check if the
                    // FSM leaves `checking` before it settles (e.g., the user
                    // smashes the simulate button). _onExit calls abort() on it.
                    ctx.checkController = new AbortController();

                    // checkHealth handles simulation mode internally — in normal
                    // mode it resolves { ok: true } after a delay, in simulation
                    // mode it resolves { ok: false }. Either way, we feed the
                    // result back as an FSM input.
                    checkHealth(ctx.checkController.signal)
                        .then(res => {
                            if (res.ok) {
                                fsm.handle("healthCheckPassed");
                            } else {
                                fsm.handle("healthCheckFailed");
                            }
                        })
                        .catch(() => {
                            // Aborted checks reject with a DOMException. We let
                            // healthCheckFailed fire — from any state other than
                            // `checking` it emits `nohandler` (no transition), so
                            // stale callbacks are harmless.
                            fsm.handle("healthCheckFailed");
                        });
                },

                _onExit({ ctx }) {
                    // Abort any in-flight health check so stale callbacks don't
                    // call fsm.handle() after we've already left this state.
                    if (ctx.checkController !== null) {
                        ctx.checkController.abort();
                        ctx.checkController = null;
                    }
                },

                // Health check resolved successfully.
                healthCheckPassed: "online",

                // Health check failed or timed out — go back offline and keep retrying.
                healthCheckFailed: "offline",

                // If the user smashes the simulate button while we're checking,
                // treat it as an immediate failure and go offline.
                connectionLost: "offline",
            },
        },
    });
}

// Export a single FSM instance. The module owns the instance; consumers
// import `fsm` directly. This gives _onEnter callbacks a stable closure target.
fsm = createConnectivityFsm();

export { fsm };
export type { ConnectivityContext };
export { MAX_CHECKS };
