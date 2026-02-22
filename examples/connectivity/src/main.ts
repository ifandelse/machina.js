// =============================================================================
// main.ts — Entry point. Wiring only.
//
// This file connects the FSM to the UI. It does not contain FSM logic or DOM
// manipulation — those live in fsm.ts and ui.ts respectively. This file is
// the layer that joins them: subscribe to FSM events, update the UI, bind
// browser events, wire the simulation button, and clean up on unload.
//
// Reading order:
//   1. fsm.ts — the state machine (the point of the example)
//   2. ui.ts — DOM update functions
//   3. main.ts — the wiring (this file)
// =============================================================================

import { fsm, MAX_CHECKS, setSimulationMode } from "./fsm";
import {
    renderStatus,
    renderCheckCount,
    clearCheckCount,
    addLogEntry,
    initSimulateButton,
} from "./ui";

// -----------------------------------------------------------------------------
// Capture the input name as each input is dispatched, so we can include it
// in the log entry when the corresponding transition fires.
//
// `handling` fires before the handler runs, `transitioned` fires after.
// Pairing them gives us the full picture: input name + from/to states.
// Inputs that don't trigger a transition (no handler defined) don't produce
// a `transitioned` event, so they won't appear in the log. That's correct —
// the log shows state changes, not every received input.
// -----------------------------------------------------------------------------

let pendingInputName = "";

const handlingSub = fsm.on("handling", ({ inputName }) => {
    pendingInputName = inputName;
});

// -----------------------------------------------------------------------------
// Subscribe to FSM transition events
//
// `transitioned` fires after the transition is complete and currentState()
// reflects the new state. This is the right event for updating the UI —
// not `transitioning`, which fires before the new state's _onEnter runs.
// -----------------------------------------------------------------------------

const transitionedSub = fsm.on("transitioned", ({ fromState, toState }) => {
    renderStatus(toState as "online" | "offline" | "checking");

    // Check count only makes sense while we're offline or checking.
    // Clear it once we're back online — not inside renderStatus(), which would
    // wipe it immediately after checking._onEnter emits checkCountUpdated.
    if (toState === "online") {
        clearCheckCount();
    }

    addLogEntry({
        inputName: pendingInputName,
        fromState,
        toState,
    });

    pendingInputName = "";
});

// -----------------------------------------------------------------------------
// Subscribe to custom FSM events via the wildcard listener
//
// The wildcard fires for every event emitted by the FSM, including built-ins.
// We use it here because the custom domain events (checkCountUpdated,
// maxChecksReached) don't have typed overloads on `fsm.on()` — they're plain
// strings from handler emit() calls. We check eventName and ignore the rest.
// -----------------------------------------------------------------------------

const wildcardSub = fsm.on("*", (eventName: string, data: unknown) => {
    if (eventName === "checkCountUpdated") {
        const { checkCount } = data as { checkCount: number };
        renderCheckCount(checkCount, MAX_CHECKS);
    }

    if (eventName === "maxChecksReached") {
        renderCheckCount(MAX_CHECKS, MAX_CHECKS);
    }
});

// -----------------------------------------------------------------------------
// Browser online/offline events → FSM inputs
//
// These are the real-world triggers. The simulation button uses the same
// fsm.handle() calls — no special casing, no mocking.
// -----------------------------------------------------------------------------

function handleBrowserOnline() {
    fsm.handle("connectionRestored");
}

function handleBrowserOffline() {
    fsm.handle("connectionLost");
}

globalThis.addEventListener("online", handleBrowserOnline);
globalThis.addEventListener("offline", handleBrowserOffline);

// -----------------------------------------------------------------------------
// Simulation toggle button
//
// onToggle fires with "connectionLost" or "connectionRestored" — same inputs
// the browser events send. The button is just a shortcut for testing without
// actually dropping your network.
// -----------------------------------------------------------------------------

const cleanupSimulateBtn = initSimulateButton(inputName => {
    // Toggle simulation mode so that checking._onEnter skips the real
    // fetch and immediately fails the health check. Without this, the
    // server happily responds 200 and the FSM bounces right back to online.
    setSimulationMode(inputName === "connectionLost");
    fsm.handle(inputName);
});

// -----------------------------------------------------------------------------
// Initial UI state
//
// Set the UI to match the FSM's initial state without waiting for a transition.
// The FSM starts in "online" and fires _onEnter during construction — but the
// `transitioned` event from init fires before we subscribe here. So we read
// currentState() directly and render it.
// -----------------------------------------------------------------------------

renderStatus(fsm.currentState() as "online" | "offline" | "checking");

// -----------------------------------------------------------------------------
// Cleanup on page unload
//
// dispose() tears down the FSM's internal emitter and stops it from handling
// further inputs. It's good practice — in a component-based app you'd call
// this when the component unmounts. Here, page unload is the natural trigger.
//
// We also remove all event subscriptions and browser event listeners so there
// are no lingering callbacks if the browser keeps the page in the bfcache.
// -----------------------------------------------------------------------------

function handleBeforeUnload() {
    handlingSub.off();
    transitionedSub.off();
    wildcardSub.off();
    cleanupSimulateBtn();
    globalThis.removeEventListener("online", handleBrowserOnline);
    globalThis.removeEventListener("offline", handleBrowserOffline);

    // dispose() clears the FSM's event emitter and makes handle() a no-op.
    // NOTE: if we're currently in the `offline` state, ctx.retryTimer is still
    // running at this point — it fires handle() which is now a no-op, so it's
    // harmless for a page unload. In a component-based app, you'd want to also
    // clear the timer explicitly before dispose().
    fsm.dispose();
}

globalThis.addEventListener("beforeunload", handleBeforeUnload);
