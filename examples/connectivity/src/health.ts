// =============================================================================
// health.ts — Simulated health check for the Connectivity Monitor
//
// Replaces a real server endpoint with a client-side simulation. The FSM
// doesn't care whether the async operation is a real HTTP call or a timer —
// it just needs a Promise<{ ok: boolean }> and an AbortSignal for cleanup.
//
// This lets the example work both in local dev (pnpm dev) and as a static
// deploy (gh-pages) without a backend process.
// =============================================================================

// Delay before the health check resolves in normal mode.
// Matches the artificial delay the old Vite dev server plugin used, so the
// "checking" state is visible long enough to be meaningful in the UI.
const HEALTH_CHECK_DELAY_MS = 2000;

// Shorter delay in simulation mode — just enough to show the "checking" state
// flash before transitioning to offline.
const SIMULATED_FAILURE_DELAY_MS = 500;

// When true, checkHealth resolves with { ok: false } instead of { ok: true }.
// Toggled by the simulation button in main.ts via setSimulationMode().
let _simulationMode = false;

export function setSimulationMode(enabled: boolean): void {
    _simulationMode = enabled;
}

/**
 * Simulates a health check probe. Returns a Promise that resolves with
 * { ok: boolean } after a delay, mirroring the shape of a fetch Response
 * so the FSM's .then(res => res.ok) chains work unchanged.
 *
 * Respects the provided AbortSignal — if the caller aborts (e.g., the FSM
 * leaves a state while a check is in flight), the promise rejects immediately,
 * same as an aborted fetch would.
 */
export function checkHealth(signal: AbortSignal): Promise<{ ok: boolean }> {
    return new Promise((resolve, reject) => {
        // Already aborted before we started — reject immediately.
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }

        const delay = _simulationMode ? SIMULATED_FAILURE_DELAY_MS : HEALTH_CHECK_DELAY_MS;
        const ok = !_simulationMode;

        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve({ ok });
        }, delay);

        function onAbort() {
            clearTimeout(timer);
            reject(signal.reason);
        }

        signal.addEventListener("abort", onAbort, { once: true });
    });
}
