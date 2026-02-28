// =============================================================================
// fsm.ts — Checkout Flow FSM
//
// This file has zero React imports. The FSM is the source of truth for the
// checkout workflow. It can be driven from a console, a test, or a UI.
//
// Eight states:
//   start → personalDetails → payment → paymentProcessing
//     → review → confirmation → (startOver → start)
//     → paymentFailed → (retry → paymentProcessing)
//                       (editPayment → payment)
//     → threeDSecure → paymentProcessing
//
// KEY DESIGN DECISIONS:
//
// 1. THE `returnTo` FLAG.
//    review can transition to personalDetails or payment for editing. When it
//    does, it sets ctx.returnTo = "review". The target state's next/back
//    handlers check this flag — if set, they return to review instead of the
//    normal destination. review._onEnter clears the flag. This is deliberately
//    simpler than adding dedicated editing states.
//
// 2. THE `threeDSecureVerified` FLAG.
//    After threeDSecure.completeVerification, paymentProcessing would normally
//    check the scenario picker again — which would trigger 3DS again, infinite
//    loop. Instead, completeVerification sets ctx.threeDSecureVerified = true.
//    paymentProcessing._onEnter checks this first and auto-advances to review.
//    review._onEnter clears it for the next checkout attempt.
//
// 3. THE `let fsmInstance` HOISTING PATTERN (inside the factory).
//    paymentProcessing._onEnter uses setTimeout → fsmInstance.handle(). The
//    callback closes over `fsmInstance`, which must be assigned before the
//    callback fires. Declaring `let fsmInstance` before `createFsm()` and
//    assigning the result ensures the variable is populated by the time the
//    first timer fires (1500ms). Safe because setTimeout callbacks run on
//    the task queue, well after createCheckoutFsm() returns.
//
// 4. FORM DATA FLOWS THROUGH handle() EXTRA ARGS.
//    Components own ephemeral form state. On submit, they call
//    handle("next", formData). Handlers write formData to ctx and transition.
//    Context is the single mutation pathway for persistent data.
// =============================================================================

import { createFsm } from "machina";
import type { CheckoutContext, PaymentScenario } from "./types";

// How long paymentProcessing simulates work before firing an outcome.
// Long enough to be noticeable, short enough not to be annoying.
const PROCESSING_DELAY_MS = 1500;

/**
 * Returns a fresh context object with all fields at their default values.
 * Called once on FSM creation and again inside confirmation.startOver, where
 * the fields are copied onto the existing context object rather than replacing
 * it — so the shared reference held by the React layer stays valid.
 */
function makeInitialContext(): CheckoutContext {
    return {
        customerType: null,
        personalDetails: null,
        paymentDetails: null,
        paymentScenario: "success",
        returnTo: null,
        threeDSecureVerified: false,
    };
}

/**
 * Factory that creates a new checkout FSM instance along with the context
 * object it was initialized with. Returns both so the caller can hold the
 * same context reference the FSM mutates — avoiding any need to reach into
 * FSM internals to read updated values after transitions.
 *
 * Each call creates an independent FSM; calling this twice gives two separate
 * checkout flows that don't share state.
 *
 * @returns An object with `fsm` (the FSM instance) and `context` (the shared
 *   mutable context object that the FSM's handlers write to).
 */
function createCheckoutFsm() {
    // Create the context object separately so callers can hold a reference to
    // the same object the FSM uses internally. This avoids having to reach
    // into private FSM fields to get the context — the caller passes it in
    // and keeps the reference. The FSM mutates it; readers see the mutations.
    const context = makeInitialContext();

    // Declared as `let` (not `const`) so the setTimeout in paymentProcessing._onEnter
    // can close over this variable. By the time the first timer fires (1500ms),
    // the assignment below has completed and `fsmInstance` points to the right FSM.
    // This is intentionally scoped to the factory call — each CheckoutProvider
    // gets its own closure, so the callback always dispatches to the correct instance.
    let fsmInstance: ReturnType<typeof createFsm>;

    // eslint-disable-next-line prefer-const
    fsmInstance = createFsm({
        id: "checkout",
        initialState: "start",
        context,

        states: {
            // -----------------------------------------------------------------
            // start — customer type selection
            //
            // Two inputs: selectNewCustomer, selectReturningCustomer.
            // Both write customerType to context and advance to personalDetails.
            // No back from this step — it's the entry point.
            // -----------------------------------------------------------------
            start: {
                selectNewCustomer({ ctx }) {
                    ctx.customerType = "new";
                    return "personalDetails";
                },

                selectReturningCustomer({ ctx }) {
                    ctx.customerType = "returning";
                    return "personalDetails";
                },
            },

            // -----------------------------------------------------------------
            // personalDetails — name, email, address
            //
            // next: writes formData to ctx, then checks returnTo.
            //   returnTo === "review" → review (edit round-trip complete)
            //   otherwise → payment (normal forward flow)
            //
            // back: checks returnTo.
            //   returnTo === "review" → review (cancel edit, go back to summary)
            //   otherwise → start (beginning of the flow)
            // -----------------------------------------------------------------
            personalDetails: {
                next({ ctx }, formData) {
                    const data = formData as {
                        name: string;
                        email: string;
                        address: string;
                        city: string;
                        zip: string;
                    };
                    ctx.personalDetails = {
                        name: data.name,
                        email: data.email,
                        address: data.address,
                        city: data.city,
                        zip: data.zip,
                    };

                    if (ctx.returnTo === "review") {
                        return "review";
                    }
                    return "payment";
                },

                back({ ctx }) {
                    if (ctx.returnTo === "review") {
                        return "review";
                    }
                    return "start";
                },
            },

            // -----------------------------------------------------------------
            // payment — card details + scenario picker
            //
            // next: writes payment data and selected scenario to ctx.
            //   Always goes to paymentProcessing regardless of returnTo —
            //   payment must be processed even when editing from review.
            //
            // back: checks returnTo.
            //   returnTo === "review" → review (cancel payment edit)
            //   otherwise → personalDetails (normal backward flow)
            // -----------------------------------------------------------------
            payment: {
                next({ ctx }, formData) {
                    const data = formData as {
                        cardNumber: string;
                        expiry: string;
                        cvv: string;
                        scenario: PaymentScenario;
                    };
                    ctx.paymentDetails = {
                        cardNumber: data.cardNumber,
                        expiry: data.expiry,
                        cvv: data.cvv,
                    };
                    ctx.paymentScenario = data.scenario;
                    return "paymentProcessing";
                },

                back({ ctx }) {
                    if (ctx.returnTo === "review") {
                        return "review";
                    }
                    return "personalDetails";
                },
            },

            // -----------------------------------------------------------------
            // paymentProcessing — async simulation, no user inputs
            //
            // _onEnter: starts a 1500ms timer, then fires one of three inputs
            // based on ctx.paymentScenario (or fires `paymentSuccess` → review
            // directly if ctx.threeDSecureVerified is set — prevents the 3DS loop).
            //
            // Handlers: each is just a transition target string. The logic
            // lives in _onEnter; the handlers exist to accept the async result.
            // -----------------------------------------------------------------
            paymentProcessing: {
                _onEnter({ ctx }) {
                    setTimeout(() => {
                        // If the user already completed 3DS verification for this
                        // payment attempt, skip scenario logic entirely. Without this
                        // guard, re-entering paymentProcessing after 3DS would check
                        // ctx.paymentScenario ("threeDSecure") and loop forever.
                        if (ctx.threeDSecureVerified) {
                            fsmInstance.handle("paymentSuccess");
                            return;
                        }

                        if (ctx.paymentScenario === "success") {
                            fsmInstance.handle("paymentSuccess");
                        } else if (ctx.paymentScenario === "failure") {
                            fsmInstance.handle("paymentFailed");
                        } else {
                            fsmInstance.handle("threeDSecureRequired");
                        }
                    }, PROCESSING_DELAY_MS);
                },

                paymentSuccess: "review",
                paymentFailed: "paymentFailed",
                threeDSecureRequired: "threeDSecure",
            },

            // -----------------------------------------------------------------
            // paymentFailed — terminal error state with recovery options
            //
            // retry: go back to paymentProcessing and try again (same payment data)
            // editPayment: go back to payment form to change card details
            // -----------------------------------------------------------------
            paymentFailed: {
                retry: "paymentProcessing",
                editPayment({ ctx }) {
                    // Clear returnTo so the payment form's Back button uses normal
                    // backward flow (→ personalDetails) instead of returning to review.
                    // Without this, a stale returnTo = "review" from an earlier
                    // review.editPayment survives through paymentProcessing → paymentFailed
                    // and makes payment.back jump to review unexpectedly.
                    ctx.returnTo = null;
                    return "payment";
                },
            },

            // -----------------------------------------------------------------
            // threeDSecure — additional verification step
            //
            // completeVerification: sets the verified flag, then returns to
            // paymentProcessing. _onEnter will see the flag and skip to review.
            // -----------------------------------------------------------------
            threeDSecure: {
                completeVerification({ ctx }) {
                    ctx.threeDSecureVerified = true;
                    return "paymentProcessing";
                },
            },

            // -----------------------------------------------------------------
            // review — order summary, edit options, place order
            //
            // _onEnter: clears returnTo (edit round-trip is complete) and
            // threeDSecureVerified (reset for the next payment attempt, if the
            // user edits and reprocesses).
            //
            // editPersonalDetails / editPayment: set returnTo = "review" before
            // transitioning so the target state knows to come back here.
            //
            // placeOrder: advance to confirmation.
            // -----------------------------------------------------------------
            review: {
                _onEnter({ ctx }) {
                    ctx.returnTo = null;
                    ctx.threeDSecureVerified = false;
                },

                editPersonalDetails({ ctx }) {
                    ctx.returnTo = "review";
                    return "personalDetails";
                },

                editPayment({ ctx }) {
                    ctx.returnTo = "review";
                    return "payment";
                },

                placeOrder: "confirmation",
            },

            // -----------------------------------------------------------------
            // confirmation — terminal success state
            //
            // startOver: resets all context fields and returns to start.
            // The context object is mutated in place (not replaced) because the
            // hook holds a ref to the original object — replacing it would break
            // the shared reference.
            // -----------------------------------------------------------------
            confirmation: {
                startOver({ ctx }) {
                    const fresh = makeInitialContext();
                    ctx.customerType = fresh.customerType;
                    ctx.personalDetails = fresh.personalDetails;
                    ctx.paymentDetails = fresh.paymentDetails;
                    ctx.paymentScenario = fresh.paymentScenario;
                    ctx.returnTo = fresh.returnTo;
                    ctx.threeDSecureVerified = fresh.threeDSecureVerified;
                    return "start";
                },
            },
        },
    });

    return { fsm: fsmInstance, context };
}

export { createCheckoutFsm };
export { type CheckoutContext } from "./types";
