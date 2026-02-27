// =============================================================================
// rules/onenter-loop.ts — Report unconditional _onEnter transition cycles
// in a createFsm()/createBehavioralFsm() call.
//
// An unconditional _onEnter loop will infinite-loop the runtime: the FSM
// enters state A, which bounces to B, which bounces back to A, forever.
// =============================================================================

import type { Rule } from "eslint";
import type { CallExpression } from "estree";
import { buildStateGraphFromAst } from "../ast-graph-builder";
import { inspectGraph } from "machina-inspect";

const FINDING_TYPE = "onenter-loop" as const;

const rule: Rule.RuleModule = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Detect unconditional _onEnter transition cycles that will infinite-loop the runtime.",
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
