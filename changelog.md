### v0.2.0

* Message bus integration has been removed from machina core, and now exists as plugins.  For integration with [postal.js](https://github.com/ifandelse/postal.js), see [machina.postal](https://github.com/ifandelse/machina.postal)
* Due to the above change, the only "messaging-related" metadata on an FSM now is the "namespace" value that can be passed as the FSM is created.  This value is optional, and will be given a default if none is provided.  Messaging plugins can utilize this value as a channel/namespace name and/or topic prefix.
* A "priorState" member has been added to the Fsm.

### v0.2.1

* build bits updated to latest anvil.js (0.8.9)
* added beginnings of connectivity example
* updated ext dependencies (postal, etc.)
* added bower component.json

### v0.2.2

* event names are now all lower case
* FSM constructor only handles an eventListeners object (not the old array of strings to pre-populate event names)
* bug fixed where event queue would still be replayed on a state that transitioned during its entry action
* transitioned and transitioning events are now just a single "transition" event

### v0.3.0

* FSM constructor function supports inheritance via an `extend` function - working mostly identical to backbone.js objects.
* FSMs can have a top-level 'catch-all' ("*") handler defined, which would apply to any state, unless the state overrides it with a state-specific catch-all handler.
* FSM states now have an `_onExit` handler.
* **The `fireEvent` has been removed.  Use `emit` or the `trigger` alias. This is a breaking API change.**
* State input handlers can now be a string value (indicating that a transition should occur to a state matching that string value) in addition to a function.

### v0.3.1

* All internal events have been refactored to emit single argument payloads. **This is a breaking API change.**

### v0.3.2

* Fixed a bug in the internal deepExtend method (see [this issue](https://github.com/ifandelse/machina.js/pull/12)).
* The `initialize` call will now receive the arguments passed to the constructor (see [this issue](https://github.com/ifandelse/machina.js/issues/11)).
* **The commonjs/node.s wrapper now returns a factory, to which you must pass dependencies (underscore, in this case). This is a breaking API change**
* The build process now outputs one module that can be used as a commonjs, AMD or standard client lib.

### v0.3.3

* State handlers can optionally return a string value of the state to which you want to transition.
* Transition events now include an `action` member which contains the "state.handler" value (string) indicating the current action which caused the transition.
* Updated license info (still MIT, GPL >= 2.0)
* Removed deprecated anvil dependency references

### v0.3.4

* Underscore is no longer required to be passed into the factory function for node usage. It will be required behind the scenes if not provided.

### v0.3.5

* Fixed issue in `deferUntilNextHandler` where deferred inputs were being queued as `NEXT_TRANSITION` instead of `NEXT_HANDLER`.
* Moved invocation of `on_Exit` to occur just *before* the state property is updated, instead of just after.