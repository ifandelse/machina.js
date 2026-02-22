// =============================================================================
// App.tsx — Root component, wires step indicator + active step component
//
// App reads `state` from useCheckout() and renders the matching step component.
// The switch is explicit (not a map) so TypeScript will flag unhandled states.
// CheckoutProvider wraps this in main.tsx — App can call useCheckout() freely.
// =============================================================================

import { useCheckout } from "./hooks/useCheckout";
import { StepIndicator } from "./components/StepIndicator";
import { StartStep } from "./components/StartStep";
import { PersonalDetailsStep } from "./components/PersonalDetailsStep";
import { PaymentStep } from "./components/PaymentStep";
import { PaymentProcessingStep } from "./components/PaymentProcessingStep";
import { PaymentFailedStep } from "./components/PaymentFailedStep";
import { ThreeDSecureStep } from "./components/ThreeDSecureStep";
import { ReviewStep } from "./components/ReviewStep";
import { ConfirmationStep } from "./components/ConfirmationStep";
import type { CheckoutState } from "./types";

/**
 * Renders the step component that matches the current FSM state. The switch
 * is intentionally exhaustive — if a new state is added to CheckoutState and
 * forgotten here, TypeScript will error rather than silently render nothing.
 */
function StepContent({ state }: Readonly<{ state: CheckoutState }>) {
    switch (state) {
        case "start":
            return <StartStep />;
        case "personalDetails":
            return <PersonalDetailsStep />;
        case "payment":
            return <PaymentStep />;
        case "paymentProcessing":
            return <PaymentProcessingStep />;
        case "paymentFailed":
            return <PaymentFailedStep />;
        case "threeDSecure":
            return <ThreeDSecureStep />;
        case "review":
            return <ReviewStep />;
        case "confirmation":
            return <ConfirmationStep />;
    }
}

/**
 * Root application component. Reads the current FSM state and delegates
 * rendering to StepContent + StepIndicator. Intentionally thin — all
 * checkout logic lives in the FSM and the hook layer.
 */
export function App() {
    const { state } = useCheckout();

    return (
        <div className="app">
            <header className="app-header">
                <h1 className="app-title">Checkout Flow</h1>
                <p className="app-subtitle">
                    machina.js v6 — <code>createFsm</code> + React integration
                </p>
            </header>

            <StepIndicator />

            <main>
                <StepContent state={state} />
            </main>
        </div>
    );
}
