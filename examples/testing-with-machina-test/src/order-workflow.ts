import { createFsm } from "machina";

// An order processing workflow with branching paths and terminal states.
// "cancelled" and "refunded" are dead ends — no outbound transitions.
// This makes it a good target for reachability assertions.

export const createOrderWorkflow = () =>
    createFsm({
        id: "order-workflow",
        initialState: "placed",
        context: {},
        states: {
            placed: {
                validate: "validating",
            },
            validating: {
                approve: "processing",
                reject: "cancelled",
            },
            processing: {
                ship: "shipped",
                cancel: "cancelled",
            },
            shipped: {
                deliver: "delivered",
            },
            delivered: {
                refund: "refunded",
            },
            cancelled: {
                // Terminal — once cancelled, the order goes nowhere
            },
            refunded: {
                // Terminal — refund is the end of the line
            },
        },
    });
