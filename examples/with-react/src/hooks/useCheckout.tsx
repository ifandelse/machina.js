import { createContext, useContext, useRef, type ReactNode } from "react";
import {
    useFsm,
    useFsmSelector,
    type FsmSnapshot,
    type UseFsmSelectorOptions,
} from "machina-react";
import type { ContextOf, StateNamesOfInstance } from "machina";
import { createCheckoutFsm } from "../fsm";

type CheckoutFsm = ReturnType<typeof createCheckoutFsm>["fsm"];
type CheckoutSnapshot = FsmSnapshot<StateNamesOfInstance<CheckoutFsm>, ContextOf<CheckoutFsm>>;

const CheckoutFsmContext = createContext<CheckoutFsm | null>(null);

interface CheckoutProviderProps {
    children: ReactNode;
}

export const CheckoutProvider = ({ children }: Readonly<CheckoutProviderProps>) => {
    const fsmRef = useRef<CheckoutFsm | null>(null);

    if (!fsmRef.current) {
        fsmRef.current = createCheckoutFsm().fsm;
    }

    return (
        <CheckoutFsmContext.Provider value={fsmRef.current}>{children}</CheckoutFsmContext.Provider>
    );
};

const useCheckoutFsm = (): CheckoutFsm => {
    const fsm = useContext(CheckoutFsmContext);
    if (!fsm) {
        throw new Error("useCheckout must be used inside a CheckoutProvider");
    }
    return fsm;
};

export const useCheckout = () => {
    return useFsm(useCheckoutFsm());
};

export const useCheckoutSelector = <TSelected,>(
    selector: (snapshot: CheckoutSnapshot) => TSelected,
    options?: UseFsmSelectorOptions<TSelected>
) => {
    return useFsmSelector(useCheckoutFsm(), selector, options);
};
