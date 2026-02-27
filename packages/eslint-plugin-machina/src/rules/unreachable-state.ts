// =============================================================================
// rules/unreachable-state.ts — Report states with no inbound path from
// initialState in a createFsm()/createBehavioralFsm() call.
// =============================================================================

import type { Rule } from "eslint";
import type { CallExpression } from "estree";
import { buildStateGraphFromAst } from "../ast-graph-builder";
import { inspectGraph } from "machina-inspect";

const FINDING_TYPE = "unreachable-state" as const;

const rule: Rule.RuleModule = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Detect states with no inbound path from the FSM's initialState. " +
                "Unreachable states are dead code — they can never be entered.",
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
