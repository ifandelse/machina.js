// =============================================================================
// json-safe.ts — Recursive walk that validates AND deep-clones plain data.
//
// dehydrate() needs a hard guarantee: everything it hands back either survives
// a serialization boundary intact, or the call throws. JSON.stringify can't be
// trusted for this — it silently drops functions/undefined and mangles Date
// into a string. Silent data loss is exactly what dehydrate() exists to
// prevent, so every unsupported value throws instead of vanishing, and the
// error names precisely where in the structure it was found.
// =============================================================================

/**
 * Thrown internally when the walk hits a value that can't survive a
 * serialization boundary. Callers catch this to attach FSM/input context
 * before re-throwing a fully descriptive error — see `path`/`label` below.
 */
export class NonSerializableValueError extends Error {
    constructor(
        readonly path: string,
        readonly label: string
    ) {
        super(`non-serializable value at ${path} (${label})`);
    }
}

/**
 * Deep-clones `value`, throwing `NonSerializableValueError` the moment it
 * finds anything that isn't `null`, a boolean, a finite number, a string, a
 * plain array, or a plain object. `rootPath` seeds the path used in error
 * messages — e.g. `"args"` so a nested failure reads as `args[1].onComplete`.
 *
 * Cloning (rather than just validating) is what keeps a returned snapshot
 * from aliasing live FSM state: mutating the snapshot afterward — or the
 * original value passed into a deferred `handle()` call — can't reach back
 * into the FSM's internal deferred queue.
 */
export const cloneJsonSafe = (value: unknown, rootPath: string): unknown => {
    return cloneNode(value, rootPath, new Set<object>());
};

const cloneNode = (value: unknown, path: string, ancestors: Set<object>): unknown => {
    if (value === null) {
        return null;
    }

    switch (typeof value) {
        case "string":
        case "boolean":
            return value;
        case "number":
            if (!Number.isFinite(value)) {
                throw new NonSerializableValueError(path, describeNonFiniteNumber(value));
            }
            return value;
        case "object":
            return cloneObject(value as object, path, ancestors);
        default:
            // undefined, function, symbol, bigint — none of these survive JSON.
            throw new NonSerializableValueError(path, typeof value);
    }
};

const cloneObject = (obj: object, path: string, ancestors: Set<object>): unknown => {
    // Ancestor stack, not a global "seen" set — the same object appearing
    // twice in unrelated branches (a shared reference) is fine to serialize
    // twice. Only a value that contains ITSELF is a cycle.
    if (ancestors.has(obj)) {
        throw new NonSerializableValueError(path, "circular reference");
    }

    if (Array.isArray(obj)) {
        // A dense, index-only array has exactly one own key per element
        // ("0", "1", ...). A hole (sparse array) or an extra non-index
        // property (obj.extra = ...) breaks that equality — `.map()` would
        // otherwise skip holes and never visit non-index keys, silently
        // reproducing (for holes) or dropping (for extra keys) data instead
        // of throwing.
        if (obj.length !== Object.keys(obj).length) {
            throw new NonSerializableValueError(
                path,
                "sparse array or array with non-index properties"
            );
        }
        ancestors.add(obj);
        const cloned = obj.map((item, i) => cloneNode(item, `${path}[${i}]`, ancestors));
        ancestors.delete(obj);
        return cloned;
    }

    // Plain objects only — Date/Map/Set/class instances all have a
    // non-Object prototype and would otherwise be silently flattened to
    // "{}" by a naive walk.
    const proto = Object.getPrototypeOf(obj);
    if (proto !== Object.prototype && proto !== null) {
        throw new NonSerializableValueError(
            path,
            (obj as { constructor?: { name?: string } }).constructor?.name ?? "object"
        );
    }

    ancestors.add(obj);
    const cloned: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
        const value = cloneNode((obj as Record<string, unknown>)[key], `${path}.${key}`, ancestors);
        // Object.defineProperty, not `cloned[key] = value` — a key literally
        // named "__proto__" (producible via JSON.parse, unlike object-literal
        // syntax) would otherwise invoke Object.prototype's inherited
        // accessor and swap cloned's prototype instead of storing the data.
        Object.defineProperty(cloned, key, {
            value,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    ancestors.delete(obj);
    return cloned;
};

const describeNonFiniteNumber = (n: number): string => {
    if (Number.isNaN(n)) {
        return "NaN";
    }
    return n > 0 ? "Infinity" : "-Infinity";
};

/**
 * Deep-clones `value` WITHOUT validating it — unlike `cloneJsonSafe`, this
 * never throws. Plain objects/arrays are cloned recursively (so a caller
 * can't alias state back into whatever holds the result); anything else
 * (functions, `Date`/`Map`/class instances, symbols, non-finite numbers,
 * etc.) is passed through by reference as-is.
 *
 * This is `rehydrate()`'s side of the aliasing guarantee: `dehydrate()`
 * validates-and-clones on the way OUT (via `cloneJsonSafe`), but `rehydrate()`
 * trusts the snapshot it's given is already valid data — re-validating on
 * the way IN would be a redundant, unwanted asymmetry (see the build plan's
 * disclosed known gaps). We still need the clone so mutating the caller's
 * snapshot object after `rehydrate()` returns can't reach into the live
 * FSM's internal deferred queue.
 *
 * Cycle-safe: a value that contains itself is returned as-is (by reference)
 * rather than cloned infinitely — there's no validation step here to make
 * that throw, so silently keeping the shared reference is the only option
 * that doesn't hang.
 */
export const cloneDeep = (value: unknown, ancestors: Set<object> = new Set<object>()): unknown => {
    if (value === null || typeof value !== "object") {
        return value;
    }

    if (ancestors.has(value)) {
        return value;
    }

    if (Array.isArray(value)) {
        ancestors.add(value);
        const cloned = value.map(item => cloneDeep(item, ancestors));
        ancestors.delete(value);
        return cloned;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
        // Not a plain object (Date, Map, class instance, ...) — nothing to
        // safely walk into, and there's no validation step here to reject it.
        return value;
    }

    ancestors.add(value);
    const cloned: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
        const clonedValue = cloneDeep((value as Record<string, unknown>)[key], ancestors);
        // Same fix as cloneObject's loop in cloneJsonSafe: a key literally
        // named "__proto__" would otherwise reproto the clone via bracket
        // assignment instead of being stored as a data property.
        Object.defineProperty(cloned, key, {
            value: clonedValue,
            enumerable: true,
            writable: true,
            configurable: true,
        });
    }
    ancestors.delete(value);
    return cloned;
};
