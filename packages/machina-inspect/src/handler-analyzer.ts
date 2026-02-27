// =============================================================================
// handler-analyzer.ts — Acorn-based static analysis of function handlers
//
// Parses handler.toString() with acorn, walks the AST for ReturnStatement
// nodes that return string literals, and determines confidence based on
// whether the return is nested in a conditional or not.
//
// This is best-effort: we catch explicit `return "stateName"` patterns.
// Dynamic returns (variables, template literals, computed expressions) are
// silently skipped — we produce no false edges, just miss some.
// =============================================================================

import * as acorn from "acorn";

export interface HandlerTarget {
    target: string;
    confidence: "definite" | "possible";
}

// acorn nodes have a `type` string field plus arbitrary children.
// We use a loose type to keep the AST walking code simple.
// Declared early so AstFunctionNode can reference it.
type AcornNode = {
    type: string;
    body?: AcornNode | AcornNode[];
    argument?: AcornNode | null;
    value?: unknown;
    consequent?: AcornNode | AcornNode[];
    alternate?: AcornNode | null;
    cases?: AcornNode[];
    block?: AcornNode;
    handler?: AcornNode | null;
    finalizer?: AcornNode | null;
    left?: AcornNode;
    right?: AcornNode;
    expression?: AcornNode | boolean;
    declarations?: AcornNode[];
    init?: AcornNode | null;
    test?: AcornNode | null;
    update?: AcornNode | null;
    params?: AcornNode[];
    [key: string]: unknown;
};

/**
 * A union of ESTree node types that represent a callable handler function.
 * Structurally compatible with both acorn nodes and ESLint's @types/estree,
 * so walkHandlerAst can accept either without type juggling at the call site.
 *
 * The index signature `[key: string]: unknown` keeps this loose enough that
 * acorn's extra fields (start, end, loc) don't cause structural mismatches.
 */
export type AstFunctionNode = {
    type: "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression";
    body: AcornNode;
    expression?: boolean; // true for concise arrow functions (no block body)
    params: AcornNode[];
    [key: string]: unknown;
};

// Node types that make a return "conditional" — any string-returning
// ReturnStatement nested inside one of these becomes "possible".
const CONDITIONAL_ANCESTORS = new Set([
    "IfStatement",
    "SwitchStatement",
    "SwitchCase",
    "ConditionalExpression",
    "LogicalExpression",
    "TryStatement",
]);

interface ReturnInfo {
    target: string;
    isConditional: boolean;
}

const PARSE_OPTS: acorn.Options = { ecmaVersion: 2022, sourceType: "script" };

/**
 * Try to parse a function's toString() output using several strategies.
 *
 * Function.prototype.toString() produces different formats:
 *   - Named function declaration: `function name() { ... }` → parses as-is
 *   - Anonymous function expression: `function () { ... }` → needs parens wrapper
 *   - Arrow function: `() => { ... }` → parses as-is
 *   - Method shorthand: `name() { ... }` → needs object literal wrapper
 *
 * Returns null if none of the strategies succeed (unusual syntax, etc.).
 */
function tryParse(source: string): acorn.Node | null {
    // Strategy 1: parse as-is (named function declarations, arrow functions)
    try {
        return acorn.parse(source, PARSE_OPTS);
    } catch {
        // continue to next strategy
    }

    // Strategy 2: wrap in parens (anonymous function expressions)
    try {
        return acorn.parse(`(${source})`, PARSE_OPTS);
    } catch {
        // continue to next strategy
    }

    // Strategy 3: wrap as object method (method shorthand `name() { ... }`)
    try {
        return acorn.parse(`({${source}})`, PARSE_OPTS);
    } catch {
        // All strategies exhausted — fail silently
        return null;
    }
}

/**
 * Find the first ArrowFunctionExpression node in a parsed AST.
 * Returns undefined if no arrow function exists at the top level.
 */
function findArrowFunction(node: AcornNode): AcornNode | undefined {
    if (node.type === "ArrowFunctionExpression") {
        return node;
    }
    if (node.type === "Program" || node.type === "ExpressionStatement") {
        const children = getChildren(node);
        for (const child of children) {
            const found = findArrowFunction(child);
            if (found) {
                return found;
            }
        }
    }
    return undefined;
}

/**
 * Handle concise arrow functions (`() => "state"` with no block body).
 *
 * Acorn represents these with `expression: true` on the ArrowFunctionExpression
 * and the body as a Literal directly — there is no ReturnStatement, so the
 * general walkForReturns() misses them entirely.
 *
 * Returns:
 *   - HandlerTarget[] with one definite entry if the body is a string Literal
 *   - [] if the body is a non-string expression (no false edges produced)
 *   - undefined if the AST doesn't match the concise arrow pattern at all
 *     (caller should fall through to the general walker)
 */
function checkConciseArrow(node: AstFunctionNode): HandlerTarget[] | undefined {
    // A concise arrow has `expression: true` and the body is not a BlockStatement.
    if (node.type !== "ArrowFunctionExpression" || !node.expression) {
        // Not a concise arrow — let checkConciseArrow's caller also check
        // the parsed Program wrapper for arrow functions embedded in Program nodes.
        return undefined;
    }
    const body = node.body as AcornNode;
    if (body && body.type === "Literal" && typeof body.value === "string") {
        return [{ target: body.value, confidence: "definite" }];
    }
    // Non-string concise arrow (e.g., `() => someVar`) — no targets extractable
    return [];
}

/**
 * Handle concise arrow functions found inside a parsed Program/ExpressionStatement.
 * Used by analyzeHandler after tryParse() wraps the source in a Program node.
 */
function checkConciseArrowInAst(ast: AcornNode): HandlerTarget[] | undefined {
    const arrowNode = findArrowFunction(ast);
    if (!arrowNode || !arrowNode.expression) {
        return undefined;
    }
    const body = arrowNode.body as AcornNode;
    if (body && body.type === "Literal" && typeof body.value === "string") {
        return [{ target: body.value, confidence: "definite" }];
    }
    return [];
}

/**
 * Walk a pre-parsed handler function AST node and extract transition targets.
 *
 * Accepts a FunctionDeclaration, FunctionExpression, or ArrowFunctionExpression
 * node (as produced by acorn or the ESLint rule engine). Returns an array of
 * { target, confidence } pairs. Empty array means no statically-determinable
 * string return targets were found.
 *
 * This is the shared core used by both:
 *   - analyzeHandler() — the runtime path (parses fn.toString() first)
 *   - ESLint rules — the AST path (ESLint already has the parsed node)
 */
export function walkHandlerAst(node: AstFunctionNode): HandlerTarget[] {
    // Concise arrow functions (`() => "state"`) have no ReturnStatement.
    // The body is the expression directly — handle before the general walker.
    const conciseResult = checkConciseArrow(node);
    if (conciseResult !== undefined) {
        return conciseResult;
    }

    const returns: ReturnInfo[] = [];
    walkForReturns(node as unknown as AcornNode, [], returns);

    if (returns.length === 0) {
        return [];
    }

    // Determine confidence:
    // - A single non-conditional return that's the ONLY string return → "definite"
    // - Multiple returns or conditional returns → all "possible"
    const allNonConditional = returns.every(r => !r.isConditional);
    const isSoleReturn = returns.length === 1;

    return returns.map(({ target, isConditional }) => ({
        target,
        confidence: allNonConditional && isSoleReturn && !isConditional ? "definite" : "possible",
    }));
}

/**
 * Analyze a handler function and extract transition targets.
 *
 * Returns an array of { target, confidence } pairs. Empty array means
 * no statically-determinable string return targets were found.
 *
 * Safe to call on any function — parse errors return empty (fail silently).
 */
export function analyzeHandler(fn: (...args: unknown[]) => unknown): HandlerTarget[] {
    const source = fn.toString();

    // Native/bound functions have no analyzable body — skip them.
    if (source.includes("[native code]")) {
        return [];
    }

    const ast = tryParse(source);
    if (!ast) {
        return [];
    }

    // Concise arrow functions (`() => "state"`) have no ReturnStatement in their
    // AST. Instead, the ArrowFunctionExpression node has `expression: true` and
    // the body is a Literal directly. Handle this before the general walker.
    const conciseResult = checkConciseArrowInAst(ast as unknown as AcornNode);
    if (conciseResult !== undefined) {
        return conciseResult;
    }

    // For block-body functions, find the top-level function node and delegate
    // to the shared AST walker.
    const fnNode = findTopLevelFunctionNode(ast as unknown as AcornNode);
    if (fnNode) {
        return walkHandlerAst(fnNode as unknown as AstFunctionNode);
    }

    // Fallback: walk the raw AST directly (method shorthand wrapper case)
    const returns: ReturnInfo[] = [];
    walkForReturns(ast as unknown as AcornNode, [], returns);

    if (returns.length === 0) {
        return [];
    }

    const allNonConditional = returns.every(r => !r.isConditional);
    const isSoleReturn = returns.length === 1;

    return returns.map(({ target, isConditional }) => ({
        target,
        confidence: allNonConditional && isSoleReturn && !isConditional ? "definite" : "possible",
    }));
}

/**
 * Find the top-level function node in a parsed Program AST.
 * Returns the first FunctionDeclaration, FunctionExpression, or
 * ArrowFunctionExpression at the top level.
 */
function findTopLevelFunctionNode(ast: AcornNode): AcornNode | undefined {
    const children = getChildren(ast);
    for (const child of children) {
        if (
            child.type === "FunctionDeclaration" ||
            child.type === "FunctionExpression" ||
            child.type === "ArrowFunctionExpression"
        ) {
            return child;
        }
        // ExpressionStatement wrapper (anonymous function expressions wrapped in parens)
        if (child.type === "ExpressionStatement") {
            const grandChildren = getChildren(child);
            for (const gc of grandChildren) {
                if (
                    gc.type === "FunctionDeclaration" ||
                    gc.type === "FunctionExpression" ||
                    gc.type === "ArrowFunctionExpression"
                ) {
                    return gc;
                }
            }
        }
    }
    return undefined;
}

/**
 * Collect string literals from a conditional expression tree.
 * Used when a ReturnStatement's argument is a ternary or logical expression.
 * All findings are marked as "possible" since they're conditional.
 */
function collectStringLiteralsFromExpression(node: AcornNode, results: ReturnInfo[]): void {
    if (!node || typeof node !== "object") {
        return;
    }
    if (node.type === "Literal" && typeof node.value === "string") {
        results.push({ target: node.value as string, isConditional: true });
        return;
    }
    // Recurse into conditional/logical branches
    if (node.type === "ConditionalExpression") {
        collectStringLiteralsFromExpression(node.consequent as AcornNode, results);
        collectStringLiteralsFromExpression(node.alternate as AcornNode, results);
    } else if (node.type === "LogicalExpression") {
        collectStringLiteralsFromExpression(node.left as AcornNode, results);
        collectStringLiteralsFromExpression(node.right as AcornNode, results);
    }
    // For any other expression type, don't recurse further — we can't reliably
    // determine whether the result will be a state name.
}

/**
 * Recursively walk the AST, collecting ReturnStatement nodes that
 * return string literals. Tracks whether any CONDITIONAL_ANCESTOR
 * node exists in the ancestor chain.
 *
 * We skip nested function bodies (arrow functions, regular functions,
 * class methods) — their returns belong to a different function scope.
 */
function walkForReturns(node: AcornNode, ancestors: string[], results: ReturnInfo[]): void {
    if (!node || typeof node !== "object") {
        return;
    }

    if (node.type === "ReturnStatement") {
        const arg = node.argument;
        if (!arg) {
            return;
        }
        if (arg.type === "Literal" && typeof arg.value === "string") {
            const isConditional = ancestors.some(a => CONDITIONAL_ANCESTORS.has(a));
            results.push({ target: arg.value, isConditional });
        } else {
            // Non-literal return value (ternary, logical, expression, etc.)
            // Walk into the argument to find any string literals in conditional branches.
            // All targets found this way are "possible" since they're behind some expression.
            collectStringLiteralsFromExpression(arg, results);
        }
        return;
    }

    // Skip nested function scopes — their returns are not ours
    if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
    ) {
        // The outermost function (index 0 in a Program body) IS our function,
        // so we need to visit it. We detect "outermost" by checking if ancestors
        // has any function-type ancestor already.
        const hasFunctionAncestor = ancestors.some(
            a =>
                a === "FunctionDeclaration" ||
                a === "FunctionExpression" ||
                a === "ArrowFunctionExpression"
        );
        if (hasFunctionAncestor) {
            // Nested function — skip its body entirely
            return;
        }
        // Fall through to recurse into the outermost function body
    }

    const nextAncestors = [...ancestors, node.type];
    const children = getChildren(node);
    for (const child of children) {
        if (child && typeof child === "object") {
            walkForReturns(child as AcornNode, nextAncestors, results);
        }
    }
}

/**
 * Extract the child nodes we want to recurse into from an AST node.
 * Returns a flat list of child nodes (some may be arrays in the AST).
 */
function getChildren(node: AcornNode): AcornNode[] {
    const children: AcornNode[] = [];

    const pushIfNode = (val: unknown) => {
        if (val && typeof val === "object" && "type" in (val as object)) {
            children.push(val as AcornNode);
        }
    };

    const pushArray = (arr: unknown) => {
        if (Array.isArray(arr)) {
            for (const item of arr) {
                pushIfNode(item);
            }
        }
    };

    switch (node.type) {
        case "Program":
            pushArray(node.body);
            break;
        case "ExpressionStatement":
            pushIfNode(node.expression);
            break;
        case "FunctionDeclaration":
        case "FunctionExpression":
        case "ArrowFunctionExpression":
            if (node.body) {
                pushIfNode(node.body);
            }
            break;
        case "BlockStatement":
            pushArray(node.body);
            break;
        case "ReturnStatement":
            pushIfNode(node.argument);
            break;
        case "IfStatement":
            pushIfNode(node.consequent);
            pushIfNode(node.alternate);
            break;
        case "SwitchStatement":
            pushArray(node.cases);
            break;
        case "SwitchCase":
            pushArray(node.consequent);
            break;
        case "TryStatement":
            pushIfNode(node.block);
            pushIfNode(node.handler);
            pushIfNode(node.finalizer);
            break;
        case "CatchClause":
            pushIfNode(node.body as AcornNode | undefined);
            break;
        case "ConditionalExpression":
            pushIfNode(node.consequent as AcornNode | undefined);
            pushIfNode(node.alternate as AcornNode | undefined);
            break;
        case "LogicalExpression":
            pushIfNode(node.left);
            pushIfNode(node.right);
            break;
        case "VariableDeclaration":
            pushArray(node.declarations);
            break;
        case "VariableDeclarator":
            pushIfNode(node.init);
            break;
        case "ForStatement":
            pushIfNode(node.body as AcornNode | undefined);
            break;
        case "WhileStatement":
        case "DoWhileStatement":
            pushIfNode(node.body as AcornNode | undefined);
            break;
        default:
            // For any node type we don't explicitly handle, try common child fields.
            // This prevents us from silently missing returns in unusual constructs.
            for (const key of Object.keys(node)) {
                // ESLint AST nodes have circular `parent` pointers that Acorn nodes lack.
                // Traversing into `parent` causes infinite recursion.
                if (
                    key === "type" ||
                    key === "start" ||
                    key === "end" ||
                    key === "loc" ||
                    key === "parent" ||
                    key === "range"
                ) {
                    continue;
                }
                const val = node[key];
                if (Array.isArray(val)) {
                    pushArray(val);
                } else {
                    pushIfNode(val);
                }
            }
    }

    return children;
}
