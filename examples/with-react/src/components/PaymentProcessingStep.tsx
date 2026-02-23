// =============================================================================
// PaymentProcessingStep.tsx — Loading state while the FSM simulates payment
//
// No user actions in this state. The FSM's paymentProcessing._onEnter fires a
// setTimeout that will call handle() after 1500ms. Components just wait.
// =============================================================================

/**
 * Passive loading screen shown while the FSM's paymentProcessing._onEnter
 * timer runs. No user interaction is possible here — the FSM drives the
 * transition automatically after PROCESSING_DELAY_MS.
 */
export function PaymentProcessingStep() {
    return (
        <div className="step-card">
            <div className="processing-container">
                <div className="spinner" aria-hidden="true" />
                <p className="processing-label">Processing payment...</p>
            </div>
        </div>
    );
}
