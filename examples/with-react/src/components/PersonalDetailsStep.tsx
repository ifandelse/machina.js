// =============================================================================
// PersonalDetailsStep.tsx — Name, email, address form
//
// Two variants based on context.customerType:
//   "new"       → empty form, "Enter your details" heading
//   "returning" → pre-filled with RETURNING_CUSTOMER_DATA, "Confirm your info"
//
// Local form state is initialized from context.personalDetails on mount.
// This handles the edit-from-review case: when the user edits from review,
// this component re-mounts and pre-fills from what they entered before.
//
// Data flow: form state → handle("next", formData) → FSM handler → ctx.personalDetails
// The FSM is the only mutation pathway for persistent data.
// =============================================================================

import { useState } from "react";
import { useCheckout } from "../hooks/useCheckout";
import { RETURNING_CUSTOMER_DATA } from "../types";

/**
 * Collects name, email, and address. Pre-fills from existing context data on
 * edit round-trips (review → edit → back here) and from RETURNING_CUSTOMER_DATA
 * when the user selected "returning customer" in StartStep.
 */
export function PersonalDetailsStep() {
    const { context, handle, canHandle } = useCheckout();

    const isReturning = context.customerType === "returning";

    // Initialize from existing context data (handles edit-from-review round-trip)
    // or from RETURNING_CUSTOMER_DATA for returning customers.
    const defaultData = context.personalDetails ?? (isReturning ? RETURNING_CUSTOMER_DATA : null);

    const [name, setName] = useState(defaultData?.name ?? "");
    const [email, setEmail] = useState(defaultData?.email ?? "");
    const [address, setAddress] = useState(defaultData?.address ?? "");
    const [city, setCity] = useState(defaultData?.city ?? "");
    const [zip, setZip] = useState(defaultData?.zip ?? "");

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canHandle("next")) {
            return;
        }
        handle("next", { name, email, address, city, zip });
    }

    const heading = isReturning ? "Confirm your information" : "Enter your details";

    return (
        <div className="step-card">
            <h2 className="step-card__title">{heading}</h2>

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label" htmlFor="pd-name">
                        Full Name
                    </label>
                    <input
                        id="pd-name"
                        className="form-input"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Jane Smith"
                        autoComplete="name"
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="pd-email">
                        Email
                    </label>
                    <input
                        id="pd-email"
                        className="form-input"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="jane@example.com"
                        autoComplete="email"
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label" htmlFor="pd-address">
                        Address
                    </label>
                    <input
                        id="pd-address"
                        className="form-input"
                        type="text"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        placeholder="123 Main Street"
                        autoComplete="street-address"
                        required
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label" htmlFor="pd-city">
                            City
                        </label>
                        <input
                            id="pd-city"
                            className="form-input"
                            type="text"
                            value={city}
                            onChange={e => setCity(e.target.value)}
                            placeholder="Springfield"
                            autoComplete="address-level2"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="pd-zip">
                            ZIP Code
                        </label>
                        <input
                            id="pd-zip"
                            className="form-input"
                            type="text"
                            value={zip}
                            onChange={e => setZip(e.target.value)}
                            placeholder="62701"
                            autoComplete="postal-code"
                            required
                        />
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
