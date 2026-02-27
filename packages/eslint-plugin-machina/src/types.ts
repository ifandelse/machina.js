// =============================================================================
// types.ts — Internal types for the ESLint plugin's AST graph builder
//
// Re-exports minimal ESTree node aliases used by ast-graph-builder.ts.
// @types/estree is a dev dep; these are convenience re-exports so the builder
// doesn't need long import paths everywhere.
// =============================================================================

import type {
    Node,
    ObjectExpression,
    Property,
    Identifier,
    FunctionExpression,
    ArrowFunctionExpression,
} from "estree";

export type {
    Node,
    ObjectExpression,
    Property,
    Identifier,
    FunctionExpression,
    ArrowFunctionExpression,
};
