// =============================================================================
// main.ts — Shopping Cart demo orchestration
//
// Connects the FSM, UI, and browser events. Responsibilities:
//   - Initialize the UI (render state diagram, wire buttons)
//   - Subscribe to FSM events (transitioned, deferred, handling, handled)
//   - Translate FSM events into UI updates and animations
//   - Track deferred items by ID so animations can find them (FIFO)
//   - Initialize the FSM with the UI speed multiplier getter
//
// Pattern notes:
//   - The "deferred" event payload only includes { inputName }, not untilState.
//     We reconstruct the target from DEFER_TARGET_MAP in config.ts.
//   - Re-deferral detection: when a replayed input re-defers, we track its
//     item ID so we update the correct queue entry and resolve the correct
//     one on completion. See the re-deferral comment block below.
// =============================================================================

import { initFsm } from "./fsm";
import {
    renderStateDiagram,
    setActiveState,
    addDeferredItem,
    updateDeferredItemTarget,
    clearDeferredQueue,
    showTooltip,
    getSpeedMultiplier,
    updateSpeedLabel,
    animateTokenHandled,
    animateTokenDeferred,
    animateTokenReplayed,
    setCheckoutEnabled,
    showConfirmButton,
    getActionButtonRefs,
} from "./ui";
import {
    DEFER_TARGET_MAP,
    TOOLTIP_MESSAGES,
    INPUT_ADD_ITEM,
    INPUT_APPLY_COUPON,
    INPUT_CHECKOUT,
    INPUT_RECORD_PURCHASE_ANALYTICS,
    type CartState,
} from "./config";

// Initialize the FSM with the UI speed multiplier getter so timer durations
// read the slider value at operation start without coupling fsm.ts to the DOM.
const fsm = initFsm(getSpeedMultiplier);

// -----------------------------------------------------------------------------
// Deferred item tracking
//
// machina's "deferred" event includes { inputName } but not a unique ID.
// We generate IDs here to track individual deferred entries in the queue.
// Multiple firings of the same input before it replays stack up FIFO —
// when "handled" fires, we resolve the oldest matching entry.
//
// deferredByInput: inputName → ordered array of item IDs (FIFO removal)
// -----------------------------------------------------------------------------

let deferredItemCounter = 0;
const deferredByInput = new Map<string, string[]>();

function trackDeferredItem(
    inputName: string,
    untilState: string | null,
    buttonEl: HTMLElement | null
): string {
    const id = `def-${++deferredItemCounter}`;

    const existing = deferredByInput.get(inputName) ?? [];
    existing.push(id);
    deferredByInput.set(inputName, existing);

    addDeferredItem(id, inputName, untilState);

    // Animate token flying from button to queue, if we have the button element
    if (buttonEl) {
        animateTokenDeferred(inputName, buttonEl, id);
    }

    return id;
}

function resolveDeferredItem(inputName: string, itemId: string, activeState: CartState): void {
    const ids = deferredByInput.get(inputName);
    if (!ids || ids.length === 0) {
        return;
    }

    const idx = ids.indexOf(itemId);
    if (idx === -1) {
        return;
    }

    ids.splice(idx, 1);
    if (ids.length === 0) {
        deferredByInput.delete(inputName);
    }

    // Animate token flying from queue up to the state box
    animateTokenReplayed(inputName, itemId, activeState);
}

function clearAllDeferredTracking(): void {
    deferredByInput.clear();
    clearDeferredQueue();
}

// -----------------------------------------------------------------------------
// Last-clicked button tracking
//
// When an action button is clicked, we store the button reference so the
// "deferred" and "handling" FSM events can retrieve it for animation.
// The FSM is synchronous so the button is always set before the event fires.
// -----------------------------------------------------------------------------

let lastClickedButton: HTMLElement | null = null;

// -----------------------------------------------------------------------------
// Re-deferral detection
//
// When a deferred input replays and the handler calls defer() again (e.g.,
// applyCoupon replays into browsing, transitions to applyingDiscount, then
// checkout replays but re-defers because we're no longer in browsing), we
// must NOT add a duplicate queue entry. Instead we update the existing entry's
// target state and set a flag so the "handled" handler skips resolution.
//
// We track the specific item ID being replayed so that when the same input
// has multiple entries queued (e.g., two applyCoupon calls), re-deferral
// updates the correct entry and resolution removes the correct one —
// not just a blind shift() off the front.
// -----------------------------------------------------------------------------

let handlingDeferSnapshot: { inputName: string; itemId: string } | null = null;
let wasRedeferredDuringHandling = false;

// The set of inputs that participate in defer tracking (user-initiated actions)
const DEFERRABLE_INPUTS = new Set([
    INPUT_ADD_ITEM,
    INPUT_APPLY_COUPON,
    INPUT_CHECKOUT,
    INPUT_RECORD_PURCHASE_ANALYTICS,
]);

// -----------------------------------------------------------------------------
// Item count tracking
//
// The FSM context isn't directly readable from outside, so we mirror the
// item count here by listening to "itemAdded" events. This drives the
// checkout button enabled state.
// -----------------------------------------------------------------------------

let itemCount = 0;

// -----------------------------------------------------------------------------
// FSM event subscriptions
// -----------------------------------------------------------------------------

fsm.on("transitioned", ({ fromState, toState }: { fromState: string; toState: string }) => {
    setActiveState(toState as CartState);

    // Confirm button is only meaningful in the checkout state
    showConfirmButton(toState === "checkout");

    if (toState === "confirmed") {
        showTooltip(TOOLTIP_MESSAGES.confirmed(), null);
    } else if (fromState !== toState) {
        showTooltip(TOOLTIP_MESSAGES.transitioned(fromState, toState), null);
    }
});

// Custom events emitted by FSM handlers via emit()
fsm.on("*", (eventName: string, data: unknown) => {
    if (eventName === "itemAdded") {
        const payload = data as { itemCount: number } | undefined;
        if (payload) {
            itemCount = payload.itemCount;
        }
        setCheckoutEnabled(itemCount > 0);
        showTooltip(TOOLTIP_MESSAGES.itemAdded(), lastClickedButton);
    }

    // couponApplied and checkoutInitiated tooltips were removed — the
    // "transitioned" handler fires after custom events and is the source of
    // truth for post-transition feedback. Showing a tooltip here only to have
    // it overwritten 0ms later was dead code.

    if (eventName === "analyticsRecorded") {
        showTooltip(TOOLTIP_MESSAGES.replayed(INPUT_RECORD_PURCHASE_ANALYTICS), null);
    }
});

// "deferred" fires when a handler calls defer(). Reconstruct untilState from
// our knowledge of the FSM matrix (the event payload only includes inputName).
fsm.on("deferred", ({ inputName }: { inputName: string }) => {
    const currentState = fsm.currentState();
    const stateMap = DEFER_TARGET_MAP[currentState] ?? {};
    const untilState = stateMap[inputName] ?? null;

    // If this input is being replayed from the queue and the handler re-deferred
    // it, don't add a duplicate entry — update the existing one's target instead.
    // Move the re-deferred item to the end of the tracking array so ids[0] is
    // correct for the next replay (machina re-queues re-deferred inputs at the back).
    if (handlingDeferSnapshot?.inputName === inputName) {
        wasRedeferredDuringHandling = true;
        const ids = deferredByInput.get(inputName);
        if (ids && ids.length > 0) {
            updateDeferredItemTarget(handlingDeferSnapshot.itemId, untilState);
            const idx = ids.indexOf(handlingDeferSnapshot.itemId);
            if (idx !== -1 && ids.length > 1) {
                ids.splice(idx, 1);
                ids.push(handlingDeferSnapshot.itemId);
            }
        }
        showTooltip(TOOLTIP_MESSAGES.deferred(inputName, untilState), lastClickedButton);
        return;
    }

    trackDeferredItem(inputName, untilState, lastClickedButton);
    showTooltip(TOOLTIP_MESSAGES.deferred(inputName, untilState), lastClickedButton);
});

// "handling" fires BEFORE the handler runs. If this input has entries in the
// deferred queue, record that so we can detect re-deferral vs. resolution.
fsm.on("handling", ({ inputName }: { inputName: string }) => {
    handlingDeferSnapshot = null;
    wasRedeferredDuringHandling = false;

    if (!DEFERRABLE_INPUTS.has(inputName)) {
        return;
    }

    const ids = deferredByInput.get(inputName);
    if (ids && ids.length > 0) {
        handlingDeferSnapshot = { inputName, itemId: ids[0] };
    }
});

// "handled" fires AFTER the handler runs. Resolve the deferred entry unless
// the handler re-deferred it (flagged by wasRedeferredDuringHandling).
fsm.on("handled", ({ inputName }: { inputName: string }) => {
    if (handlingDeferSnapshot?.inputName !== inputName) {
        return;
    }

    const { itemId } = handlingDeferSnapshot;
    handlingDeferSnapshot = null;

    if (wasRedeferredDuringHandling) {
        wasRedeferredDuringHandling = false;
        return;
    }

    resolveDeferredItem(inputName, itemId, fsm.currentState() as CartState);
    showTooltip(TOOLTIP_MESSAGES.replayed(inputName), null);
});

// -----------------------------------------------------------------------------
// Button event listeners
// -----------------------------------------------------------------------------

const buttons = getActionButtonRefs();

if (buttons) {
    buttons.addItem.addEventListener("click", () => {
        lastClickedButton = buttons.addItem;
        const stateBefore = fsm.currentState();
        fsm.handle(INPUT_ADD_ITEM);
        const stateAfter = fsm.currentState();

        // If state changed and we didn't defer, animate as handled
        if (stateBefore !== stateAfter) {
            animateTokenHandled(INPUT_ADD_ITEM, buttons.addItem, stateAfter as CartState);
        }
        // Deferred case is handled by the "deferred" event subscription
    });

    buttons.applyCoupon.addEventListener("click", () => {
        lastClickedButton = buttons.applyCoupon;
        const stateBefore = fsm.currentState();
        fsm.handle(INPUT_APPLY_COUPON);
        const stateAfter = fsm.currentState();

        // If state changed and we didn't defer, animate as handled
        if (stateBefore !== stateAfter) {
            animateTokenHandled(INPUT_APPLY_COUPON, buttons.applyCoupon, stateAfter as CartState);
        }
        // Deferred case is handled by the "deferred" event subscription
    });

    buttons.checkout.addEventListener("click", () => {
        lastClickedButton = buttons.checkout;
        const stateBefore = fsm.currentState();
        fsm.handle(INPUT_CHECKOUT);
        const stateAfter = fsm.currentState();

        if (stateBefore !== stateAfter) {
            animateTokenHandled(INPUT_CHECKOUT, buttons.checkout, stateAfter as CartState);
        }
    });

    buttons.recordAnalytics.addEventListener("click", () => {
        lastClickedButton = buttons.recordAnalytics;
        // recordPurchaseAnalytics always defers unless we're in checkout.
        // The "deferred" event subscription handles the animation.
        fsm.handle(INPUT_RECORD_PURCHASE_ANALYTICS);

        // If in checkout, it executed immediately — animate as handled
        if (fsm.currentState() === "checkout") {
            animateTokenHandled(
                INPUT_RECORD_PURCHASE_ANALYTICS,
                buttons.recordAnalytics,
                "checkout"
            );
        }
    });

    buttons.reset.addEventListener("click", () => {
        lastClickedButton = null;
        itemCount = 0;
        clearAllDeferredTracking();
        setCheckoutEnabled(false);

        fsm.handle("reset");
    });
}

// Speed slider
const speedSlider = document.getElementById("speed-slider") as HTMLInputElement | null;
if (speedSlider) {
    speedSlider.addEventListener("input", () => {
        updateSpeedLabel(Number.parseFloat(speedSlider.value));
    });
}

// Confirm button is always in the DOM but hidden until FSM reaches checkout.
// showConfirmButton() in the transitioned handler controls visibility.
const confirmBtn = document.getElementById("btn-confirm");
if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
        fsm.handle("confirm");
    });
}

// -----------------------------------------------------------------------------
// Initial UI setup
// -----------------------------------------------------------------------------

renderStateDiagram();
setActiveState(fsm.currentState() as CartState);
updateSpeedLabel(getSpeedMultiplier());
