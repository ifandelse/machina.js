// =============================================================================
// types.ts — Shared types for the checkout flow example
//
// Separating types from the FSM keeps the FSM file focused on behavior.
// Components import types from here, not from fsm.ts, which has no React deps.
// =============================================================================

/**
 * All valid FSM state names for the checkout flow, matching exactly what
 * is defined in the FSM config. Used as the snapshot type in useSyncExternalStore
 * so TypeScript catches any unhandled state in the App switch.
 */
export type CheckoutState =
    | "start"
    | "personalDetails"
    | "payment"
    | "paymentProcessing"
    | "paymentFailed"
    | "threeDSecure"
    | "review"
    | "confirmation";

/**
 * Customer's shipping / billing identity collected in PersonalDetailsStep.
 * Written to CheckoutContext once the user submits the form; null until then.
 */
export interface PersonalDetails {
    name: string;
    email: string;
    address: string;
    city: string;
    zip: string;
}

/**
 * Card data collected in PaymentStep. Stored as raw strings — no validation
 * or formatting is applied by the FSM itself (demo only, not real card processing).
 */
export interface PaymentDetails {
    cardNumber: string;
    expiry: string;
    cvv: string;
}

/**
 * Controls which outcome paymentProcessing._onEnter simulates after its delay.
 * This is a demo affordance — a real payment FSM would derive this from an
 * actual API response, not a UI picker.
 */
export type PaymentScenario = "success" | "failure" | "threeDSecure";

/**
 * The FSM's mutable context object — shared by reference between the FSM and
 * the React layer. Handlers write to it; components read from it. Because React
 * state transitions (via useSyncExternalStore) trigger re-renders after handlers
 * complete, components always see the latest values without needing React state.
 */
export interface CheckoutContext {
    customerType: "new" | "returning" | null;
    personalDetails: PersonalDetails | null;
    paymentDetails: PaymentDetails | null;
    paymentScenario: PaymentScenario;
    // When set, personalDetails and payment "back/next" return here instead
    // of following the normal forward/back flow. review._onEnter clears it.
    returnTo: "review" | null;
    // Set by threeDSecure.completeVerification. paymentProcessing._onEnter
    // reads it to skip scenario logic and go straight to review. Cleared by
    // review._onEnter so the scenario picker works on subsequent attempts.
    threeDSecureVerified: boolean;
}

/**
 * Pre-filled personal details used when customerType === "returning".
 * In production this would be fetched from a customer API. Here it's hardcoded
 * so the returning-customer path is immediately interactive without any typing.
 */
export const RETURNING_CUSTOMER_DATA: PersonalDetails = {
    name: "Jane Returning",
    email: "jane@example.com",
    address: "123 Main Street",
    city: "Springfield",
    zip: "62701",
};

/**
 * Index (0–4) of a visible step in the StepIndicator. Multiple FSM states can
 * share the same visual step — e.g. paymentProcessing, paymentFailed, and
 * threeDSecure all map to step 2 ("Payment") because they're sub-states of
 * a single user-facing step.
 */
export type CheckoutStep = 0 | 1 | 2 | 3 | 4;

/** Maps every FSM state to its corresponding visual step index. */
export const STATE_TO_STEP: Record<CheckoutState, CheckoutStep> = {
    start: 0,
    personalDetails: 1,
    payment: 2,
    paymentProcessing: 2,
    paymentFailed: 2,
    threeDSecure: 2,
    review: 3,
    confirmation: 4,
};

/** Human-readable label for each step, rendered by StepIndicator. */
export const STEP_LABELS: Record<CheckoutStep, string> = {
    0: "Customer Type",
    1: "Personal Details",
    2: "Payment",
    3: "Review",
    4: "Confirmation",
};
