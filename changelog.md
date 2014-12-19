###v0.5.0-1 (pre-release)
* Added the `BehavioralFsm` constructor function/prototype.
* Refactored the `Fsm` constructor to extend `BehavioralFsm`.
* Converted all tests to use should.js (instead of expect.js).
* Added istanbul code coverage.
* Removed the internal `deepExtend` function in favor of using lodash's `merge` method.
* The following instance properties were re-named on `Fsm` instances:
	* `_priorAction` is now `priorAction`.
	* `_currentAction` is now `currentAction`.
	* `eventQueue` is now `inputQueue`.
* The `trigger` alias to the `emit` method has been removed.
* The `deferUntilNextHandler` method on the `Fsm.prototype` has been removed.
* The `machina.utils.getDefaultOptions` only returns the following properties by default:
	* `initialState`
	* `eventListeners`
	* `states`
	* `namespace`
	* `useSafeEmit`
* Added `machina.utils.getDefaultClientMeta`, which returns the following properties:
	* `inputQueue`
	* `targetReplayState`
	* `state:`
	* `priorState`
	* `priorAction`
	* `currentAction`
	* `currentActionArgs`
	* `inExitHandler`

###v0.4.0
* No changes from v0.4.0-2 other than making this the official v0.4 release

###v0.4.0-2
* Input handlers now support returning a value (thanks to @Codelica for the PR)

###v0.4.0-1 (first v0.4 pre-release of many)
* Adjusted UMD to check for AMD before CommonJS.
* CommonJS wrapper no longer returns a factory function, instead it returns the module value. **BREAKING CHANGE** (for node.js users, at least).

###v0.3.8
* Fixed a bug where the instance-level `initialState` member was getting set to undefined if a `states` object was provided on the options constructor arg but not an `initialState`.
* Added some code comments to the un-minified source as well to better explain the inheritance behavior changes.

###v0.3.7
* Underscore.js is no longer a dependency - it has been replaced with Lodash.
* Fixed issue where instances sharing a derived machina constructor that *did not* specify instance level state objects were sharing the prototype's `states` object from the parent Fsm constructor. The `states` object and `initialState` property are now built/blended together from the prototype chain and deep-clone-extended over the instance itself, so that they will always be instance level.
* Added Alex Robson (@arobson) to contributors list in package.json - he was instrumental in helping me track down and squash the above-mentioned bug.
* Added Dominic Barnes to the contributors list.
* Inverted the changelog to show most recent first - you know...b/c...too lazy to scroll. :-)
* Source in this version also has new jsbeautify settings applied - whitespace-laden commits, FML, but it was necessary going forward.
* Removed failing LiveReload setup in the gulpfile. I plan to fix that in the v0.4 release.

### v0.3.5

* Fixed issue in `deferUntilNextHandler` where deferred inputs were being queued as `NEXT_TRANSITION` instead of `NEXT_HANDLER`.
* Moved invocation of `on_Exit` to occur just *before* the state property is updated, instead of just after.

### v0.3.4

* Underscore is no longer required to be passed into the factory function for node usage. It will be required behind the scenes if not provided.

### v0.3.3

* State handlers can optionally return a string value of the state to which you want to transition.
* Transition events now include an `action` member which contains the "state.handler" value (string) indicating the current action which caused the transition.
* Updated license info (still MIT, GPL >= 2.0)
* Removed deprecated anvil dependency references

### v0.3.2

* Fixed a bug in the internal deepExtend method (see [this issue](https://github.com/ifandelse/machina.js/pull/12)).
* The `initialize` call will now receive the arguments passed to the constructor (see [this issue](https://github.com/ifandelse/machina.js/issues/11)).
* **The commonjs/node.s wrapper now returns a factory, to which you must pass dependencies (underscore, in this case). This is a breaking API change**
* The build process now outputs one module that can be used as a commonjs, AMD or standard client lib.

### v0.3.1

* All internal events have been refactored to emit single argument payloads. **This is a breaking API change.**

### v0.3.0

* FSM constructor function supports inheritance via an `extend` function - working mostly identical to backbone.js objects.
* FSMs can have a top-level 'catch-all' ("*") handler defined, which would apply to any state, unless the state overrides it with a state-specific catch-all handler.
* FSM states now have an `_onExit` handler.
* **The `fireEvent` has been removed.  Use `emit` or the `trigger` alias. This is a breaking API change.**
* State input handlers can now be a string value (indicating that a transition should occur to a state matching that string value) in addition to a function.

### v0.2.2

* event names are now all lower case
* FSM constructor only handles an eventListeners object (not the old array of strings to pre-populate event names)
* bug fixed where event queue would still be replayed on a state that transitioned during its entry action
* transitioned and transitioning events are now just a single "transition" event

### v0.2.1

* build bits updated to latest anvil.js (0.8.9)
* added beginnings of connectivity example
* updated ext dependencies (postal, etc.)
* added bower component.json

### v0.2.0

* Message bus integration has been removed from machina core, and now exists as plugins.  For integration with [postal.js](https://github.com/ifandelse/postal.js), see [machina.postal](https://github.com/ifandelse/machina.postal)
* Due to the above change, the only "messaging-related" metadata on an FSM now is the "namespace" value that can be passed as the FSM is created.  This value is optional, and will be given a default if none is provided.  Messaging plugins can utilize this value as a channel/namespace name and/or topic prefix.
* A "priorState" member has been added to the Fsm.
