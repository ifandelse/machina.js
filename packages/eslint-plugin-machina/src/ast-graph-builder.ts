// =============================================================================
// ast-graph-builder.ts — Build a StateGraph from an ESLint CallExpression AST
//
// Walks createFsm()/createBehavioralFsm() call sites and reconstructs a
// StateGraph without re-parsing (ESLint already has the AST). Returns null
// for any call site that can't be statically resolved — no false positives.
//
// Limitations:
//   - Spread properties in state objects are silently skipped.
//   - Computed keys are silently skipped.
//   - Only `const` identifier references are resolved; let/var and cross-module
//     imports are explicitly unsupported (returns null).
//   - _child FSM references must be inline createFsm()/createBehavioralFsm()
//     calls, or `const` identifier references to such calls. Cross-module
//     imports and let/var bindings are skipped silently.
//   - Circular _child references are detected via a visited Set and skipped.
// =============================================================================

import type { Rule } from "eslint";
import type { Node, CallExpression, ObjectExpression, Property } from "estree";
import {
    walkHandlerAst,
    type AstFunctionNode,
    type StateGraph,
    type StateNode,
    type TransitionEdge,
} from "machina-inspect";

// ESLint 9's SourceCode.getScope() returns a scope with a `variables` array
// and an `upper` reference. We walk upward to find the variable declaration.
interface EslintScope {
    variables: Array<{
        name: string;
        defs: Array<{
            type: string;
            node: {
                // VariableDeclarator
                init: Node | null;
                parent?: {
                    // VariableDeclaration
                    kind: string;
                };
            };
        }>;
    }>;
    upper: EslintScope | null;
}

// =============================================================================
// Scope resolution helpers
// =============================================================================

/**
 * Walk up the scope chain looking for a variable with the given name.
 */
function findVariableInScope(
    scope: EslintScope,
    name: string
): EslintScope["variables"][0] | undefined {
    let current: EslintScope | null = scope;
    while (current !== null) {
        const found = current.variables.find(v => v.name === name);
        if (found) {
            return found;
        }
        current = current.upper;
    }
    return undefined;
}

/**
 * Resolve a `const` variable's init node from the scope chain.
 * Returns null if the name isn't found, isn't `const`, or has no initializer.
 */
function resolveConstInit(name: string, scope: EslintScope): Node | null {
    const variable = findVariableInScope(scope, name);
    if (!variable) {
        return null;
    }

    const def = variable.defs[0];
    // Only trust Variable defs with a const parent — let/var may be reassigned.
    if (def?.type !== "Variable" || def.node.parent?.kind !== "const") {
        return null;
    }

    return def.node.init ?? null;
}

/**
 * Resolve a CallExpression argument to an ObjectExpression.
 *
 * - ObjectExpression → returned directly.
 * - Identifier pointing to a `const` ObjectExpression → resolved via scope.
 * - Anything else → null (silently unsupported).
 */
function resolveObjectExpression(
    node: Node,
    sourceCode: Rule.RuleContext["sourceCode"]
): ObjectExpression | null {
    if (node.type === "ObjectExpression") {
        return node as ObjectExpression;
    }

    if (node.type === "Identifier") {
        const scope = sourceCode.getScope(node) as unknown as EslintScope;
        const init = resolveConstInit((node as { name: string }).name, scope);
        if (init?.type === "ObjectExpression") {
            return init as ObjectExpression;
        }
    }

    return null;
}

/**
 * Resolve an Identifier to a createFsm()/createBehavioralFsm() CallExpression
 * by walking up the scope chain to find the `const` declaration.
 *
 * Returns null if the identifier doesn't point at a machina factory call.
 */
function resolveChildCallExpression(
    node: Node,
    sourceCode: Rule.RuleContext["sourceCode"]
): CallExpression | null {
    if (node.type !== "Identifier") {
        return null;
    }

    const scope = sourceCode.getScope(node) as unknown as EslintScope;
    const init = resolveConstInit((node as { name: string }).name, scope);
    if (init && isMachinaCall(init)) {
        return init as CallExpression;
    }

    return null;
}

/**
 * Check if a node is a createFsm() or createBehavioralFsm() CallExpression.
 */
function isMachinaCall(node: Node): boolean {
    if (node.type !== "CallExpression") {
        return false;
    }
    const callee = (node as CallExpression).callee;
    if (callee.type !== "Identifier") {
        return false;
    }
    const name = (callee as { name: string }).name;
    return name === "createFsm" || name === "createBehavioralFsm";
}

// =============================================================================
// AST node helpers
// =============================================================================

/**
 * Extract a string literal value from a node, or return null.
 */
function asStringLiteral(node: Node): string | null {
    if (node.type === "Literal" && typeof (node as { value: unknown }).value === "string") {
        return (node as { value: string }).value;
    }
    return null;
}

/**
 * Get the string name of a non-computed property key.
 * Returns null for computed keys or unusual key types.
 */
function getPropertyKeyName(prop: Property): string | null {
    const key = prop.key as Node;
    if (key.type === "Identifier") {
        return (key as { name: string }).name;
    }
    if (key.type === "Literal") {
        const val = (key as { value: unknown }).value;
        return typeof val === "string" ? val : null;
    }
    return null;
}

/**
 * Find a non-computed, non-spread property by name in an ObjectExpression.
 */
function findProperty(obj: ObjectExpression, name: string): Property | undefined {
    for (const prop of obj.properties) {
        if (prop.type !== "Property") {
            continue;
        }
        const p = prop as Property;
        if (p.computed) {
            continue;
        }
        if (getPropertyKeyName(p) === name) {
            return p;
        }
    }
    return undefined;
}

/**
 * Extract edges from a handler node (string literal shorthand or function).
 * Returns an array of TransitionEdge objects for the given state and input.
 */
function extractEdges(handlerNode: Node, stateName: string, inputName: string): TransitionEdge[] {
    // String shorthand: `input: "targetState"` → one definite edge
    const literalTarget = asStringLiteral(handlerNode);
    if (literalTarget !== null) {
        return [{ inputName, from: stateName, to: literalTarget, confidence: "definite" }];
    }

    // Function handler: walk its AST for return statements
    if (
        handlerNode.type === "FunctionExpression" ||
        handlerNode.type === "ArrowFunctionExpression"
    ) {
        const targets = walkHandlerAst(handlerNode as unknown as AstFunctionNode);
        return targets.map(({ target, confidence }) => ({
            inputName,
            from: stateName,
            to: target,
            confidence,
        }));
    }

    // Anything else (computed expression, call, etc.) — skip silently
    return [];
}

// =============================================================================
// State and handler walkers
// =============================================================================

/**
 * Resolve the CallExpression for a _child property value.
 * Returns null if the value is not a resolvable machina factory call.
 */
function resolveChildNode(
    childValue: Node,
    sourceCode: Rule.RuleContext["sourceCode"]
): CallExpression | null {
    if (isMachinaCall(childValue)) {
        return childValue as CallExpression;
    }
    if (childValue.type === "Identifier") {
        return resolveChildCallExpression(childValue, sourceCode);
    }
    return null;
}

/**
 * Walk the handler properties of a single state object, accumulating edges
 * and child graph references. Mutates `stateNode.edges` and `children`.
 */
function walkStateHandlers(
    stateObj: ObjectExpression,
    stateName: string,
    stateNode: StateNode,
    children: Record<string, StateGraph>,
    context: Rule.RuleContext,
    visited: Set<CallExpression>
): void {
    for (const handlerProp of stateObj.properties) {
        // Skip spread elements in state objects
        if (handlerProp.type !== "Property") {
            continue;
        }

        const hp = handlerProp as Property;
        if (hp.computed) {
            continue;
        }

        const inputName = getPropertyKeyName(hp);
        if (!inputName) {
            continue;
        }

        // _onExit produces no edges — it's a side-effect hook only
        if (inputName === "_onExit") {
            continue;
        }

        // _child: resolve to a child StateGraph if possible.
        // Supported: inline createFsm()/createBehavioralFsm() calls and
        // `const` identifier references to such calls.
        // Unsupported (silently skipped): cross-module imports, let/var.
        if (inputName === "_child") {
            const childCallNode = resolveChildNode(hp.value as Node, context.sourceCode);
            if (childCallNode !== null) {
                const childGraph = buildStateGraphFromAst(context, childCallNode, visited);
                if (childGraph !== null) {
                    children[stateName] = childGraph;
                }
            }
            continue;
        }

        const edges = extractEdges(hp.value as Node, stateName, inputName);
        stateNode.edges.push(...edges);
    }
}

/**
 * Process a single state Property, adding its node (and any child graph) to
 * the accumulated `nodes` and `children` maps. Skips spreads and computed keys.
 */
function processStateProp(
    stateProp: Property,
    nodes: Record<string, StateNode>,
    children: Record<string, StateGraph>,
    context: Rule.RuleContext,
    visited: Set<CallExpression>
): void {
    // Skip computed keys — `[expr]: ...`
    if (stateProp.computed) {
        return;
    }

    const stateName = getPropertyKeyName(stateProp);
    if (!stateName) {
        return;
    }

    const stateNode: StateNode = { name: stateName, edges: [] };

    // The state value must be an ObjectExpression to extract handlers
    if ((stateProp.value as Node).type !== "ObjectExpression") {
        nodes[stateName] = stateNode;
        return;
    }

    walkStateHandlers(
        stateProp.value as ObjectExpression,
        stateName,
        stateNode,
        children,
        context,
        visited
    );

    nodes[stateName] = stateNode;
}

/**
 * Walk the state properties of the states object, populating `nodes` and
 * `children`. Skips spreads and computed keys silently.
 */
function walkStates(
    statesObj: ObjectExpression,
    nodes: Record<string, StateNode>,
    children: Record<string, StateGraph>,
    context: Rule.RuleContext,
    visited: Set<CallExpression>
): void {
    for (const stateProp of statesObj.properties) {
        // Skip spread elements — we can't statically resolve them
        if (stateProp.type !== "Property") {
            continue;
        }
        processStateProp(stateProp as Property, nodes, children, context, visited);
    }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build a StateGraph from a createFsm()/createBehavioralFsm() CallExpression.
 *
 * Returns null if the call site cannot be statically resolved. Callers should
 * treat null as "no analysis possible" and report nothing — not an error.
 *
 * The `visited` set tracks CallExpression nodes already being built, guarding
 * against infinite recursion from circular _child references. The top-level
 * caller passes a fresh Set (default); recursive calls for child FSMs reuse it.
 */
export function buildStateGraphFromAst(
    context: Rule.RuleContext,
    callNode: CallExpression,
    visited: Set<CallExpression> = new Set()
): StateGraph | null {
    // Circular reference guard — if we're already building this node, skip it.
    if (visited.has(callNode)) {
        return null;
    }
    visited.add(callNode);

    if (callNode.arguments.length === 0) {
        return null;
    }

    const configNode = resolveObjectExpression(callNode.arguments[0] as Node, context.sourceCode);
    if (!configNode) {
        return null;
    }

    // Extract `id` — must be a string literal
    const idProp = findProperty(configNode, "id");
    if (!idProp) {
        return null;
    }
    const fsmId = asStringLiteral(idProp.value as Node);
    if (!fsmId) {
        return null;
    }

    // Extract `initialState` — must be a string literal
    const initialStateProp = findProperty(configNode, "initialState");
    if (!initialStateProp) {
        return null;
    }
    const initialState = asStringLiteral(initialStateProp.value as Node);
    if (!initialState) {
        return null;
    }

    // Extract `states` — must be an ObjectExpression
    const statesProp = findProperty(configNode, "states");
    if (!statesProp) {
        return null;
    }
    if ((statesProp.value as Node).type !== "ObjectExpression") {
        return null;
    }
    const statesObj = statesProp.value as ObjectExpression;

    const nodes: Record<string, StateNode> = {};
    const children: Record<string, StateGraph> = {};

    walkStates(statesObj, nodes, children, context, visited);

    return { fsmId, initialState, nodes, children };
}
