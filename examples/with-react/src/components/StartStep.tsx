// =============================================================================
// StartStep.tsx — Customer type selection (first step)
//
// Two options: new customer or returning customer. Each calls handle() directly
// with the appropriate input — no form submission needed. canHandle() drives
// button enabled state, demonstrating the pattern even on a simple step.
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";

/**
 * First step of the checkout flow. Lets the user identify themselves as a new
 * or returning customer, which the FSM uses to pre-fill PersonalDetailsStep.
 */
export function StartStep() {
    const { handle, canHandle } = useCheckout();

    return (
        <div className="step-card">
            <h2 className="step-card__title">How would you like to check out?</h2>

            <div className="customer-type-options">
                <button
                    type="button"
                    className="customer-type-btn"
                    onClick={() => handle("selectNewCustomer")}
                    disabled={!canHandle("selectNewCustomer")}
                >
                    <span className="customer-type-btn__icon">👤</span>
                    New Customer
                </button>

                <button
                    type="button"
                    className="customer-type-btn"
                    onClick={() => handle("selectReturningCustomer")}
                    disabled={!canHandle("selectReturningCustomer")}
                >
                    <span className="customer-type-btn__icon">🔄</span>
                    Returning Customer
                </button>
            </div>
        </div>
    );
}
