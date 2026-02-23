// =============================================================================
// fsm.ts — Traffic Intersection Hierarchical FSM
//
// Read this file as documentation that happens to execute. The goal: understand
// machina v6's hierarchical FSM features — _child delegation, input bubbling,
// compositeState(), child auto-reset, and defer() — through a real-world model.
//
// Architecture at a glance:
//
//   Intersection (parent)
//   ├─ northSouthPhase   (_child: nsPhaseCtrl)
//   ├─ clearanceNS       (all-red interval, parent owns timer)
//   ├─ eastWestPhase     (_child: ewPhaseCtrl)
//   └─ clearanceEW       (all-red interval, parent owns timer)
//
//   PhaseController (child, one factory, two instances)
//   ├─ green             (3s, pedestrianRequest deferred here)
//   ├─ interruptibleGreen (6s, pedestrianRequest shortens phase)
//   ├─ yellow            (2.5s, caution)
//   └─ red               (emits phaseComplete, bubbles to parent)
//
// Five machina v6 features on display:
//   1. _child delegation — parent delegates inputs to active child
//   2. Input bubbling — phaseComplete has no handler in child → parent handles it
//   3. compositeState() — "northSouthPhase.green" as a single readable string
//   4. Child auto-reset — child resets to green when parent re-enters phase state
//   5. defer() — pedestrianRequest saved during green, replayed at interruptibleGreen
// =============================================================================

import { createFsm } from "machina";
import {
    GREEN_DURATION_MS,
    INTERRUPTIBLE_GREEN_DURATION_MS,
    YELLOW_DURATION_MS,
    CLEARANCE_DURATION_MS,
} from "./config";

// -----------------------------------------------------------------------------
// Phase controller context
//
// Timer IDs live on context so _onExit can always reach them. Storing them
// here (rather than as module-level vars) means two independent controller
// instances don't share state. Each instance gets its own context copy.
// -----------------------------------------------------------------------------

/**
 * Per-instance state for a phase controller FSM.
 * All four timer IDs are kept on context (rather than as closures) so that
 * _onExit handlers can always cancel them, even if they were set by a different
 * _onEnter call stack frame.
 */
type PhaseControllerContext = {
    greenTimer: ReturnType<typeof setTimeout> | null;
    interruptibleTimer: ReturnType<typeof setTimeout> | null;
    yellowTimer: ReturnType<typeof setTimeout> | null;
    redTimeout: ReturnType<typeof setTimeout> | null;
};

// -----------------------------------------------------------------------------
// Parent intersection context
// -----------------------------------------------------------------------------

/**
 * Per-instance state for the intersection parent FSM.
 * Only one clearance timer exists at a time — it's owned by whichever clearance
 * state is currently active (clearanceNS or clearanceEW).
 */
type IntersectionContext = {
    clearanceTimer: ReturnType<typeof setTimeout> | null;
};

// -----------------------------------------------------------------------------
// Phase controller factory
//
// Called twice (once for N/S, once for E/W) to produce two independent FSM
// instances with their own context and timers. Same behavior, different IDs.
//
// The `fsm` variable is declared before createFsm() and assigned after, so
// _onEnter callbacks can close over it safely. This is the same pattern as
// the connectivity example: _onEnter runs asynchronously (via setTimeout),
// well after createFsm() returns and the assignment completes.
// -----------------------------------------------------------------------------

/**
 * Creates an independent phase controller FSM for one traffic direction (N/S or E/W).
 *
 * The factory is called twice so N/S and E/W controllers have separate context
 * objects and timers — sharing a single instance would cause them to interfere
 * when the parent re-enters a phase state and machina auto-resets the child.
 *
 * @param id - Unique FSM identifier, used in machina debug output.
 */
function createPhaseController(id: string) {
    // eslint-disable-next-line prefer-const
    let fsm: ReturnType<typeof createPhaseController>;

    const controller = createFsm({
        id,
        initialState: "green",
        context: {
            greenTimer: null,
            interruptibleTimer: null,
            yellowTimer: null,
            redTimeout: null,
        } as PhaseControllerContext,

        states: {
            // ------------------------------------------------------------------
            // green — non-interruptible portion of the green phase
            //
            // pedestrianRequest is deferred here, not ignored. defer({ until })
            // tells machina to queue this input and replay it automatically when
            // the FSM enters "interruptibleGreen". From the outside, the button
            // press "works" — it just takes effect at the right moment.
            // ------------------------------------------------------------------
            green: {
                _onEnter({ ctx }) {
                    ctx.greenTimer = setTimeout(() => {
                        fsm.handle("advance");
                    }, GREEN_DURATION_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.greenTimer !== null) {
                        clearTimeout(ctx.greenTimer);
                        ctx.greenTimer = null;
                    }
                },

                // Defer until we reach interruptibleGreen.
                // machina will automatically replay this input when that state is entered.
                pedestrianRequest({ defer }) {
                    defer({ until: "interruptibleGreen" });
                },

                advance: "interruptibleGreen",
            },

            // ------------------------------------------------------------------
            // interruptibleGreen — pedestrians can shorten this phase
            //
            // If pedestrianRequest arrives here (either live or replayed from
            // defer), we skip straight to yellow. Otherwise we run the full
            // 6-second window before advancing naturally.
            // ------------------------------------------------------------------
            interruptibleGreen: {
                _onEnter({ ctx }) {
                    ctx.interruptibleTimer = setTimeout(() => {
                        fsm.handle("advance");
                    }, INTERRUPTIBLE_GREEN_DURATION_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.interruptibleTimer !== null) {
                        clearTimeout(ctx.interruptibleTimer);
                        ctx.interruptibleTimer = null;
                    }
                },

                // A live press during interruptibleGreen (or a deferred replay
                // from green) both land here and short-circuit to yellow.
                pedestrianRequest: "yellow",

                advance: "yellow",
            },

            // ------------------------------------------------------------------
            // yellow — caution interval, no pedestrian handling needed
            // ------------------------------------------------------------------
            yellow: {
                _onEnter({ ctx }) {
                    ctx.yellowTimer = setTimeout(() => {
                        fsm.handle("advance");
                    }, YELLOW_DURATION_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.yellowTimer !== null) {
                        clearTimeout(ctx.yellowTimer);
                        ctx.yellowTimer = null;
                    }
                },

                advance: "red",
            },

            // ------------------------------------------------------------------
            // red — phase complete, notify the parent
            //
            // The setTimeout(0) is deliberate. It breaks out of the _onEnter
            // call stack so the parent's transition to clearanceNS/EW happens
            // cleanly. Calling handle("phaseComplete") synchronously here works
            // (machina supports nested transitions), but the zero-delay avoids
            // subtle ordering questions about when _onEnter is fully done.
            //
            // phaseComplete is not handled here — it bubbles to the parent via
            // machina's _child delegation mechanism. The parent's phase states
            // (northSouthPhase, eastWestPhase) have the phaseComplete handler.
            // ------------------------------------------------------------------
            red: {
                _onEnter({ ctx }) {
                    // Store the timeout ID so _onExit can cancel it if needed.
                    // Unlikely to fire after _onExit (parent transitions fast),
                    // but clearing it is cheap and avoids theoretical edge cases.
                    ctx.redTimeout = setTimeout(() => {
                        fsm.handle("phaseComplete");
                    }, 0);
                },

                _onExit({ ctx }) {
                    if (ctx.redTimeout !== null) {
                        clearTimeout(ctx.redTimeout);
                        ctx.redTimeout = null;
                    }
                },
            },
        },
    });

    // Assign after createFsm() returns. _onEnter callbacks run via setTimeout,
    // so this assignment is always complete before any callback fires.
    fsm = controller;
    return controller;
}

// -----------------------------------------------------------------------------
// Intersection FSM (parent)
//
// The parent manages two things:
//   1. Which direction currently has right-of-way (the active phase state)
//   2. The all-red clearance interval between phases
//
// Child delegation:
//   Inputs that arrive while in northSouthPhase are automatically forwarded to
//   nsPhaseCtrl by machina (_child). Same for eastWestPhase → ewPhaseCtrl.
//   If the child can't handle an input (no handler), it bubbles back to the
//   parent. That's how phaseComplete reaches the parent from the child's red state.
//
// Child auto-reset:
//   When the parent re-enters northSouthPhase (e.g., after clearanceEW), machina
//   calls reset() on nsPhaseCtrl automatically, sending it back to "green" so
//   the next N/S phase starts fresh.
// -----------------------------------------------------------------------------

/**
 * Creates and returns a fully wired intersection FSM (parent + two child controllers).
 *
 * Exported as a factory rather than a singleton so tests can create isolated
 * instances without sharing timer state. The module-level `intersection` export
 * below is the singleton used by the UI.
 */
export function createIntersection() {
    // `intersectionFsm` is declared inside the function (not at module scope) so
    // each call to createIntersection() gets its own closure. A module-level variable
    // would be overwritten by a second call, causing the first instance's clearance
    // timers to dispatch "advance" to the wrong target.
    // eslint-disable-next-line prefer-const
    let intersectionFsm: ReturnType<typeof createIntersection>;

    const nsPhaseCtrl = createPhaseController("ns-phase-controller");
    const ewPhaseCtrl = createPhaseController("ew-phase-controller");

    const fsm = createFsm({
        id: "intersection",
        initialState: "ready",
        context: {
            clearanceTimer: null,
        } as IntersectionContext,

        states: {
            // ------------------------------------------------------------------
            // ready — pre-start staging state
            //
            // All signals red, all peds dontWalk. The intersection draws as a
            // fully staged scene — vehicles queued at stop lines, pedestrians
            // on sidewalks — until the user clicks Start.
            // ------------------------------------------------------------------
            ready: {
                start: "northSouthPhase",
            },

            // ------------------------------------------------------------------
            // northSouthPhase — N/S has right-of-way
            //
            // Inputs are delegated to nsPhaseCtrl via _child. phaseComplete is
            // not handled here — it arrives via bubbling when nsPhaseCtrl enters
            // "red" and fires handle("phaseComplete").
            // ------------------------------------------------------------------
            northSouthPhase: {
                _child: nsPhaseCtrl,

                phaseComplete: "clearanceNS",
            },

            // ------------------------------------------------------------------
            // clearanceNS — all-red interval after N/S phase completes
            //
            // Parent owns this timer. After CLEARANCE_DURATION_MS, the parent
            // handles "advance" and transitions to eastWestPhase.
            // ------------------------------------------------------------------
            clearanceNS: {
                _onEnter({ ctx }) {
                    ctx.clearanceTimer = setTimeout(() => {
                        intersectionFsm.handle("advance");
                    }, CLEARANCE_DURATION_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.clearanceTimer !== null) {
                        clearTimeout(ctx.clearanceTimer);
                        ctx.clearanceTimer = null;
                    }
                },

                advance: "eastWestPhase",
            },

            // ------------------------------------------------------------------
            // eastWestPhase — E/W has right-of-way
            // ------------------------------------------------------------------
            eastWestPhase: {
                _child: ewPhaseCtrl,

                phaseComplete: "clearanceEW",
            },

            // ------------------------------------------------------------------
            // clearanceEW — all-red interval after E/W phase completes
            // ------------------------------------------------------------------
            clearanceEW: {
                _onEnter({ ctx }) {
                    ctx.clearanceTimer = setTimeout(() => {
                        intersectionFsm.handle("advance");
                    }, CLEARANCE_DURATION_MS);
                },

                _onExit({ ctx }) {
                    if (ctx.clearanceTimer !== null) {
                        clearTimeout(ctx.clearanceTimer);
                        ctx.clearanceTimer = null;
                    }
                },

                advance: "northSouthPhase",
            },
        },
    });

    intersectionFsm = fsm;
    return fsm;
}

// Export a single instance. The module owns it; consumers import `intersection`.
const intersection = createIntersection();

export { intersection };
