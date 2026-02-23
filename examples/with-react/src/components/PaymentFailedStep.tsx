// =============================================================================
// PaymentFailedStep.tsx — Payment declined, recovery options
//
// Two recovery paths:
//   retry     → back to paymentProcessing with the same card (try again)
//   editPayment → back to the payment form (change card details)
//
// Both check canHandle() to keep the button enable/disable pattern consistent
// across all steps.
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";

/**
 * Shown when the "failure" scenario fires in paymentProcessing. Offers two
 * recovery paths: retry with the same card data, or go back to fix the card.
 */
export function PaymentFailedStep() {
    const { handle, canHandle } = useCheckout();

    return (
        <div className="step-card">
            <div className="error-icon">❌</div>
            <h2 className="step-card__title error-message">Payment Failed</h2>
            <p style={{ color: "#8b949e", margin: "0 0 20px", fontSize: "0.9rem" }}>
                Your payment could not be processed. You can try again with the same card or update
                your payment details.
            </p>

            <div className="btn-row" style={{ justifyContent: "flex-start" }}>
                <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handle("editPayment")}
                    disabled={!canHandle("editPayment")}
                >
                    Edit Payment Info
                </button>
                <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => handle("retry")}
                    disabled={!canHandle("retry")}
                >
                    Retry Payment
                </button>
            </div>
        </div>
    );
}
