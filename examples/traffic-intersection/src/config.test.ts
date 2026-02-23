/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

// =============================================================================
// config.test.ts — Signal state lookup table coverage
//
// Verifies that every expected compositeState() string maps to the correct
// visual signal states, and that the missing-entry guard throws as expected.
//
// Branch analysis:
//   Path 1: known compositeState → returns correct SignalStates
//   Path 2: unknown compositeState → throws with descriptive message
// =============================================================================

import { getSignalStates } from "./config";

describe("config (getSignalStates)", () => {
    // =========================================================================
    // Path 1: Known composite states
    // =========================================================================

    describe("when northSouthPhase.green is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("northSouthPhase.green");
        });

        it("should set nsVehicle to green", () => {
            expect(result.nsVehicle).toBe("green");
        });

        it("should set nsPed to walk", () => {
            expect(result.nsPed).toBe("walk");
        });

        it("should set ewVehicle to red", () => {
            expect(result.ewVehicle).toBe("red");
        });

        it("should set ewPed to dontWalk", () => {
            expect(result.ewPed).toBe("dontWalk");
        });
    });

    describe("when northSouthPhase.interruptibleGreen is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("northSouthPhase.interruptibleGreen");
        });

        it("should set nsVehicle to green (still going)", () => {
            expect(result.nsVehicle).toBe("green");
        });

        it("should set nsPed to flashingDontWalk (crossing window closing)", () => {
            expect(result.nsPed).toBe("flashingDontWalk");
        });

        it("should set ewVehicle to red", () => {
            expect(result.ewVehicle).toBe("red");
        });
    });

    describe("when northSouthPhase.yellow is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("northSouthPhase.yellow");
        });

        it("should set nsVehicle to yellow", () => {
            expect(result.nsVehicle).toBe("yellow");
        });

        it("should set nsPed to dontWalk", () => {
            expect(result.nsPed).toBe("dontWalk");
        });
    });

    describe("when northSouthPhase.red is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("northSouthPhase.red");
        });

        it("should set nsVehicle to red", () => {
            expect(result.nsVehicle).toBe("red");
        });

        it("should set ewVehicle to red (all-red moment before clearance)", () => {
            expect(result.ewVehicle).toBe("red");
        });
    });

    describe("when clearanceNS is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("clearanceNS");
        });

        it("should return all-red all-dontWalk state", () => {
            expect(result).toEqual({
                nsVehicle: "red",
                nsPed: "dontWalk",
                ewVehicle: "red",
                ewPed: "dontWalk",
            });
        });
    });

    describe("when eastWestPhase.green is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("eastWestPhase.green");
        });

        it("should set ewVehicle to green", () => {
            expect(result.ewVehicle).toBe("green");
        });

        it("should set ewPed to walk", () => {
            expect(result.ewPed).toBe("walk");
        });

        it("should set nsVehicle to red", () => {
            expect(result.nsVehicle).toBe("red");
        });
    });

    describe("when eastWestPhase.interruptibleGreen is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("eastWestPhase.interruptibleGreen");
        });

        it("should set ewPed to flashingDontWalk", () => {
            expect(result.ewPed).toBe("flashingDontWalk");
        });

        it("should set ewVehicle to green", () => {
            expect(result.ewVehicle).toBe("green");
        });
    });

    describe("when eastWestPhase.yellow is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("eastWestPhase.yellow");
        });

        it("should set ewVehicle to yellow", () => {
            expect(result.ewVehicle).toBe("yellow");
        });
    });

    describe("when eastWestPhase.red is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("eastWestPhase.red");
        });

        it("should set ewVehicle to red", () => {
            expect(result.ewVehicle).toBe("red");
        });
    });

    describe("when clearanceEW is requested", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("clearanceEW");
        });

        it("should return all-red all-dontWalk state", () => {
            expect(result).toEqual({
                nsVehicle: "red",
                nsPed: "dontWalk",
                ewVehicle: "red",
                ewPed: "dontWalk",
            });
        });
    });

    // =========================================================================
    // Path 2: Unknown composite state → throws
    // =========================================================================

    describe("when an unknown compositeState is requested", () => {
        let thrownError: Error | null;

        beforeEach(() => {
            thrownError = null;
            try {
                getSignalStates("E_BOGUS_STATE.limbo");
            } catch (err) {
                thrownError = err as Error;
            }
        });

        it("should throw an Error", () => {
            expect(thrownError).not.toBeNull();
            expect(thrownError).toBeInstanceOf(Error);
        });

        it("should include the unknown composite state in the error message", () => {
            expect(thrownError!.message).toContain("E_BOGUS_STATE.limbo");
        });

        it("should hint at the lookup table fix in the error message", () => {
            expect(thrownError!.message).toContain("LOOKUP_TABLE");
        });
    });

    // =========================================================================
    // Edge cases — adversarial / boundary inputs
    // =========================================================================

    describe("when an empty string is requested", () => {
        let thrownError: Error | null;

        beforeEach(() => {
            thrownError = null;
            try {
                getSignalStates("");
            } catch (err) {
                thrownError = err as Error;
            }
        });

        it("should throw an Error", () => {
            expect(thrownError).toBeInstanceOf(Error);
        });

        it("should include the empty string in the error message", () => {
            expect(thrownError!.message).toContain('""');
        });
    });

    describe("when a whitespace-only string is requested", () => {
        let thrownError: Error | null;

        beforeEach(() => {
            thrownError = null;
            try {
                getSignalStates("   ");
            } catch (err) {
                thrownError = err as Error;
            }
        });

        it("should throw an Error (whitespace is not a valid composite state)", () => {
            expect(thrownError).toBeInstanceOf(Error);
        });
    });

    describe("when a prototype property name is requested", () => {
        let thrownError: Error | null;

        beforeEach(() => {
            thrownError = null;
            try {
                getSignalStates("constructor");
            } catch (err) {
                thrownError = err as Error;
            }
        });

        it("should throw an Error (prototype keys are not valid signal states)", () => {
            // Object.prototype.constructor exists on every plain object.
            // The lookup returns a Function, not a SignalStates object.
            // The !states falsy guard must catch this without crashing.
            expect(thrownError).toBeInstanceOf(Error);
        });
    });

    describe("when getSignalStates returns a result for a clearance state", () => {
        let nsResult: ReturnType<typeof getSignalStates>,
            ewResult: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            nsResult = getSignalStates("clearanceNS");
            ewResult = getSignalStates("clearanceEW");
        });

        it("should return the same all-red shape for clearanceNS and clearanceEW", () => {
            // Both clearance intervals are visually identical — all red, all dontWalk.
            // Verifying they're not accidentally swapped.
            expect(nsResult).toEqual(ewResult);
        });
    });

    describe("when nsVehicle is green", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("northSouthPhase.green");
        });

        it("should never show ewVehicle as green simultaneously", () => {
            // Two directions cannot both be green — that's a T-bone waiting to happen.
            expect(result.ewVehicle).not.toBe("green");
        });
    });

    describe("when ewVehicle is green", () => {
        let result: ReturnType<typeof getSignalStates>;

        beforeEach(() => {
            result = getSignalStates("eastWestPhase.green");
        });

        it("should never show nsVehicle as green simultaneously", () => {
            expect(result.nsVehicle).not.toBe("green");
        });
    });
});
