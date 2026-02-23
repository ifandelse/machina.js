// =============================================================================
// main.ts — Entry point. Wiring only.
//
// Connects the FSM to the renderer, state panel, event log, and button.
// No FSM logic here, no DOM manipulation beyond the init calls.
//
// Reading order:
//   1. fsm.ts — the hierarchical state machine (the point of the example)
//   2. config.ts — timing constants and signal state lookup table
//   3. renderer.ts — canvas rendering (vehicles, pedestrians, signals)
//   4. ui.ts — state panel, event log, pedestrian button
//   5. main.ts — wiring (this file)
// =============================================================================

import { intersection } from "./fsm";
import { createRenderer } from "./renderer";
import { renderStatePanel, addLogEntry, initStartButton, initPedestrianButton } from "./ui";

// -----------------------------------------------------------------------------
// Renderer setup
// -----------------------------------------------------------------------------

const canvas = document.getElementById("intersection-canvas") as HTMLCanvasElement | null;
if (!canvas) {
    throw new Error("[traffic-intersection] Canvas element #intersection-canvas not found");
}

const renderer = createRenderer(canvas);
renderer.start(() => intersection.compositeState());

// -----------------------------------------------------------------------------
// State panel — parse compositeState() into its parts for display
//
// compositeState() returns one of:
//   "northSouthPhase.green"     → parent = northSouthPhase, child = ns-phase-controller, childState = green
//   "clearanceNS"               → parent = clearanceNS, no active child
//   etc.
//
// We parse the dot to extract parent/child state for the panel.
// The active child ID is inferred from which parent state we're in.
// -----------------------------------------------------------------------------

/**
 * Splits a compositeState() string into its constituent parts for the state panel.
 *
 * compositeState() returns either a bare parent state ("clearanceNS") or a
 * dot-separated "parentState.childState" string ("northSouthPhase.green").
 * The active child FSM ID is derived from the parent state — machina doesn't
 * surface it directly in the composite string.
 */
function parseCompositeState(composite: string) {
    const dotIdx = composite.indexOf(".");
    if (dotIdx === -1) {
        return { parentState: composite, activeChild: null, childState: null };
    }
    const parentState = composite.slice(0, dotIdx);
    const childState = composite.slice(dotIdx + 1);

    // Map parent state to the child FSM ID that's active
    const childIdMap: Record<string, string> = {
        northSouthPhase: "ns-phase-controller",
        eastWestPhase: "ew-phase-controller",
    };

    return {
        parentState,
        activeChild: childIdMap[parentState] ?? null,
        childState,
    };
}

/** Reads current FSM state and pushes a fresh snapshot to the state panel. */
function syncStatePanel(): void {
    const composite = intersection.compositeState();
    const { parentState, activeChild, childState } = parseCompositeState(composite);
    renderStatePanel({ compositeState: composite, parentState, activeChild, childState });
}

// Initial panel render — FSM starts in "ready" and no transitioned event fires
// for the initial state. Read compositeState() directly.
syncStatePanel();

// -----------------------------------------------------------------------------
// FSM event subscriptions
//
// Subscribe to the parent FSM only. Child events that bubble through the parent
// (like phaseComplete) appear here automatically. Subscribing to both would
// produce duplicates.
// -----------------------------------------------------------------------------

const transitionedSub = intersection.on("transitioned", ({ fromState, toState }) => {
    syncStatePanel();

    const composite = intersection.compositeState();
    addLogEntry({
        eventType: "transitioned",
        detail: `${fromState} → ${toState} (${composite})`,
        timestamp: new Date(),
    });
});

const deferredSub = intersection.on("deferred", ({ inputName }) => {
    addLogEntry({
        eventType: "deferred",
        detail: `${inputName} (queued until interruptibleGreen)`,
        timestamp: new Date(),
    });
});

const nohandlerSub = intersection.on("nohandler", ({ inputName }) => {
    addLogEntry({
        eventType: "nohandler",
        detail: `${inputName} — no handler in ${intersection.currentState()}`,
        timestamp: new Date(),
    });
});

const handlingSub = intersection.on("handling", ({ inputName }) => {
    addLogEntry({
        eventType: "handling",
        detail: inputName,
        timestamp: new Date(),
    });
});

// -----------------------------------------------------------------------------
// Start button — transitions FSM from ready to northSouthPhase
// -----------------------------------------------------------------------------

const cleanupStartBtn = initStartButton(() => {
    (intersection.handle as (input: string) => void)("start");
});

// -----------------------------------------------------------------------------
// Pedestrian request button
// -----------------------------------------------------------------------------

const cleanupPedBtn = initPedestrianButton(() => {
    // "pedestrianRequest" is a child FSM input — the parent transparently delegates
    // it via _child. The parent's type only knows its own inputs (advance, phaseComplete),
    // so we cast through string to allow this intentional delegation call.
    (intersection.handle as (input: string) => void)("pedestrianRequest");
});

// -----------------------------------------------------------------------------
// Cleanup on page unload
// -----------------------------------------------------------------------------

/**
 * Tears down all subscriptions, DOM listeners, the render loop, and the FSM
 * on page unload. Prevents timer-based FSM transitions from firing into a
 * half-torn-down document after navigation.
 */
function handleBeforeUnload(): void {
    transitionedSub.off();
    deferredSub.off();
    nohandlerSub.off();
    handlingSub.off();
    cleanupStartBtn();
    cleanupPedBtn();
    renderer.stop();
    intersection.dispose();
}

globalThis.addEventListener("beforeunload", handleBeforeUnload, { once: true });
