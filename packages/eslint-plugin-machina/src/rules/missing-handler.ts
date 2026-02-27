// =============================================================================
// rules/missing-handler.ts — Report states that are missing handlers for
// inputs that other states in the same FSM handle.
//
// This is a "suggestion" — asymmetric state handlers are sometimes intentional
// (e.g., a terminal "done" state that handles nothing). Wire as "warn" in the
// recommended config so users can disable per-file if needed.
// =============================================================================

import type { Rule } from "eslint";
import type { CallExpression } from "estree";
import { buildStateGraphFromAst } from "../ast-graph-builder";
import { inspectGraph } from "machina-inspect";

const FINDING_TYPE = "missing-handler" as const;

const rule: Rule.RuleModule = {
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Detect states that are missing handlers for inputs that other states handle. " +
                "May produce noise on FSMs with intentionally asymmetric state handlers.",
            recommended: true,
        },
        schema: [],
        messages: {
            [FINDING_TYPE]: "{{ message }}",
        },
    },
    create(context) {
        return {
            CallExpression(node: CallExpression) {
                const callee = node.callee;
                if (
                    callee.type !== "Identifier" ||
                    (callee.name !== "createFsm" && callee.name !== "createBehavioralFsm")
                ) {
                    return;
                }

                const graph = buildStateGraphFromAst(context, node);
                if (!graph) {
                    return;
                }

                const findings = inspectGraph(graph).filter(f => f.type === FINDING_TYPE);
                for (const finding of findings) {
                    context.report({
                        node,
                        messageId: FINDING_TYPE,
                        data: { message: finding.message },
                    });
                }
            },
        };
    },
};

export default rule;
