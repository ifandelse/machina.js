// =============================================================================
// fsm.ts — Job Queue BehavioralFsm
//
// This file is the centerpiece of the example. Read it alongside main.ts.
//
// One BehavioralFsm drives all job clients. Each job is a plain JobClient
// object — the FSM stores state separately in a WeakMap. This is the
// multi-client pattern: one FSM definition, many independent clients.
//
// Five states: queued → processing → completed
//                              ↕
//                           paused
//                              ↓
//                           failed → (retry) → processing
//
// THE KEY TEACHING MOMENT IS THE `resume` INPUT ON `processing`:
//
// After a page reload, main.ts calls fsm.rehydrate(job, savedState) to silently
// restore the client's position in the state machine. rehydrate() is silent —
// _onEnter does NOT fire. So any job that was processing when the page refreshed
// has no timer running. main.ts fixes this by calling fsm.handle(job, "resume"),
// which hits the `resume` handler in `processing` and restarts the tick timer
// WITHOUT transitioning away from `processing`.
//
// This two-step restore (rehydrate + resume) is the pattern the example teaches.
//
// INSTANCE CAPTURE FOR TIMER CALLBACKS:
// `let fsm` is declared before createJobQueueFsm() so the tick timer can close
// over it. JavaScript is single-threaded — setTimeout callbacks are async —
// so `fsm` is always assigned before any timer fires.
// =============================================================================

import { createBehavioralFsm } from "machina";
import { STEP_DURATION_MS, FAILURE_CHANCE, TOTAL_STEPS, type JobClient } from "./config";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Start the repeating tick timer for a job. Stored on ctx.timer so _onExit
 *  and the pause/fail/complete paths can clear it without a stale tick firing. */
const startTicker = (ctx: JobClient, getFsm: () => ReturnType<typeof createJobQueueFsm>) => {
    // Clear any leftover timer before starting a new one — belt and suspenders,
    // since _onExit should handle this, but double-clearing is a no-op.
    if (ctx.timer !== null) {
        clearTimeout(ctx.timer);
    }

    const tick = () => {
        // Clear the timer reference before handling so _onExit can detect that
        // the tick itself is in progress. After handle() returns, we check
        // whether the job is still processing before rescheduling.
        ctx.timer = null;
        getFsm().handle(ctx, "tick");
        // Only reschedule if the job is still in processing. If the tick handler
        // transitioned to failed/completed, _onExit has already cleared the timer
        // (setting ctx.timer to null) and we should not restart it.
        if (ctx.timer === null && getFsm().currentState(ctx) === "processing") {
            ctx.timer = setTimeout(tick, STEP_DURATION_MS);
        }
    };

    ctx.timer = setTimeout(tick, STEP_DURATION_MS);
};

/** Clear the tick timer. Safe to call when timer is already null. */
const clearTicker = (ctx: JobClient) => {
    if (ctx.timer !== null) {
        clearTimeout(ctx.timer);
        ctx.timer = null;
    }
};

// -----------------------------------------------------------------------------
// Factory
// -----------------------------------------------------------------------------

/**
 * Create a new BehavioralFsm instance for the job queue.
 * Exported for test isolation — each test creates its own instance.
 */
export function createJobQueueFsm() {
    // Declared before createBehavioralFsm() so timer callbacks can close over it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instance: any;

    // eslint-disable-next-line prefer-const
    instance = createBehavioralFsm<JobClient, Record<string, Record<string, unknown>>>({
        id: "job-queue",
        initialState: "queued",

        states: {
            // ------------------------------------------------------------------
            // queued — job is registered but not yet running
            //
            // `initialize` is a no-op that exists purely to trigger lazy init.
            // BehavioralFsm registers a client on first handle(), which fires
            // _onEnter for initialState. We need jobs visible in "queued" state
            // before the user clicks "Start", so main.ts calls handle(job, "initialize")
            // immediately after creating a job. The handler does nothing — the
            // side effect we want is the WeakMap registration.
            //
            // `pause` here is a pre-emptive pause: "start this job, but pause it
            // the moment it begins running." defer({ until: "processing" }) queues
            // the input rather than handling it immediately — it replays once the
            // job transitions into `processing`, landing it straight in `paused`.
            // This is the example's deferred-input teaching moment: a snapshot
            // taken while this deferral is pending (fsm.dehydrate(job)) carries it
            // across a page reload, so it still fires after `rehydrate(job, snapshot)`
            // — see fsm.test.ts's persistence round-trip test and main.ts's restore
            // path. Wired to the "Pause on start" button on queued cards (ui.ts);
            // main.ts tracks the pending deferral via the `deferred` event and
            // persists immediately so a reload can't drop it.
            // ------------------------------------------------------------------
            queued: {
                initialize() {
                    // intentional no-op — see module comment above
                },

                start() {
                    return "processing";
                },

                pause({ defer }: { defer: (opts?: { until: string }) => void }) {
                    defer({ until: "processing" });
                },
            },

            // ------------------------------------------------------------------
            // processing — the tick timer runs, advancing currentStep
            //
            // _onEnter starts the tick timer. On each tick, the job has a
            // FAILURE_CHANCE of failing, and completes when currentStep reaches
            // totalSteps. _onExit clears the timer — this is the safety net
            // for all exit paths (pause, fail, complete, external transition).
            //
            // `resume` in this state is the post-rehydrate path: rehydrate()
            // places the client back in "processing" but doesn't fire _onEnter,
            // so the tick timer isn't running. main.ts dispatches "resume" to
            // restart it. This handler restarts the timer without transitioning.
            //
            // `pause` exits to paused. When the user resumes from paused, the
            // FSM transitions back to processing and _onEnter fires normally.
            // ------------------------------------------------------------------
            processing: {
                _onEnter({ ctx }: { ctx: JobClient }) {
                    startTicker(ctx, () => instance);
                },

                _onExit({ ctx }: { ctx: JobClient }) {
                    // Clear the timer on every exit — prevents stale ticks from
                    // firing after the job has left this state.
                    clearTicker(ctx);
                },

                tick({ ctx }: { ctx: JobClient }) {
                    // Random failure check — keeps the demo interesting
                    if (Math.random() < FAILURE_CHANCE) {
                        return "failed";
                    }

                    ctx.currentStep++;

                    if (ctx.currentStep >= TOTAL_STEPS) {
                        return "completed";
                    }

                    // No return = stay in processing
                },

                pause() {
                    return "paused";
                },

                // Post-rehydrate timer restart. Does NOT transition — the job
                // stays in processing. This is what makes rehydrate() useful:
                // the FSM restores position, the app re-establishes side effects.
                resume({ ctx }: { ctx: JobClient }) {
                    startTicker(ctx, () => instance);
                },
            },

            // ------------------------------------------------------------------
            // paused — timer is stopped, job is idle
            //
            // resume transitions back to processing, which fires _onEnter and
            // starts a fresh tick timer. No manual timer restart needed here
            // because _onEnter handles it.
            // ------------------------------------------------------------------
            paused: {
                resume() {
                    return "processing";
                },
            },

            // ------------------------------------------------------------------
            // failed — something went wrong during a tick
            //
            // _onEnter clears the timer as a safety net (the processing _onExit
            // should have already done it, but defense in depth is cheap).
            //
            // retry resets currentStep to 0 and transitions to processing,
            // starting fresh. The job doesn't carry over partial progress —
            // real retry semantics are domain-specific; resetting is a
            // reasonable default for a demo.
            // ------------------------------------------------------------------
            failed: {
                _onEnter({ ctx }: { ctx: JobClient }) {
                    clearTicker(ctx);
                },

                retry({ ctx }: { ctx: JobClient }) {
                    ctx.currentStep = 0;
                    return "processing";
                },
            },

            // ------------------------------------------------------------------
            // completed — terminal state, job is done
            //
            // _onEnter clears the timer as a safety net. No inputs are handled
            // from this state — the job is done and stays done.
            // ------------------------------------------------------------------
            completed: {
                _onEnter({ ctx }: { ctx: JobClient }) {
                    clearTicker(ctx);
                },
            },
        },
    });

    return instance;
}

// Module-level singleton — main.ts imports createJobQueueFsm() directly
// and manages its own instance. This export is kept for convenience but
// main.ts creates fresh instances as needed (e.g., after Clear Storage).
export const fsm = createJobQueueFsm();
