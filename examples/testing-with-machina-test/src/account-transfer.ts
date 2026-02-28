/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFsm } from "machina";

// =============================================================================
// Account Transfer — an FSM with handler logic that static analysis can't reach
//
// Unlike the order-workflow (all string-shorthand handlers), this FSM has
// conditional transitions and context mutations. That makes it a target for
// walkAll: randomized inputs will exercise code paths that toAlwaysReach and
// toNeverReach can't reason about, because they only see the graph topology.
//
// The invariant: balance must never go negative. The guard in validating._onEnter
// should prevent this — but walkAll will find out for sure.
// =============================================================================

export const createAccountTransfer = (initialBalance: number) =>
    createFsm({
        id: "account-transfer",
        initialState: "idle" as const,
        context: {
            balance: initialBalance,
            transferAmount: 0,
        },
        states: {
            idle: {
                begin({ ctx }: any, ...extra: unknown[]) {
                    // The payload (transfer amount) comes as extra args
                    // to handle(). walkAll's payload generator controls this.
                    const amount = extra.length > 0 ? (extra[0] as number) : 0;
                    ctx.transferAmount = amount;
                    return "validating" as const;
                },
            },
            validating: {
                _onEnter({ ctx }: any) {
                    // Guard: if the transfer would overdraw, bounce to failed
                    if (ctx.transferAmount > ctx.balance) {
                        return "failed" as const;
                    }
                    return "transferring" as const;
                },
            },
            transferring: {
                _onEnter({ ctx }: any) {
                    // Deduct — the guard in validating already checked we can afford it
                    ctx.balance -= ctx.transferAmount;
                    ctx.transferAmount = 0;
                    return "completed" as const;
                },
            },
            completed: {
                reset: "idle" as const,
            },
            failed: {
                reset: "idle" as const,
            },
        },
    });
