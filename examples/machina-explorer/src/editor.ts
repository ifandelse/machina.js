// =============================================================================
// editor.ts — CodeMirror 6 editor setup
//
// Wraps CodeMirror so the rest of the app only needs to know about
// getValue(). The editor owns its DOM lifecycle; callers just mount it.
// =============================================================================

import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

// A simple traffic-light FSM gives users a working example on first load.
// Complex enough to exercise real features but short enough to read at a glance.
const PLACEHOLDER_CONFIG = `{
    id: "traffic-light",
    initialState: "red",
    states: {
        red: {
            _onEnter({ ctx }) {
                ctx.timer = setTimeout(() => ctx.fsm.handle("next"), 3000);
            },
            _onExit({ ctx }) {
                clearTimeout(ctx.timer);
            },
            next: "green",
        },
        green: {
            _onEnter({ ctx }) {
                ctx.timer = setTimeout(() => ctx.fsm.handle("next"), 2000);
            },
            _onExit({ ctx }) {
                clearTimeout(ctx.timer);
            },
            next: "yellow",
        },
        yellow: {
            _onEnter({ ctx }) {
                ctx.timer = setTimeout(() => ctx.fsm.handle("next"), 500);
            },
            _onExit({ ctx }) {
                clearTimeout(ctx.timer);
            },
            next: "red",
        },
    },
}`;

export interface Editor {
    getValue: () => string;
}

/**
 * Mount a CodeMirror editor inside the given container element.
 * Returns an object with getValue() so callers can read the current text
 * without coupling to CodeMirror internals.
 */
export function createEditor(container: HTMLElement): Editor {
    const view = new EditorView({
        doc: PLACEHOLDER_CONFIG,
        extensions: [
            basicSetup,
            javascript(),
            oneDark,
            // Prevent the editor from capturing Tab for accessibility
            EditorView.theme({
                "&": { height: "100%" },
                ".cm-scroller": { overflow: "auto" },
            }),
        ],
        parent: container,
    });

    return {
        getValue: () => view.state.doc.toString(),
    };
}
