// =============================================================================
// ThreeDSecureStep.tsx — Additional verification step
//
// Simulates a bank's 3D Secure challenge page. In a real implementation this
// would be an iframe from the card network. Here it's a fake UI that lets
// the developer see the 3DS → paymentProcessing → review flow.
//
// completeVerification sets ctx.threeDSecureVerified = true in the FSM handler,
// then returns to paymentProcessing. paymentProcessing._onEnter checks the flag
// and auto-advances to review rather than re-running scenario logic (which would
// otherwise loop back to threeDSecure forever).
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";

/**
 * Simulates a bank's 3D Secure challenge. In production this would be an
 * iframe from the card network. Completing verification sets a flag in the
 * FSM context so paymentProcessing skips the scenario check on re-entry and
 * goes straight to review instead of looping back to 3DS.
 */
export function ThreeDSecureStep() {
    const { handle, canHandle } = useCheckout();

    return (
        <div className="step-card">
            <h2 className="step-card__title">Additional Verification Required</h2>

            <div className="verification-box">
                <p>
                    <strong>Secure Authentication</strong>
                </p>
                <p>
                    Your bank requires additional verification for this transaction. Please confirm
                    your identity to complete the payment.
                </p>
                <p style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "#58a6ff" }}>
                    [Simulated bank authentication portal]
                </p>
            </div>

            <div className="btn-row">
                <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => handle("completeVerification")}
                    disabled={!canHandle("completeVerification")}
                >
                    Complete Verification
                </button>
            </div>
        </div>
    );
}
