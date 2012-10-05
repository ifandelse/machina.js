# machina.js

## What is it?
Machina.js is a JavaScript framework for highly customizable finite state machines (FSMs).  Many of the ideas for machina have been loosely inspired by the Erlang/OTP FSM behaviors.

## Why would I use it?
* Finite state machines offer a way to structure web client code in a very organized manner, and can make it much simpler to extend behavior for all or only key edge cases.
	* For example - instead of nested callbacks/deferreds, use an FSM to act as an "event aggregator" that is aware of when state needs to transition in the app once a set of conditions has been satisfied.
	* FSMs *can* work well for concerns like:
		* app "init" (bootstrapping your web client so that certain application behaviors are not available until all appropriate resources/data/behavior are present)
		* persistence concerns - offline vs online.  Abstract persistence behind an fsm that simply listens for messages (commands) to persist data.  Depending on the state of the client (offline vs online), the FSM will handle the activity accordingly - calling code never needs to know.
		* Often-changing-subsets of view or model elements.  Take a navigation menu, for example.  Depending on the context (i.e. - state), you may wish to show/hide certain menu options.  This usually turns out to be a handful of menu show-vs-hide combinations.  An FSM can abstract this well.
* It's simple!  Machina makes the process of organizing the various states your fsm needs to know about - and the kinds of events each state can handle - intuitive to set up, and to read.
* Powerful integration.  By using a plugin like [machina.postal](https://github.com/ifandelse/machina.postal), your FSM instances can auto-wire into [postal.js](https://github.com/ifandelse/postal.js) (a JavaScript message bus), enabling them decoupled communications with other components in your application.  This wires up both subscribers (for state handlers to be invoked) and publishers (to publish your FSM's events to the message bus).
* Extend for more power.
	* Writing your own message bus/eventing wire-up plugin is fairly simple.  Look at [machina.postal](https://github.com/ifandelse/machina.postal) for an example.
	* Hook into the top level "newFsm" event to give other components in your app a handle to your FSMs as they are created.

## How do I use it?
(Be sure to check out the example folder in this repository for more in-depth demos).

Creating an FSM:

```javascript
var storageFsm = new machina.Fsm({
	applicationOffline: function() {
		var offline = false;
		// checks window.navigator.online and more, sets the offline value
		return offline;
	},

	verifyState: function( payload ) {
		if( applicationOffline() && this.state !== "offline" ) {
			this.offlineMarkerTime = new Date();
			this.transition("offline");
			return false;
		}
		else if ( !applicationOffline() && this.state === "offline" ) {
			this.transition( "online" );
			return false;
		}
		return true;
	},

	initialState: "offline",

	states : {
		"online" : {
			_onEnter: function() {
				this.handle("sync.customer");
			},

			"save.customer" : function( payload ) {
				if( verifyState( payload ) ) {
                    storage.saveToRemote( payload );
				}
			},

			"sync.customer" : function() {
				if( verifyState( payload ) ) {
					var unsynced = storage.getFromLocal( { startTime: this.offlineMarkerTime } );
					// Big assumption here!  In the real world,
					// we'd batch this sync in reasonable chunks.
					storage.saveBatchToRemote( unsynced );
					this.fireEvent( "CustomerSyncComplete", { customers: unsynced } );
				}
			}
		},

		"offline" : {
			"save.customer" : function( payload ) {
				if( verifyState( payload ) ) {
                    storage.saveToLocal( payload );
				}
            }
		}
	}
});
```

In the above example, the developer has created an FSM with two possible states: `online` and `offline`.  While the fsm is in the `online` state, it will respond to `save.customer` and `sync.customer` events.  External code triggers these events by calling the `handle` method on the FSM.  For example `storageFsm.handle( "sync.customer", { other: "data" } )`.  The `handle` method first looks to see if a named handler exists matching the name of the one passed in, then also checks for a catch-all handler (indicated by the "*") if a named handler isn't found.  The `offline` state of the above FSM only responds to `save.customer` events.  If any other type of event name is passed to the `handle` method of the FSM, other than what each state explicitly handles, it is ignored.

In addition to the state/handler definitions, the above code example as shows that the FSM will start in the `offline` state, and can generate a `CustomerSyncComplete` event.

The `verifyState` and `applicationOffline` methods are custom to this instance of the FSM, and are not, of course, part of machina by default.

You can see in the above example that anytime the FSM handles an event, it first checks to see if the state needs to be transitioned between offline and online (via the `verifyState` call).  States can also have an `_onEnter` method - which is fired immediately after the FSM transitions into that state.

Now that we've seen a quick example, let's do a whirlwind API tour.

## Whirlwind API Tour
When you are creating a new FSM instance, `machina.Fsm` takes 1 argument - an options object.  Here's a breakdown of the members of this `options` object:

`eventListeners` - An object of event names, associated with the array of event handlers subscribed to them.  (You are not required to declare the events your FSM can publish ahead of time - this is only for convenience if you want to add handlers ahead of time.)

```javascript
eventListeners: {
	MyEvent1: [function(data) { console.log(data); }],
	MyEvent2: [function(data) { console.log(data); }]
}
```

`states` - an object detailing the possible states the FSM can be in, plus the kinds of events/messages each state can handle.  States can have normal "handlers" as well as a catch-all handler ("*"), and an _onEnter handler invoked when the FSM has transitioned into that state.

```javascript
states: {
		"uninitialized" : {
			_onEnter: function() {
				// do stuff immediately after we transition into uninitialized
			},

			"initialize" : function( payload ) {
				// handle an "initialize" event
			}
		},

		"ready" : {
			"*" : function( payload ) {
				// any message that comes while in the "ready" state will get handled here
				// unless it matches another "ready" handler exactly.
            }
		}
```

`initialState` - the state in which the FSM will start.  As soon as the instance is created, the FSM calls the `transition` method to transition into this state.

`namespace` - a name that indentifies the FSM if it's wired up to a message bus through a plugin.

## The machina.Fsm Prototype
Each instance of an machina FSM has the following methods available via it's prototype:

* `trigger(eventName, [other args...])` - looks in the `events` object for a matching event name, and then iterates through the subscriber callbacks for that event and invokes each one, passing in any additional args that were passed to `trigger`. (NOTE: - this call is currently aliased as `emit` as well.)
* `handle(msgType, [other args...])` - This is the main way you should be interacting with an FSM instance (assuming no message bus is present).  It will try to find a matching eventName/msgType under the current state and invoke it, if one exists.  Otherwise it will look for a catch-all handler, or simply ignore the message and raise the "NoHandler" event.
* `transition(newState)` - Called when transitioning into a new state.
* `deferUntilTransition(stateName)` - calling this within a state handler function will queue the handler's arguments to be executed at a later time.  If you don't provide the `stateName` argument, it will replay the event after the next state transition.  Providing the `stateName` argument will queue the event until the FSM transitions into that state.
* `deferUntilNextHandler()` - calling this within a state handler function will queue the handler's arguments to be executed after the next handler is invoked.
* `processQueue()` - called internally during state transitions and after handler methods have been invoked.  This call processes any queued events (queued by use of `deferUntilTransition` and/or `deferUntilNextHandler`).
* `clearQueue(type, name)` - allows you to clear out queued events that have been deferred either until another handler or another state transition. The `type` parameter can be either "transition" or "handler".  If you pass "transition" for the `type`, then the optional `name` parameter allows you to clear events queued for a specific state transition. Not providing a `name` when the `type` is "transition" will clear out all events queued for *any* state transition.
* `on(eventName, callback)` - used to subscribe to events that the FSM generates.
* `off(eventName, callback)` - used to unsubscribe to FSM events.

In addition to the prototype members, every instance of an FSM has these instance-specific values as well:

* `state` - string value of the current state of the FSM.  This will match one of the state names in the `states` object.  Do *not* change this value directly.  Use the `transition()` method on the prototype to change an FSM's state.
* `priorState` - the last state in which the FSM was in before the current one.  This could be useful if you have conditional transition behavior as you move into a new state which depends on what state you're moving *from*.
* `_currentAction` - concatenates "{state}.{handler}" for the operation in progress.  This is provided as a convenience for both logging (if needed) and if you need to check during an operation to see if the last action taken is the same action being taken now.
* `_priorAction` - concatenates "{state}.{handler" for the last operation that took place.  See the above explanation for more context.

## The Top Level machina object
The top level `machina` object has the following members:

* `Fsm` - the constructor function used to create FSMs.
* `utils` - contains helper functions that can be overridden to change default behavior(s) in machina:
	* `getDefaultOptions` - returns the default options object for any machina instance
	* `makeFsmNamespace` - function that provides a default "channel" or "exchange" for an FSM instance.  (e.g. - fsm.0, fsm.1, etc.)
* `on` - function used to subscribe a callback to top-level machina events (currently the only event published at this level is "newFsm")
* `off` - function used to unsubscribe a callback to top-level machina events.
* `eventListeners` - an object literal containing the top-level `fireEvent` call as well as susbcribers to any top-level events.

## Build, Tests & Examples
machina.js uses [anvil.js](http://appendto.github.com/anvil.js/) to build.

* Install node.js (and consider using [nvm](https://github.com/creationix/nvm) to manage your node versions)
* Run `npm install -g anvil.js` to install anvil.js
* Navigate to the root of this repository and run `anvil`
* Build output will be placed in the lib folder.

One great feature of [anvil.js](http://appendto.github.com/anvil.js/) is the ability to host your tests and other content using express in node.js.
To run tests or examples:

* Navigate to the root of this repository and run `anvil --host`
* For tests, navigate to `http://localhost:3080/spec`
* For the "atm" example, navigate to `http://localhost:3080/atm`
	* check the source of Repository.js in this example for the account/pin information that can be used to log in.
* For the "load" example, navigate to `http://localhost:3080/load`


## Release Notes

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
