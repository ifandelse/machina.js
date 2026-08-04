import { shallowEqual } from "./shallow-equal";

describe("shallowEqual", () => {
    describe("when both values are the same reference", () => {
        const value = { state: "idle" };
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual(value, value);
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when object keys and values match shallowly", () => {
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual({ state: "idle", count: 1 }, { state: "idle", count: 1 });
        });

        it("should return true", () => {
            expect(result).toBe(true);
        });
    });

    describe("when object values differ", () => {
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual({ state: "idle", count: 1 }, { state: "idle", count: 2 });
        });

        it("should return false", () => {
            expect(result).toBe(false);
        });
    });

    describe("when object key counts differ", () => {
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual({ state: "idle" }, { state: "idle", count: 1 });
        });

        it("should return false", () => {
            expect(result).toBe(false);
        });
    });

    describe("when object keys differ with the same key count", () => {
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual({ state: "idle" }, { phase: "idle" });
        });

        it("should return false", () => {
            expect(result).toBe(false);
        });
    });

    describe("when either value is not an object", () => {
        let result: boolean;

        beforeEach(() => {
            result = shallowEqual("idle", { state: "idle" });
        });

        it("should return false", () => {
            expect(result).toBe(false);
        });
    });
});
