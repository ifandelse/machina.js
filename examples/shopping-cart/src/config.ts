// =============================================================================
// config.ts — Shopping Cart demo constants, types, and defer-target mapping
//
// Single source of truth for all magic numbers, state/input names, and the
// crucial defer-target lookup table that main.ts uses to reconstruct which
// state a deferred input is waiting for (since machina's "deferred" event
// payload only includes the inputName, not the untilState).
// =============================================================================

// -----------------------------------------------------------------------------
// State names — the seven states in the shopping cart FSM
// (six in the normal flow + one error state for the untargeted-defer demo)
// -----------------------------------------------------------------------------

export const STATE_BROWSING = "browsing";
export const STATE_VALIDATING = "validating";
export const STATE_APPLYING_DISCOUNT = "applyingDiscount";
export const STATE_RESERVING_INVENTORY = "reservingInventory";
export const STATE_CHECKOUT = "checkout";
export const STATE_CONFIRMED = "confirmed";
export const STATE_ERROR = "error";

/**
 * Union of all valid FSM state names. Used throughout the codebase to ensure
 * state strings are constrained to the known set rather than open-ended strings.
 */
export type CartState =
    | typeof STATE_BROWSING
    | typeof STATE_VALIDATING
    | typeof STATE_APPLYING_DISCOUNT
    | typeof STATE_RESERVING_INVENTORY
    | typeof STATE_CHECKOUT
    | typeof STATE_CONFIRMED
    | typeof STATE_ERROR;

// -----------------------------------------------------------------------------
// Input names — user actions and internal FSM completion signals
// -----------------------------------------------------------------------------

export const INPUT_ADD_ITEM = "addItem";
export const INPUT_APPLY_COUPON = "applyCoupon";
export const INPUT_CHECKOUT = "checkout";
export const INPUT_RECORD_PURCHASE_ANALYTICS = "recordPurchaseAnalytics";
export const INPUT_VALIDATION_COMPLETE = "validationComplete";
export const INPUT_DISCOUNT_APPLIED = "discountApplied";
export const INPUT_INVENTORY_RESERVED = "inventoryReserved";
export const INPUT_CONFIRM = "confirm";
export const INPUT_RESET = "reset";

// -----------------------------------------------------------------------------
// Async operation durations (milliseconds) — base values at 1x speed
//
// The speed slider multiplier is applied at operation start:
//   actualDuration = BASE_DURATION * speedMultiplier
// Higher multiplier = longer wait = slower processing.
// -----------------------------------------------------------------------------

export const VALIDATION_DURATION_MS = 2000;
export const DISCOUNT_DURATION_MS = 1800;
export const RESERVATION_DURATION_MS = 1500;

// -----------------------------------------------------------------------------
// Speed slider bounds
// -----------------------------------------------------------------------------

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 3;
export const SPEED_DEFAULT = 1;

// -----------------------------------------------------------------------------
// Tooltip auto-dismiss delay (ms)
// -----------------------------------------------------------------------------

export const TOOLTIP_DISMISS_MS = 4000;

// -----------------------------------------------------------------------------
// State diagram display config
// -----------------------------------------------------------------------------

/**
 * Ordered list of states rendered in the vertical state diagram.
 * Error is intentionally excluded — it exists in code for the untargeted-defer
 * demo but is not reachable from the UI.
 */
export const DIAGRAM_STATES: CartState[] = [
    STATE_BROWSING,
    STATE_VALIDATING,
    STATE_APPLYING_DISCOUNT,
    STATE_RESERVING_INVENTORY,
    STATE_CHECKOUT,
    STATE_CONFIRMED,
];

/**
 * Maps each state to its short display name shown in the state diagram boxes.
 * Kept separate from the constants so the diagram can use a different label
 * if the UX copy diverges from the internal state name.
 */
export const STATE_LABELS: Record<CartState, string> = {
    [STATE_BROWSING]: "browsing",
    [STATE_VALIDATING]: "validating",
    [STATE_APPLYING_DISCOUNT]: "applyingDiscount",
    [STATE_RESERVING_INVENTORY]: "reservingInventory",
    [STATE_CHECKOUT]: "checkout",
    [STATE_CONFIRMED]: "confirmed",
    [STATE_ERROR]: "error",
};

/**
 * Maps each state to a short human-readable description shown below the state
 * name in the diagram box.
 */
export const STATE_DESCRIPTIONS: Record<CartState, string> = {
    [STATE_BROWSING]: "Ready for actions",
    [STATE_VALIDATING]: "Checking inventory & price…",
    [STATE_APPLYING_DISCOUNT]: "Calculating discount…",
    [STATE_RESERVING_INVENTORY]: "Reserving inventory…",
    [STATE_CHECKOUT]: "Ready to confirm",
    [STATE_CONFIRMED]: "Order complete",
    [STATE_ERROR]: "Error (not wired to UI)",
};

// -----------------------------------------------------------------------------
// Action button display labels — correlates input names to human text
// -----------------------------------------------------------------------------

/**
 * Maps input names to the human-readable labels shown on action buttons and
 * in tooltip messages. Keyed by the INPUT_* constants, not CartState values.
 */
export const INPUT_LABELS: Record<string, string> = {
    [INPUT_ADD_ITEM]: "Add Item",
    [INPUT_APPLY_COUPON]: "Apply Coupon",
    [INPUT_CHECKOUT]: "Checkout",
    [INPUT_RECORD_PURCHASE_ANALYTICS]: "Record Analytics",
};

// -----------------------------------------------------------------------------
// Defer-target mapping
//
// The machina "deferred" event only includes { inputName }. The untilState is
// not in the payload. This lookup table encodes the FSM matrix's defer targets
// so main.ts can reconstruct what state each deferred item is waiting for.
//
// Structure: deferTargetMap[currentState][inputName] = untilState | null
//   - string: the specific state the input will replay at
//   - null: untargeted defer (error state catch-all) — replays on next transition
//   - undefined (key absent): input is handled (not deferred) in this state
//
// If the FSM matrix changes, update this table too. The tests in fsm.test.ts
// will catch discrepancies between the FSM behavior and this table.
// -----------------------------------------------------------------------------

export const DEFER_TARGET_MAP: Record<string, Record<string, string | null>> = {
    [STATE_BROWSING]: {
        [INPUT_RECORD_PURCHASE_ANALYTICS]: STATE_CHECKOUT,
    },
    [STATE_VALIDATING]: {
        [INPUT_APPLY_COUPON]: STATE_BROWSING,
        [INPUT_CHECKOUT]: STATE_BROWSING,
        [INPUT_RECORD_PURCHASE_ANALYTICS]: STATE_CHECKOUT,
    },
    [STATE_APPLYING_DISCOUNT]: {
        [INPUT_ADD_ITEM]: STATE_BROWSING,
        [INPUT_APPLY_COUPON]: STATE_BROWSING,
        [INPUT_CHECKOUT]: STATE_BROWSING,
        [INPUT_RECORD_PURCHASE_ANALYTICS]: STATE_CHECKOUT,
    },
    [STATE_RESERVING_INVENTORY]: {
        // Intent chokepoint — nothing defers here. Unhandled inputs emit nohandler.
    },
    [STATE_CHECKOUT]: {
        // Nothing defers in checkout — applyCoupon executes, recordAnalytics executes
    },
    [STATE_CONFIRMED]: {
        // Terminal state — only reset works
    },
    [STATE_ERROR]: {
        // Catch-all defers untargeted — null means "next transition to any state"
        [INPUT_ADD_ITEM]: null,
        [INPUT_APPLY_COUPON]: null,
        [INPUT_CHECKOUT]: null,
        [INPUT_RECORD_PURCHASE_ANALYTICS]: null,
    },
};

// -----------------------------------------------------------------------------
// Tooltip message templates — casual, narrator-style explanations
//
// These are called with relevant context values to produce the final string.
// Kept here (not in ui.ts) because they encode FSM behavior knowledge.
// -----------------------------------------------------------------------------

export const TOOLTIP_MESSAGES = {
    deferred: (inputName: string, untilState: string | null): string => {
        const label = INPUT_LABELS[inputName] ?? inputName;
        if (untilState === null) {
            return `"${label}" was deferred — it'll replay on the next state transition.`;
        }
        return `"${label}" was deferred because the cart isn't ready for it yet. It'll replay automatically when the FSM reaches "${untilState}".`;
    },

    replayed: (inputName: string): string => {
        const label = INPUT_LABELS[inputName] ?? inputName;
        return `"${label}" was sitting in the queue and just replayed — the FSM reached the right state.`;
    },

    handled: (inputName: string, state: string): string => {
        const label = INPUT_LABELS[inputName] ?? inputName;
        return `"${label}" was handled immediately in "${state}".`;
    },

    transitioned: (fromState: string, toState: string): string =>
        `FSM transitioned from "${fromState}" to "${toState}".`,

    confirmed: (): string =>
        "Order confirmed. The FSM is in its terminal state — only Reset can bring it back.",

    itemAdded: (): string =>
        "Item added. The FSM is validating it now — try applying a coupon while you wait.",
};

// -----------------------------------------------------------------------------
// Cart context type — what the FSM tracks between handlers
// -----------------------------------------------------------------------------

export interface CartContext {
    /** Number of items added to the cart (enables Checkout button when > 0) */
    itemCount: number;

    /**
     * Timer handle for the current async operation (validation, discount, reservation).
     * Stored here so _onExit can clear it and prevent stale callbacks.
     * Uses ReturnType<typeof setTimeout> — not number — for Node/browser compatibility.
     */
    timer: ReturnType<typeof setTimeout> | null;
}
