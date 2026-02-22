// =============================================================================
// ReviewStep.tsx — Order summary before placing
//
// Shows committed personalDetails and paymentDetails from context. Edit buttons
// transition to the corresponding form steps, setting ctx.returnTo = "review"
// in the FSM (via editPersonalDetails / editPayment handlers) so those steps
// know to come back here after submission.
//
// Card number is masked to last 4 digits — a small UX touch that also shows
// how to read and transform context data in a component.
// =============================================================================

import { useCheckout } from "../hooks/useCheckout";

// Mask card number to last 4 digits. The raw number may have spaces or dashes;
// strip non-digits first to get a clean last-4.
function maskedCard(cardNumber: string): string {
    const digits = cardNumber.replace(/\D/g, "");
    const last4 = digits.slice(-4);
    return `•••• •••• •••• ${last4 || "????"}`;
}

/**
 * Order summary screen. Displays the committed personalDetails and paymentDetails
 * from context, with edit buttons that trigger review → form → review round-trips
 * via the FSM's editPersonalDetails and editPayment inputs.
 */
export function ReviewStep() {
    const { context, handle, canHandle } = useCheckout();

    const personal = context.personalDetails;
    const payment = context.paymentDetails;

    return (
        <div className="step-card">
            <h2 className="step-card__title">Review Your Order</h2>

            {/* Personal Details section */}
            <div className="review-section">
                <div className="review-section__header">
                    <span className="review-section__title">Personal Details</span>
                    <button
                        type="button"
                        className="review-section__edit"
                        onClick={() => handle("editPersonalDetails")}
                        disabled={!canHandle("editPersonalDetails")}
                    >
                        Edit
                    </button>
                </div>

                {personal ? (
                    <>
                        <div className="review-data-row">
                            <span className="review-data-label">Name</span>
                            <span className="review-data-value">{personal.name}</span>
                        </div>
                        <div className="review-data-row">
                            <span className="review-data-label">Email</span>
                            <span className="review-data-value">{personal.email}</span>
                        </div>
                        <div className="review-data-row">
                            <span className="review-data-label">Address</span>
                            <span className="review-data-value">{personal.address}</span>
                        </div>
                        <div className="review-data-row">
                            <span className="review-data-label">City / ZIP</span>
                            <span className="review-data-value">
                                {personal.city}, {personal.zip}
                            </span>
                        </div>
                    </>
                ) : (
                    <p style={{ color: "#8b949e", fontSize: "0.875rem" }}>No data</p>
                )}
            </div>

            {/* Payment section */}
            <div className="review-section">
                <div className="review-section__header">
                    <span className="review-section__title">Payment</span>
                    <button
                        type="button"
                        className="review-section__edit"
                        onClick={() => handle("editPayment")}
                        disabled={!canHandle("editPayment")}
                    >
                        Edit
                    </button>
                </div>

                {payment ? (
                    <>
                        <div className="review-data-row">
                            <span className="review-data-label">Card</span>
                            <span className="review-data-value" style={{ fontFamily: "monospace" }}>
                                {maskedCard(payment.cardNumber)}
                            </span>
                        </div>
                        <div className="review-data-row">
                            <span className="review-data-label">Expiry</span>
                            <span className="review-data-value">{payment.expiry}</span>
                        </div>
                    </>
                ) : (
                    <p style={{ color: "#8b949e", fontSize: "0.875rem" }}>No data</p>
                )}
            </div>

            <div className="btn-row">
                <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => handle("placeOrder")}
                    disabled={!canHandle("placeOrder")}
                >
                    Place Order
                </button>
            </div>
        </div>
    );
}
