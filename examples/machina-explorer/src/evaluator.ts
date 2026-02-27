// =============================================================================
// evaluator.ts — Evaluate a pasted FSM config string via new Function()
//
// Users paste a bare object literal (no `return`, no variable assignment).
// We wrap it in `return (...)` so eval can produce a value. If that fails
// because the source already contains `return`, we try without the wrapper.
// =============================================================================

import type { InspectInput } from "machina-inspect";

// The subset of InspectInput we accept from user-pasted configs.
// Live FSM instances aren't pasteable, so we only deal with config objects here.
type ConfigObject = {
    id?: string;
    initialState: string;
    states: Record<string, Record<string, unknown>>;
};

export type EvalResult = { ok: true; config: InspectInput } | { ok: false; error: string };

/**
 * Validate that an evaluated value has the shape of an FSM config object.
 * Returns null if valid, or an error message string if invalid.
 */
function validateShape(value: unknown): string | null {
    if (typeof value !== "object" || value === null) {
        return "Expected a config object, got " + typeof value;
    }
    const obj = value as Record<string, unknown>;
    if (!("initialState" in obj)) {
        return 'Config is missing required field "initialState"';
    }
    if (!("states" in obj)) {
        return 'Config is missing required field "states"';
    }
    return null;
}

/**
 * Evaluate a string of JavaScript that represents an FSM config object.
 *
 * Users paste bare object literals like `{ initialState: "red", states: {...} }`.
 * We try wrapping in `return (...)` first. If that produces a syntax error
 * (e.g. the source has its own `return`), we fall back to evaluating as-is.
 *
 * If the config is missing an `id` field we default it to "fsm" —
 * buildStateGraph requires an fsmId and we don't want to force users to
 * remember that field just to get a diagram.
 */
export function evaluateConfig(source: string): EvalResult {
    let value: unknown;

    // Try wrapping in return (...) so bare object literals work
    try {
        value = new Function("return (" + source + ")")();
    } catch (_wrappedErr) {
        // Fallback: try evaluating the source as-is (user may have written `return {...}`)
        try {
            value = new Function(source)();
        } catch (rawErr) {
            const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
            return { ok: false, error: "Syntax error: " + message };
        }
    }

    const shapeError = validateShape(value);
    if (shapeError !== null) {
        return { ok: false, error: shapeError };
    }

    const config = value as ConfigObject;

    // Default the id field — buildStateGraph uses it as fsmId.
    // ??= preserves an explicit empty string id; falsy check would overwrite it.
    config.id ??= "fsm";

    return { ok: true, config: config as InspectInput };
}
