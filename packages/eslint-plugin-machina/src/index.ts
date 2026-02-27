// =============================================================================
// index.ts — ESLint flat-config plugin for machina FSM static analysis
//
// Three rules surface machina-inspect findings inline in the editor:
//   - unreachable-state: dead states that can never be entered
//   - onenter-loop: _onEnter cycles that will infinite-loop the runtime
//   - missing-handler: states missing handlers that other states provide
// =============================================================================

import type { Linter } from "eslint";
import unreachableState from "./rules/unreachable-state";
import onenterLoop from "./rules/onenter-loop";
import missingHandler from "./rules/missing-handler";

const plugin = {
    meta: {
        name: "machina",
        version: "0.1.0",
    },
    rules: {
        "unreachable-state": unreachableState,
        "onenter-loop": onenterLoop,
        "missing-handler": missingHandler,
    },
    configs: {} as Record<string, Linter.Config>,
};

// recommended: onenter-loop are errors (structural bugs);
// missing-handler and unreachable-state are warnings (design gaps, often intentional).
plugin.configs["recommended"] = {
    plugins: { machina: plugin },
    rules: {
        "machina/unreachable-state": "warn",
        "machina/onenter-loop": "error",
        "machina/missing-handler": "off",
    },
};

export default plugin;
