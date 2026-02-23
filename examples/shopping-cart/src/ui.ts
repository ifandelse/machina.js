// =============================================================================
// ui.ts — Shopping Cart demo UI layer
//
// Pure DOM manipulation. No FSM logic, no business rules. This module owns:
//   - State diagram rendering (vertical column of state boxes)
//   - Active state highlight (which box is lit)
//   - Deferred queue panel (add, remove, clear items)
//   - Tooltip (single element, repositioned per event)
//   - FLIP animations (action tokens flying from button → state box → queue)
//   - State box flash on handled action
//
// FLIP technique:
//   F: capture element's First position
//   L: move element to Last position (instantly, without animation)
//   I: Invert — compute the delta and apply as a CSS transform (still instant)
//   P: Play — remove the inverted transform, let CSS transition animate to identity
//
// See: https://aerotwist.com/blog/flip-your-animations/
//
// DOM element creation follows the project convention: document.createElement
// + textContent only — no innerHTML with interpolated strings.
// =============================================================================

import {
    DIAGRAM_STATES,
    STATE_LABELS,
    STATE_DESCRIPTIONS,
    INPUT_LABELS,
    TOOLTIP_DISMISS_MS,
    type CartState,
} from "./config";

// -----------------------------------------------------------------------------
// DOM element references — grabbed once at module load, used everywhere
// -----------------------------------------------------------------------------

function getEl<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`ui.ts: required element #${id} not found`);
    }
    return el as T;
}

const stateDiagram = getEl<HTMLDivElement>("state-diagram");
const deferredQueue = getEl<HTMLDivElement>("deferred-queue");
const deferredEmpty = getEl<HTMLDivElement>("deferred-empty");
const deferredCountEl = getEl<HTMLSpanElement>("deferred-count");
const tooltip = getEl<HTMLDivElement>("tooltip");
const tokenLayer = getEl<HTMLDivElement>("token-layer");

// -----------------------------------------------------------------------------
// State diagram — rendered once, updated via CSS classes
// -----------------------------------------------------------------------------

// Map from state name → its DOM element, built during renderStateDiagram()
const stateBoxMap = new Map<string, HTMLDivElement>();

/**
 * Render the vertical state diagram. Called once on init.
 * Each state gets a box with a data attribute for FLIP position reads.
 */
export function renderStateDiagram(): void {
    stateDiagram.innerHTML = "";
    stateBoxMap.clear();

    for (let i = 0; i < DIAGRAM_STATES.length; i++) {
        const state = DIAGRAM_STATES[i];

        // State box
        const box = document.createElement("div");
        box.className = "state-box";
        box.dataset.state = state;

        const nameEl = document.createElement("div");
        nameEl.className = "state-box-name";
        nameEl.textContent = STATE_LABELS[state];

        const descEl = document.createElement("div");
        descEl.className = "state-box-desc";
        descEl.textContent = STATE_DESCRIPTIONS[state];

        box.appendChild(nameEl);
        box.appendChild(descEl);
        stateDiagram.appendChild(box);
        stateBoxMap.set(state, box);

        // Connector line between boxes (not after the last one)
        if (i < DIAGRAM_STATES.length - 1) {
            const connector = document.createElement("div");
            connector.className = "state-connector";
            stateDiagram.appendChild(connector);
        }
    }
}

/**
 * Update the active state highlight. Removes "active" from all boxes,
 * applies it to the current state's box.
 */
export function setActiveState(state: CartState): void {
    for (const [stateName, box] of stateBoxMap) {
        const nameEl = box.querySelector(".state-box-name");
        const descEl = box.querySelector(".state-box-desc");

        if (stateName === state) {
            box.classList.add("state-box--active");
            nameEl?.classList.add("state-box-name--active");
            descEl?.classList.add("state-box-desc--active");
        } else {
            box.classList.remove("state-box--active");
            nameEl?.classList.remove("state-box-name--active");
            descEl?.classList.remove("state-box-desc--active");
        }
    }
}

/**
 * Flash the active state box green briefly to signal a handled action.
 */
export function flashActiveStateBox(state: CartState): void {
    const box = stateBoxMap.get(state);
    if (!box) {
        return;
    }

    // Remove first in case a previous flash is still running
    box.classList.remove("state-box--flash-success");

    // Force reflow so removing/re-adding the class restarts the animation
    void box.offsetWidth;
    box.classList.add("state-box--flash-success");

    // Clean up after animation completes
    box.addEventListener(
        "animationend",
        () => {
            box.classList.remove("state-box--flash-success");
        },
        { once: true }
    );
}

/**
 * Get the bounding rect of a state box. Used by FLIP for position capture.
 * Returns null if the state box doesn't exist in the diagram.
 */
export function getStateBoxRect(state: CartState): DOMRect | null {
    const box = stateBoxMap.get(state);
    if (!box) {
        return null;
    }
    return box.getBoundingClientRect();
}

// -----------------------------------------------------------------------------
// Deferred queue panel
// -----------------------------------------------------------------------------

// Track count so the badge stays accurate
let deferredItemCount = 0;

function updateDeferredCount(): void {
    deferredCountEl.textContent = String(deferredItemCount);
    deferredCountEl.dataset.count = String(deferredItemCount);

    // Show/hide the empty placeholder
    deferredEmpty.style.display = deferredItemCount === 0 ? "block" : "none";
}

/**
 * Add a deferred item to the queue panel.
 * @param id - Unique ID generated by main.ts, used to find/remove this item later
 * @param inputName - The FSM input that was deferred
 * @param untilState - The state it's waiting for, or null for untargeted defer
 */
export function addDeferredItem(id: string, inputName: string, untilState: string | null): void {
    const label = INPUT_LABELS[inputName] ?? inputName;

    const item = document.createElement("div");
    item.className = "deferred-item";
    item.id = `deferred-item-${id}`;
    item.dataset.deferredId = id;

    const labelEl = document.createElement("span");
    labelEl.className = "deferred-item-label";
    labelEl.textContent = label;

    const untilEl = document.createElement("span");
    untilEl.className = "deferred-item-until";
    if (untilState !== null) {
        untilEl.textContent = `waiting for ${untilState}`;
    } else {
        untilEl.textContent = "until next transition";
    }

    item.appendChild(labelEl);
    item.appendChild(untilEl);
    deferredQueue.appendChild(item);

    deferredItemCount++;
    updateDeferredCount();
}

/**
 * Update the untilState label on an existing deferred item.
 * Called during re-deferral when the target state may have changed.
 */
export function updateDeferredItemTarget(id: string, untilState: string | null): void {
    const item = document.getElementById(`deferred-item-${id}`);
    if (!item) {
        return;
    }

    const untilEl = item.querySelector(".deferred-item-until");
    if (untilEl) {
        if (untilState !== null) {
            untilEl.textContent = `waiting for ${untilState}`;
        } else {
            untilEl.textContent = "until next transition";
        }
    }
}

/**
 * Remove a deferred item from the queue panel by its ID.
 * Called when the item replays (handled) or on reset.
 */
export function removeDeferredItem(id: string): void {
    const item = document.getElementById(`deferred-item-${id}`);
    if (item) {
        item.remove();
    }

    deferredItemCount = Math.max(0, deferredItemCount - 1);
    updateDeferredCount();
}

/**
 * Remove all deferred items from the queue panel. Called on reset.
 */
export function clearDeferredQueue(): void {
    // Remove all items except the empty placeholder
    const items = deferredQueue.querySelectorAll(".deferred-item");
    for (const item of items) {
        item.remove();
    }

    deferredItemCount = 0;
    updateDeferredCount();
}

/**
 * Get the bounding rect of a specific deferred item. Used by FLIP for replay animation.
 */
export function getDeferredItemRect(id: string): DOMRect | null {
    const item = document.getElementById(`deferred-item-${id}`);
    if (!item) {
        return null;
    }
    return item.getBoundingClientRect();
}

// -----------------------------------------------------------------------------
// Tooltip
// -----------------------------------------------------------------------------

// Timer for auto-dismiss
let tooltipDismissTimer: ReturnType<typeof setTimeout> | null = null;

// AbortController for cancelling stale animationend listeners. Rapid-fire
// calls to showTooltip/hideTooltip can accumulate { once: true } listeners
// if a previous animation hasn't ended yet. Aborting before re-adding
// prevents the orphaned listener from firing on the wrong animation cycle.
let tooltipAnimationAC: AbortController | null = null;

/**
 * Show the tooltip near a target element with the given message.
 * The tooltip is clamped to the viewport so it doesn't overflow edges.
 */
export function showTooltip(message: string, targetEl: Element | null): void {
    // Cancel any pending dismiss
    if (tooltipDismissTimer !== null) {
        clearTimeout(tooltipDismissTimer);
        tooltipDismissTimer = null;
    }

    // Cancel any stale animationend listener from a previous show/hide
    if (tooltipAnimationAC) {
        tooltipAnimationAC.abort();
    }
    tooltipAnimationAC = new AbortController();

    tooltip.textContent = message;
    tooltip.hidden = false;
    tooltip.classList.remove("tooltip--exiting");
    tooltip.classList.add("tooltip--entering");
    tooltip.addEventListener(
        "animationend",
        () => {
            tooltip.classList.remove("tooltip--entering");
        },
        { once: true, signal: tooltipAnimationAC.signal }
    );

    // Position near target element, or default to top-right of viewport
    positionTooltip(targetEl);

    // Auto-dismiss after TOOLTIP_DISMISS_MS
    tooltipDismissTimer = setTimeout(() => {
        hideTooltip();
    }, TOOLTIP_DISMISS_MS);
}

/**
 * Hide the tooltip immediately.
 */
export function hideTooltip(): void {
    if (tooltipDismissTimer !== null) {
        clearTimeout(tooltipDismissTimer);
        tooltipDismissTimer = null;
    }

    // Cancel any stale animationend listener from a previous show/hide
    if (tooltipAnimationAC) {
        tooltipAnimationAC.abort();
    }
    tooltipAnimationAC = new AbortController();

    tooltip.classList.add("tooltip--exiting");
    tooltip.addEventListener(
        "animationend",
        () => {
            tooltip.hidden = true;
            tooltip.classList.remove("tooltip--exiting");
        },
        { once: true, signal: tooltipAnimationAC.signal }
    );
}

function positionTooltip(targetEl: Element | null): void {
    const MARGIN = 12;
    const TOOLTIP_WIDTH = 320;

    let top: number;
    let left: number;

    if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        // Prefer: below the target and to its right
        top = rect.bottom + MARGIN;
        left = rect.left;
    } else {
        top = MARGIN;
        left = window.innerWidth - TOOLTIP_WIDTH - MARGIN;
    }

    // Read the actual rendered height after unhiding — showTooltip sets
    // hidden = false before calling positionTooltip, so offsetHeight is real here.
    const tooltipHeight = tooltip.offsetHeight;

    // Clamp to viewport
    left = Math.min(left, window.innerWidth - TOOLTIP_WIDTH - MARGIN);
    left = Math.max(left, MARGIN);
    top = Math.min(top, window.innerHeight - tooltipHeight - MARGIN);
    top = Math.max(top, MARGIN);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

// -----------------------------------------------------------------------------
// Speed slider utility
// -----------------------------------------------------------------------------

/**
 * Read the current speed multiplier from the slider.
 * 1.0 = normal speed, 2.0 = half speed (takes twice as long), 0.5 = double speed.
 */
export function getSpeedMultiplier(): number {
    const slider = document.getElementById("speed-slider") as HTMLInputElement | null;
    if (!slider) {
        return 1;
    }
    return parseFloat(slider.value);
}

/**
 * Update the speed label display next to the slider.
 */
export function updateSpeedLabel(value: number): void {
    const labelEl = document.getElementById("speed-label");
    if (labelEl) {
        // Round to one decimal place, display as "1×", "0.5×", etc.
        labelEl.textContent = `${value}×`;
    }
}

// -----------------------------------------------------------------------------
// FLIP animations — action tokens flying through the UI
// -----------------------------------------------------------------------------

/**
 * Create a token element at the given position (viewport coordinates).
 * The token starts at the button and will FLIP-animate to the state box.
 */
function createToken(label: string, startRect: DOMRect): HTMLDivElement {
    const token = document.createElement("div");
    token.className = "action-token";
    token.textContent = label;

    // Position at button's top-left (viewport coords — token-layer is fixed)
    token.style.left = `${startRect.left + startRect.width / 2}px`;
    token.style.top = `${startRect.top + startRect.height / 2}px`;
    token.style.transform = "translate(-50%, -50%)";

    tokenLayer.appendChild(token);
    return token;
}

/**
 * Animate a token from its current position to a target rect using FLIP.
 * @param token - The token element
 * @param targetRect - Where the token should fly to
 * @param onComplete - Called after the animation finishes (use to remove token, etc.)
 */
function flipTokenTo(token: HTMLDivElement, targetRect: DOMRect, onComplete: () => void): void {
    // The token is already positioned at the button (its start position).
    // We want to animate it TO the target (state box / queue).
    //
    // Standard FLIP would: move the element to its final DOM position, then
    // invert the transform to make it *look* like it's at the start, then
    // animate the invert away. But our token isn't in a layout flow — it's
    // absolutely positioned. So we do a simpler version:
    //
    // 1. Token is at start (button center) — no transform needed to "invert"
    // 2. Compute the delta from start → target
    // 3. Transition the transform to the delta — the token flies to the target

    const startRect = token.getBoundingClientRect();

    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;

    const deltaX = targetX - startX;
    const deltaY = targetY - startY;

    // Ensure the browser has painted the token at its start position
    void token.offsetWidth;

    // Animate from start → target
    token.style.transition = "transform 400ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    token.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;

    token.addEventListener("transitionend", onComplete, { once: true });
}

/**
 * Animate an action token flying from the button to the active state box,
 * then flash the state box green and fade the token.
 *
 * This is the "handled immediately" animation sequence.
 */
export function animateTokenHandled(
    inputName: string,
    buttonEl: HTMLElement,
    activeState: CartState
): void {
    const label = INPUT_LABELS[inputName] ?? inputName;
    const buttonRect = buttonEl.getBoundingClientRect();
    const token = createToken(label, buttonRect);

    const targetRect = getStateBoxRect(activeState);
    if (!targetRect) {
        // No box visible (e.g., error state not in diagram) — just fade out
        setTimeout(() => {
            token.remove();
        }, 400);
        return;
    }

    // Fly token to state box
    flipTokenTo(token, targetRect, () => {
        // Flash the state box
        flashActiveStateBox(activeState);

        // Fade out the token
        token.classList.add("action-token--fading");
        token.addEventListener(
            "transitionend",
            () => {
                token.remove();
            },
            { once: true }
        );
    });
}

/**
 * Animate an action token flying from the button toward the state box,
 * then redirect it downward into the deferred queue panel.
 *
 * This is the "deferred" animation sequence.
 */
export function animateTokenDeferred(
    inputName: string,
    buttonEl: HTMLElement,
    deferredItemId: string
): void {
    const label = INPUT_LABELS[inputName] ?? inputName;
    const buttonRect = buttonEl.getBoundingClientRect();
    const token = createToken(label, buttonRect);
    token.classList.add("action-token--deferred");

    // First fly token toward the deferred queue panel
    const queueEl = deferredQueue;
    const queueRect = queueEl.getBoundingClientRect();

    flipTokenTo(token, queueRect, () => {
        // Token has arrived at the queue — fade it out now that the
        // DOM element (deferred-item) is visible in the queue
        token.classList.add("action-token--fading");
        token.addEventListener(
            "transitionend",
            () => {
                token.remove();
            },
            { once: true }
        );

        // Briefly highlight the new deferred item
        const item = document.getElementById(`deferred-item-${deferredItemId}`);
        if (item) {
            item.style.transition = "box-shadow 200ms ease";
            item.style.boxShadow = "0 0 0 3px rgba(210, 153, 34, 0.5)";
            setTimeout(() => {
                item.style.boxShadow = "";
            }, 600);
        }
    });
}

/**
 * Animate a deferred item replaying: fly from the queue up to the state box,
 * then flash the state box and remove the queue item.
 *
 * This is the "replay" animation sequence — the visual payoff.
 */
export function animateTokenReplayed(
    inputName: string,
    deferredItemId: string,
    activeState: CartState
): void {
    const label = INPUT_LABELS[inputName] ?? inputName;

    // Find the deferred queue item's position (F: First)
    const itemRect = getDeferredItemRect(deferredItemId);
    const targetRect = getStateBoxRect(activeState);

    if (!itemRect || !targetRect) {
        // Can't animate — just remove the item
        removeDeferredItem(deferredItemId);
        return;
    }

    // Create a token at the deferred item's position
    const token = document.createElement("div");
    token.className = "action-token action-token--deferred";
    token.textContent = label;
    token.style.left = `${itemRect.left + itemRect.width / 2}px`;
    token.style.top = `${itemRect.top + itemRect.height / 2}px`;
    token.style.transform = "translate(-50%, -50%)";
    tokenLayer.appendChild(token);

    // Remove the deferred queue item immediately (the token visually replaces it)
    removeDeferredItem(deferredItemId);

    // Fly the token up to the active state box
    flipTokenTo(token, targetRect, () => {
        // Change color to indicate success
        token.classList.remove("action-token--deferred");

        // Flash the state box
        flashActiveStateBox(activeState);

        // Fade out the token
        token.classList.add("action-token--fading");
        token.addEventListener(
            "transitionend",
            () => {
                token.remove();
            },
            { once: true }
        );
    });
}

// -----------------------------------------------------------------------------
// Button state management
// -----------------------------------------------------------------------------

/**
 * Show or hide the confirm button. The confirm button only makes sense when
 * the FSM is in the checkout state — showing it at other times would let
 * the user fire a transition the FSM won't handle.
 */
export function showConfirmButton(visible: boolean): void {
    const btn = document.getElementById("btn-confirm") as HTMLButtonElement | null;
    if (btn) {
        btn.hidden = !visible;
    }
}

/**
 * Enable or disable the checkout button based on item count.
 * Called by main.ts after each itemAdded event.
 */
export function setCheckoutEnabled(enabled: boolean): void {
    const btn = document.getElementById("btn-checkout") as HTMLButtonElement | null;
    if (btn) {
        btn.disabled = !enabled;
    }
}

/**
 * Get references to the action buttons. Used by main.ts to attach event listeners.
 */
export function getActionButtonRefs(): {
    addItem: HTMLButtonElement;
    applyCoupon: HTMLButtonElement;
    checkout: HTMLButtonElement;
    recordAnalytics: HTMLButtonElement;
    reset: HTMLButtonElement;
} | null {
    const addItem = document.getElementById("btn-add-item") as HTMLButtonElement | null;
    const applyCoupon = document.getElementById("btn-apply-coupon") as HTMLButtonElement | null;
    const checkout = document.getElementById("btn-checkout") as HTMLButtonElement | null;
    const recordAnalytics = document.getElementById(
        "btn-record-analytics"
    ) as HTMLButtonElement | null;
    const reset = document.getElementById("btn-reset") as HTMLButtonElement | null;

    if (!addItem || !applyCoupon || !checkout || !recordAnalytics || !reset) {
        return null;
    }

    return { addItem, applyCoupon, checkout, recordAnalytics, reset };
}
