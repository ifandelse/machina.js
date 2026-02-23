// =============================================================================
// main.tsx — Entry point
//
// Mounts React, wraps the app in CheckoutProvider (which owns the FSM
// lifecycle), and renders App. The Provider is here so App can call
// useCheckout() without the Provider being in the same component tree node.
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { CheckoutProvider } from "./hooks/useCheckout";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
    throw new Error("[with-react] #root element not found in index.html");
}

createRoot(root).render(
    <StrictMode>
        <CheckoutProvider>
            <App />
        </CheckoutProvider>
    </StrictMode>
);
