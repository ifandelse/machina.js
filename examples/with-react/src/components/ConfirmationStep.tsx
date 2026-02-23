// =============================================================================
// ConfirmationStep.tsx — Terminal success state
//
// Order is placed. Shows a success message and a "Start Over" button.
// startOver resets all context fields in the FSM and transitions back to
// "start" — the full flow can be repeated without refreshing the page.
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";

/**
 * Terminal success screen. The "Start Over" button triggers confirmation.startOver,
 * which resets all context fields in-place and returns to the start state —
 * the full flow can be re-run without a page refresh.
 */
export function ConfirmationStep() {
    const { handle, canHandle } = useCheckout();

    return (
        <div className="step-card">
            <div className="confirmation-container">
                <div className="confirmation-icon">🎉</div>
                <h2 className="confirmation-title">Order Placed!</h2>
                <p className="confirmation-message">
                    Your order has been confirmed. A receipt has been sent to your email.
                </p>
                <p
                    className="confirmation-message"
                    style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
                >
                    (This is a machina.js v6 demo — no real order was placed)
                </p>

                <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => handle("startOver")}
                    disabled={!canHandle("startOver")}
                    style={{ marginTop: 8 }}
                >
                    Start Over
                </button>
            </div>
        </div>
    );
}
