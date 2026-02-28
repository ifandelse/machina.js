import { createFsm } from "machina";

// =============================================================================
// Checkout Flow — a hierarchical FSM
//
// The parent FSM manages the top-level checkout journey:
//   browsing → checkout → confirmation
//
// The "checkout" state delegates to a payment child FSM that handles
// payment-specific inputs (submit, success, failure, retry). Inputs the
// child can't handle bubble up to the parent.
//
// This structure is the focus of the hierarchical testing examples.
// =============================================================================

// ── Payment FSM (child) ─────────────────────────────────────────────────────
//
// Exported separately so tests can assert on it independently — this is
// the key pattern for testing hierarchical FSMs with machina-test.

export const createPaymentFsm = () =>
    createFsm({
        id: "payment",
        initialState: "entering-details",
        context: {},
        states: {
            "entering-details": {
                "submit-payment": "processing",
            },
            processing: {
                success: "authorized",
                failure: "declined",
            },
            authorized: {
                // Terminal within the child — the parent handles
                // the transition out via "order-placed"
            },
            declined: {
                retry: "entering-details",
            },
        },
    });

// ── Checkout FSM (parent) ────────────────────────────────────────────────────

export const createCheckoutFlow = (paymentFsm: ReturnType<typeof createPaymentFsm>) =>
    createFsm({
        id: "checkout-flow",
        initialState: "browsing",
        context: {},
        states: {
            browsing: {
                "begin-checkout": "checkout",
            },
            checkout: {
                _child: paymentFsm,
                "order-placed": "confirmation",
                abandon: "browsing",
            },
            confirmation: {
                "new-order": "browsing",
            },
        },
    });
