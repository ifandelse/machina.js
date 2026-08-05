/* eslint-disable @typescript-eslint/no-explicit-any */
export default {};

import { cloneDeep, cloneJsonSafe, NonSerializableValueError } from "./json-safe";

// =============================================================================
// cloneJsonSafe()
// =============================================================================

describe("cloneJsonSafe", () => {
    // =========================================================================
    // Values that pass the walk
    // =========================================================================

    describe("when the value is null", () => {
        let result: unknown;

        beforeEach(() => {
            result = cloneJsonSafe(null, "root");
        });

        it("should return null", () => {
            expect(result).toBeNull();
        });
    });

    describe("when the value is a boolean", () => {
        let result: unknown;

        beforeEach(() => {
            result = cloneJsonSafe(false, "root");
        });

        it("should return the boolean unchanged", () => {
            expect(result).toBe(false);
        });
    });

    describe("when the value is a string", () => {
        let result: unknown;

        beforeEach(() => {
            result = cloneJsonSafe("cal zone", "root");
        });

        it("should return the string unchanged", () => {
            expect(result).toBe("cal zone");
        });
    });

    describe("when the value is a finite number", () => {
        let result: unknown;

        beforeEach(() => {
            result = cloneJsonSafe(8675309, "root");
        });

        it("should return the number unchanged", () => {
            expect(result).toBe(8675309);
        });
    });

    describe("when the value is a plain object with null-prototype", () => {
        let source: object, result: unknown;

        beforeEach(() => {
            source = Object.assign(Object.create(null), { zip: "90210" });
            result = cloneJsonSafe(source, "root");
        });

        it("should clone the object", () => {
            expect(result).toEqual({ zip: "90210" });
        });
    });

    describe("when the value is a deeply nested plain object/array combo", () => {
        let source: Record<string, unknown>, result: unknown;

        beforeEach(() => {
            source = {
                name: "Cal Zone",
                tags: ["geeky", "playful", null],
                address: {
                    city: "Springfield",
                    zip: "90210",
                    nested: { deep: [1, 2, { ok: true }] },
                },
            };
            result = cloneJsonSafe(source, "root");
        });

        it("should clone the full structure", () => {
            expect(result).toEqual(source);
        });

        it("should return a new object, not the same reference", () => {
            expect(result).not.toBe(source);
        });

        it("should return a new nested object, not an aliased reference", () => {
            expect((result as any).address).not.toBe(source.address);
        });

        it("should return a new array, not an aliased reference", () => {
            expect((result as any).tags).not.toBe(source.tags);
        });
    });

    describe("when the same object reference appears twice without a cycle", () => {
        let shared: Record<string, unknown>, result: unknown;

        beforeEach(() => {
            shared = { count: 1 };
            result = cloneJsonSafe([shared, shared], "root");
        });

        it("should clone both occurrences without throwing", () => {
            expect(result).toEqual([{ count: 1 }, { count: 1 }]);
        });
    });

    // =========================================================================
    // Values that throw — one test per distinct branch in cloneNode/cloneObject
    // =========================================================================

    describe("when the value is undefined", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(undefined, "args[0]");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the undefined label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "args[0]", label: "undefined" });
        });
    });

    describe("when the value is a function", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(() => "kaboom", "args[1].onComplete");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the function label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "args[1].onComplete", label: "function" });
        });
    });

    describe("when the value is a symbol", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(Symbol("E_SOGGY_STROMBOLI"), "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the symbol label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "symbol" });
        });
    });

    describe("when the value is a bigint", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(BigInt(90210), "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the bigint label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "bigint" });
        });
    });

    describe("when the value is NaN", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(NaN, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the NaN label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "NaN" });
        });
    });

    describe("when the value is positive Infinity", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(Infinity, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the Infinity label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "Infinity" });
        });
    });

    describe("when the value is negative Infinity", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(-Infinity, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the -Infinity label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "-Infinity" });
        });
    });

    describe("when the value is a Date instance", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(new Date("1985-07-03"), "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the constructor name as the label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "Date" });
        });
    });

    describe("when the value is a Map instance", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(new Map([["cal", "zone"]]), "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the constructor name as the label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "Map" });
        });
    });

    describe("when the value is a class instance", () => {
        class Robot {
            model = "B-9";
        }
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe(new Robot(), "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with the class name as the label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "Robot" });
        });
    });

    describe("when the value's prototype chain has no constructor", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            // A non-null, non-Object.prototype proto with nothing in its own
            // chain to name it — exercises the "constructor is missing" fallback.
            const namelessProto = Object.create(null);
            const obj = Object.create(namelessProto);
            try {
                cloneJsonSafe(obj, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError with a generic fallback label", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root", label: "object" });
        });
    });

    describe("when the value has a circular reference", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            const circular: Record<string, unknown> = { name: "Cal Zone" };
            circular.self = circular;
            try {
                cloneJsonSafe(circular, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw NonSerializableValueError naming the exact cyclic path", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "root.self", label: "circular reference" });
        });
    });

    describe("when a non-finite number is found deep in a nested structure", () => {
        let thrownError: NonSerializableValueError;

        beforeEach(() => {
            try {
                cloneJsonSafe({ retry: { onComplete: NaN } }, "args[1]");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should report the full dotted path to the offending value", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
            expect(thrownError).toMatchObject({ path: "args[1].retry.onComplete", label: "NaN" });
        });
    });

    describe("when the value is a very deeply nested plain structure", () => {
        let deep: unknown, result: unknown;

        beforeEach(() => {
            let node: Record<string, unknown> = { leaf: "Cal Zone" };
            for (let i = 0; i < 2000; i++) {
                node = { next: node };
            }
            deep = node;
            result = cloneJsonSafe(deep, "root");
        });

        it("should clone the full depth without a stack overflow", () => {
            expect(result).toEqual(deep);
        });
    });

    // =========================================================================
    // Regression guards for bugs found during hardening — the walk's stated
    // contract is "throw the moment it finds anything that isn't [...] a
    // plain array, or a plain object" (json-safe.ts:27-29). These three
    // inputs ARE representable as plain JSON-shaped data (a sparse slot, an
    // extra array property, a "__proto__"-named key); the walk previously
    // silently dropped the offending data instead of throwing, contradicting
    // that contract and the module's own stated purpose ("Silent loss is the
    // disease this feature cures"). Now fixed: sparse/non-plain arrays throw,
    // and "__proto__" is preserved as a real cloned data property.
    // =========================================================================

    describe("when the value is a sparse array with a hole", () => {
        let thrownError: NonSerializableValueError | undefined;

        beforeEach(() => {
            thrownError = undefined;
            const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
            try {
                cloneJsonSafe(sparse, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        it("should throw rather than silently cloning the hole unexamined", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
        });
    });

    describe("when the value is an array with a non-index own property", () => {
        let thrownError: NonSerializableValueError | undefined;

        beforeEach(() => {
            thrownError = undefined;
            const withExtra: unknown[] & { extra?: string } = [1, 2];
            withExtra.extra = "surprise";
            try {
                cloneJsonSafe(withExtra, "root");
            } catch (e) {
                thrownError = e as NonSerializableValueError;
            }
        });

        // The fix rejects sparse holes AND non-index properties with the same
        // length check (obj.length !== Object.keys(obj).length) — there's no
        // way to throw for one and silently preserve the other, since both
        // violate that equality identically. Throwing (not preserving) is the
        // correct call here: a non-index property wouldn't survive a real
        // JSON.stringify anyway, so "preserving" it in the in-memory clone
        // would just move the silent loss to re-serialization time instead of
        // eliminating it.
        it("should throw rather than silently dropping the extra property", () => {
            expect(thrownError).toBeInstanceOf(NonSerializableValueError);
        });
    });

    describe('when the value is a plain object with a genuine own "__proto__" property', () => {
        let hostile: Record<string, unknown>, cloned: Record<string, unknown>;

        beforeEach(() => {
            // Object literal syntax can't produce an OWN "__proto__" data property
            // (it sets the prototype instead) — JSON.parse can, since it builds
            // objects via CreateDataProperty rather than the assignment operator.
            hostile = JSON.parse('{"__proto__":{"evil":true},"safe":"ok"}');
            cloned = cloneJsonSafe(hostile, "root") as Record<string, unknown>;
        });

        it("should preserve '__proto__' as an own data property instead of silently reproto-ing the clone", () => {
            expect(Object.prototype.hasOwnProperty.call(cloned, "__proto__")).toBe(true);
        });

        it("should leave the clone's actual prototype untouched", () => {
            expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
        });
    });
});

// =============================================================================
// cloneDeep() — validation-free clone used by rehydrate()'s aliasing guard
// =============================================================================

describe("cloneDeep", () => {
    describe("when the value is a primitive", () => {
        let result: unknown;

        beforeEach(() => {
            result = cloneDeep("cal zone");
        });

        it("should return the primitive unchanged", () => {
            expect(result).toBe("cal zone");
        });
    });

    describe("when the value is a deeply nested plain object/array combo", () => {
        let source: Record<string, unknown>, result: unknown;

        beforeEach(() => {
            source = {
                name: "Cal Zone",
                tags: ["geeky", "playful", null],
                address: { city: "Springfield", zip: "90210" },
            };
            result = cloneDeep(source);
        });

        it("should clone the full structure", () => {
            expect(result).toEqual(source);
        });

        it("should return a new object, not the same reference", () => {
            expect(result).not.toBe(source);
        });

        it("should return a new nested object, not an aliased reference", () => {
            expect((result as any).address).not.toBe(source.address);
        });

        it("should return a new array, not an aliased reference", () => {
            expect((result as any).tags).not.toBe(source.tags);
        });
    });

    describe("when the value is a non-plain object (e.g. a Date)", () => {
        let source: Date, result: unknown;

        beforeEach(() => {
            source = new Date("1985-07-03");
            result = cloneDeep(source);
        });

        it("should pass the value through by reference rather than cloning or throwing", () => {
            expect(result).toBe(source);
        });
    });

    describe("when the value has a circular reference", () => {
        let circular: Record<string, unknown>, result: unknown;

        beforeEach(() => {
            circular = { name: "Cal Zone" };
            circular.self = circular;
            result = cloneDeep(circular);
        });

        it("should not throw or hang, and should keep the cyclic slot pointing at the original object", () => {
            expect((result as any).self).toBe(circular);
        });
    });

    describe('when the value has a genuine own "__proto__" property', () => {
        let hostile: Record<string, unknown>, cloned: Record<string, unknown>;

        beforeEach(() => {
            hostile = JSON.parse('{"__proto__":{"evil":true},"safe":"ok"}');
            cloned = cloneDeep(hostile) as Record<string, unknown>;
        });

        it("should preserve '__proto__' as an own data property instead of silently reproto-ing the clone", () => {
            expect(Object.prototype.hasOwnProperty.call(cloned, "__proto__")).toBe(true);
        });

        it("should leave the clone's actual prototype untouched", () => {
            expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
        });
    });

    describe("when the value is a sparse array with a hole", () => {
        let sparse: unknown[], result: unknown;

        beforeEach(() => {
            sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
            result = cloneDeep(sparse);
        });

        // Unlike cloneObject's array branch (used by cloneJsonSafe, which now
        // rejects this input via the obj.length !== Object.keys(obj).length
        // check), cloneDeep's array branch has no such check — it's
        // validation-free by design, feeding rehydrate()'s trust-the-snapshot
        // contract rather than dehydrate()'s throw-on-anything-unsafe one.
        it("should reproduce the hole without throwing, unlike cloneJsonSafe's validating walk", () => {
            expect(result).toEqual([1, undefined, 3]);
        });
    });
});
