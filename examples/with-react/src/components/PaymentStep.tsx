// =============================================================================
// PaymentStep.tsx — Card details form + scenario picker
//
// The scenario picker is React state only — the FSM doesn't know about it.
// It controls what paymentProcessing._onEnter simulates. The selected scenario
// is passed to handle("next", { ..., scenario }) and written to ctx by the handler.
//
// Local form state is initialized from context.paymentDetails on mount to
// handle the edit-from-review case.
// =============================================================================

import { useState } from "react";
import { useCheckout } from "../hooks/useCheckout";
import type { PaymentScenario } from "../types";

const SCENARIOS: { value: PaymentScenario; label: string; description: string }[] = [
    { value: "success", label: "Success", description: "Payment clears immediately" },
    { value: "failure", label: "Failure", description: "Payment is declined" },
    { value: "threeDSecure", label: "3D Secure", description: "Additional verification required" },
];

/**
 * Collects card details and lets the user pick a payment outcome scenario.
 * The scenario picker is purely a demo affordance — it controls what
 * paymentProcessing._onEnter simulates after its delay.
 */
export function PaymentStep() {
    const { context, handle, canHandle } = useCheckout();

    const defaultData = context.paymentDetails;

    const [cardNumber, setCardNumber] = useState(defaultData?.cardNumber ?? "");
    const [expiry, setExpiry] = useState(defaultData?.expiry ?? "");
    const [cvv, setCvv] = useState(defaultData?.cvv ?? "");
    // Scenario picker defaults to whatever was last used (always "success" on
    // first reach, since makeInitialContext sets it). On edit round-trips, this
    // restores the previously selected scenario.
    const [scenario, setScenario] = useState<PaymentScenario>(context.paymentScenario);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canHandle("next")) {
            return;
        }
        handle("next", { cardNumber, expiry, cvv, scenario });
    }

    return (
        <div className="step-card">
            <h2 className="step-card__title">Payment Information</h2>

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label" htmlFor="pay-cardnumber">
                        Card Number
                    </label>
                    <input
                        id="pay-cardnumber"
                        className="form-input"
                        type="text"
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value)}
                        placeholder="4242 4242 4242 4242"
                        autoComplete="cc-number"
                        maxLength={19}
                        required
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="pay-expiry">
                            Expiry
                        </label>
                        <input
                            id="pay-expiry"
                            className="form-input"
                            type="text"
                            value={expiry}
                            onChange={e => setExpiry(e.target.value)}
                            placeholder="MM/YY"
                            autoComplete="cc-exp"
                            maxLength={5}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="pay-cvv">
                            CVV
                        </label>
                        <input
                            id="pay-cvv"
                            className="form-input"
                            type="text"
                            value={cvv}
                            onChange={e => setCvv(e.target.value)}
                            placeholder="123"
                            autoComplete="cc-csc"
                            maxLength={4}
                            required
                        />
                    </div>
                </div>

                {/* Scenario picker — demo control only, not part of real checkout */}
                <div className="form-group" style={{ marginTop: 20 }}>
                    <div className="radio-group-label">
                        Outcome Scenario (demo control — pick what happens next)
                    </div>
                    <div className="radio-group">
                        {SCENARIOS.map(s => (
                            <label
                                key={s.value}
                                className={`radio-option${scenario === s.value ? " radio-option--selected" : ""}`}
                            >
                                <input
                                    type="radio"
                                    name="scenario"
                                    value={s.value}
                                    checked={scenario === s.value}
                                    onChange={() => setScenario(s.value)}
                                />
                                <div>
                                    <div>{s.label}</div>
                                    <div style={{ fontSize: "0.75rem", color: "#8b949e" }}>
                                        {s.description}
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="btn-row">
                    <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => handle("back")}
                        disabled={!canHandle("back")}
                    >
                        Back
                    </button>
                    <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={!canHandle("next")}
                    >
                        Next
                    </button>
                </div>
            </form>
        </div>
    );
}
