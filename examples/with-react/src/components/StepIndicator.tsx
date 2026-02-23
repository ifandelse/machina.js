// =============================================================================
// StepIndicator.tsx — Horizontal progress indicator for the checkout flow
//
// Maps FSM states to 5 logical steps. The step before current shows as
// completed (green check), the active step is highlighted (blue), and
// upcoming steps are dimmed. Steps are not clickable — navigation happens
// through action buttons in each step component.
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";
import { STATE_TO_STEP, STEP_LABELS, type CheckoutStep } from "../types";

const TOTAL_STEPS = 5;

/**
 * Horizontal progress bar showing the five checkout steps. Reads FSM state
 * from useCheckout() and derives the active step via STATE_TO_STEP — steps
 * are display-only, not interactive.
 */
export function StepIndicator() {
    const { state } = useCheckout();
    const activeStep = STATE_TO_STEP[state];

    const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => i as CheckoutStep);

    return (
        <nav className="step-indicator" aria-label="Checkout progress">
            {steps.map((step, index) => {
                let stepClass = "step--upcoming";
                if (step === activeStep) {
                    stepClass = "step--active";
                } else if (step < activeStep) {
                    stepClass = "step--completed";
                }

                const isCompleted = step < activeStep;
                const connectorClass =
                    index < TOTAL_STEPS - 1
                        ? isCompleted || (step === activeStep - 1 && activeStep > 0)
                            ? "step-indicator__connector step-indicator__connector--completed"
                            : "step-indicator__connector"
                        : null;

                return (
                    <div key={step} style={{ display: "contents" }}>
                        <div
                            className={`step-indicator__step ${stepClass}`}
                            aria-current={step === activeStep ? "step" : undefined}
                        >
                            <div className="step-indicator__dot">
                                {isCompleted ? "✓" : step + 1}
                            </div>
                            <span className="step-indicator__label">{STEP_LABELS[step]}</span>
                        </div>
                        {connectorClass !== null && (
                            <div className={connectorClass} aria-hidden="true" />
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
