# machina.js - v0.3.5
**Be sure to read the release notes for v0.3.0-v0.3.2 at the bottom of this page. These releases involve a couple of breaking API changes.**

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
(The [wiki](https://github.com/ifandelse/machina.js/wiki) has more extensive API documentation. Also, be sure to check out the example folder in this repository for more in-depth demos - especially if you're interested in a working 'connectivity' FSM. The example below is just scratching the surface of one...)

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
				if( verifyState() ) {
                    storage.saveToRemote( payload );
				}
			},

			"sync.customer" : function() {
				if( verifyState( payload ) ) {
					var unsynced = storage.getFromLocal( { startTime: this.offlineMarkerTime } );
					// Big assumption here!  In the real world,
					// we'd batch this sync in reasonable chunks.
					storage.saveBatchToRemote( unsynced );
					this.emit( "CustomerSyncComplete", { customers: unsynced } );
				}
			}
		},

		"offline" : {
			"save.customer" : function( payload ) {
				if( verifyState() ) {
                    storage.saveToLocal( payload );
				}
            }
		}
	}
});
```

In the above example, the developer has created an FSM with two possible states: `online` and `offline`.  While the fsm is in the `online` state, it will respond to `save.customer` and `sync.customer` events.  External code triggers these events by calling the `handle` method on the FSM.  For example `storageFsm.handle( "sync.customer", { other: "data" } )`.  The `handle` method first looks to see if a named handler exists matching the name of the one passed in, then also checks for a catch-all handler (indicated by the "*") if a named handler isn't found.  The `offline` state of the above FSM only responds to `save.customer` events.  If any other type of event name is passed to the `handle` method of the FSM, other than what each state explicitly handles, it is ignored.

In addition to the state/handler definitions, the above code example as shows that this particular FSM will start in the `offline` state, and can generate a `CustomerSyncComplete` custom event.

The `verifyState` and `applicationOffline` methods are custom to this instance of the FSM, and are not, of course, part of machina by default.

You can see in the above example that anytime the FSM handles an event, it first checks to see if the state needs to be transitioned between offline and online (via the `verifyState` call).  States can also have `_onEnter` and `_onExit` methods. `_onEnter` is fired immediately after the FSM transitions into that state and `_onExit` is fired immediately before transitioning to a new state.

Now that we've seen a quick example, let's do a whirlwind API tour.

## Have More Questions?
Read the wiki and the source – you might find your answer and more! Check out the [issue](https://github.com/ifandelse/machina.js/issues/4) opened by @burin - a *great* example of how to use github issues to ask questions, provide sample code, etc. I only ask that if you open an issue, that it be *focused on a specific problem or bug* (not wide, open ambiguity, please). We also have an IRC chat room on freenode: #machinajs. It's a quiet place, but I'll do my best to answer questions if they arise.

## Whirlwind API Tour
When you are creating a new FSM instance, `machina.Fsm` takes 1 argument - an options object.  Here's a breakdown of the members of this `options` object:

`eventListeners` - An object of event names, associated with the array of event handlers subscribed to them.  (You are not required to declare the events your FSM can publish ahead of time - this is only for convenience if you want to add handlers as you create the instance.)

```javascript
eventListeners: {
	MyEvent1: [function(data) { console.log(data); }],
	MyEvent2: [function(data) { console.log(data); }]
}
```

`states` - an object detailing the possible states the FSM can be in, plus the kinds of events/messages each state can handle.  States can have normal "handlers" as well as a catch-all handler ("*"), an `_onEnter` handler invoked when the FSM has transitioned into that state and an `_onExit` handler invoked when transitioning out of that state.

```javascript
states: {
    "uninitialized" : {
        _onEnter: function() {
            // do stuff immediately after we transition into uninitialized
        },

        "initialize" : function( payload ) {
            // handle an "initialize" event
        },

        _onExit: function() {
            // do stuff immediately before we transition out of uninitialized
            // Note: you can't transition or invoke another inside _onExit
        }
    },

    "ready" : {
        "*" : function( payload ) {
            // any message that comes while in the "ready" state will get handled here
            // unless it matches another "ready" handler exactly.
        }
    }
}
```

`initialState` - the state in which the FSM will start.  As soon as the instance is created, the FSM calls the `transition` method to transition into this state.

`namespace` - a name that indentifies the FSM if it's wired up to a message bus through a plugin.

`initialize` - a function that will be executed as soon as the FSM instance has been created. This is the last step of the FSM's constructor function, prior to emitting that a new instance has been created, and transitioning (if applicable) into the initial state.

### Inheritance
FSMs can be created via the `machina.Fsm` constructor function as described above, or you can create an 'extended' FSM constructor function by calling `machina.Fsm.extend()`.  If you are familiar with backbone.js, machina's inheritance is identical to how backbone objects work, except that machina performs a deep extend, which means you can inherit from an FSM, adding new handlers to a state defined by the base (and you can override already-declared handlers, etc.).  With this being the case, it's better to think of machina's inhertiance as "blending" and not just extending. Let's look at an example:

```javascript
var BaseFsm = machina.Fsm.extend({
    initialize: function() {
        // do stuff here if you want to perform more setup work
        // this executes prior to any state transitions or handler invocations
    },
    states: {
        uninitialized: {
            start: function() {
                this.transition("first");
            }
        },
        first: {
            handlerA : function() {
                // do stuff
            }
        }
    }
});
// getting an instance from our extended constructor function above
var baseFsm = new BaseFsm();

// taking the BaseFsm constructor function and doing more
var ChildFsm = BaseFsm.extend({
    states: {
        uninitialized: {
            skipToTheEnd: function() {
                this.transition("second");
            }
        },
        first: {
            handlerA : function() {
                this.transition("second");
            }
            handlerB : function() {
                // do some work...
            }
        },
        second: {
            handlerC : function() {
                // do stuff
            }
        }
    }
});

// This instance will have a blending of BaseFsm and ChildFsm's states/handlers
var childFsm = new ChildFsm();

```

## The machina.Fsm Prototype
Each instance of an machina FSM has the following methods available via it's prototype:

* `emit(eventName, [other args...])` - looks in the `events` object for a matching event name, and then iterates through the subscriber callbacks for that event and invokes each one, passing in any additional args that were passed to `emit`. (NOTE: - this call is currently aliased as `emit` as well.)
* `handle(msgType, [other args...])` - This is the main way you should be interacting with an FSM instance (assuming no message bus is present).  It will try to find a matching eventName/msgType under the current state and invoke it, if one exists.  Otherwise it will look for a catch-all handler, or simply ignore the message and raise the "NoHandler" event.
* `transition(newState)` - Called when transitioning into a new state.
* `deferUntilTransition(stateName)` - calling this within a state handler function will queue the handler's arguments to be executed at a later time.  If you don't provide the `stateName` argument, it will replay the event after the next state transition.  Providing the `stateName` argument will queue the event until the FSM transitions into that state.
* `deferUntilNextHandler()` - calling this within a state handler function will queue the handler's arguments to be executed after the next handler is invoked.
* `processQueue()` - called internally during state transitions and after handler methods have been invoked.  This call processes any queued events (queued by use of `deferUntilTransition` and/or `deferUntilNextHandler`).
* `clearQueue(type, name)` - allows you to clear out queued events that have been deferred either until another handler or another state transition. The `type` parameter can be either "transition" or "handler".  If you pass "transition" for the `type`, then the optional `name` parameter allows you to clear events queued for a specific state transition. Not providing a `name` when the `type` is "transition" will clear out all events queued for *any* state transition.
* `on(eventName, callback)` - used to subscribe to events that the FSM generates.
* `off(eventName, callback)` - used to unsubscribe to FSM events.

In addition to the prototype members, every instance of an FSM has these instance-specific values as well:

* `_currentAction` - concatenates "{state}.{handler}" for the operation in progress.  This is provided as a convenience for both logging (if needed) and if you need to check during an operation to see if the last action taken is the same action being taken now.
* `_priorAction` - concatenates "{state}.{handler" for the last operation that took place.  See the above explanation for more context.
* `eventListeners` - an object containing the event names (keys) and an array of subscribers listening to the event.  You should not need to interact with this directly. Instead, use the `on` and `off` prototype methods.
* `eventQueue` - an array of input/events that have been deferred by calling `deferUntilTransition` or `deferUntilNextHandler`. This queue is processed automatically for you.
* `namespace` - the namespace value you passed in during instantiaton, or a default value machina provides.
* `priorState` - the last state in which the FSM was in before the current one.  This could be useful if you have conditional transition behavior as you move into a new state which depends on what state you're moving *from*.
* `state` - string value of the current state of the FSM.  This will match one of the state names in the `states` object.  Do *not* change this value directly.  Use the `transition()` method on the prototype to change an FSM's state.
* `states` - the object literal of states & handlers you passed in when you created the FSM.
* `targetReplayState` - used internally during transitions to manage the proper replay of queued events if multiple transitions result from one initial transition.

## The Top Level machina object
The top level `machina` object has the following members:

* `Fsm` - the constructor function used to create FSMs.
* `utils` - contains helper functions that can be overridden to change default behavior(s) in machina:
	* `getDefaultOptions` - returns the default options object for any machina instance
	* `makeFsmNamespace` - function that provides a default "channel" or "exchange" for an FSM instance.  (e.g. - fsm.0, fsm.1, etc.)
* `on` - function used to subscribe a callback to top-level machina events (currently the only event published at this level is "newFsm")
* `off` - function used to unsubscribe a callback to top-level machina events.
* `eventListeners` - an object literal containing the top-level `emit` call as well as susbcribers to any top-level events.

## Pulling machina into your environment

```javascript
// If you're not using an AMD loader, machina is available on the window
var MyFsm = machina.Fsm.extend({ /* your stuff */});

// If you're using an AMD loader:
require(['machina'], function(machina){
	return machina.Fsm.extend({ /* your stuff */});
});

// In node.js, the module returns a factory function:
var underscore = require('underscore');
var machina = require('machina')(underscore);
var MyFsm = machina.Fsm.extend({ /* your stuff */});
```


## Build, Tests & Examples
machina.js uses [gulp.js](http://gulpjs.com/) to build.

* Install node.js (and consider using [nvm](https://github.com/creationix/nvm) to manage your node versions)
* run `npm install` & `bower install` to install all dependencies
* To build, run `npm run build` - then check the lib folder for the output
* To run tests & examples:
    * To run node-based tests: `npm run test`
    * To run browser-based tests & examples:
        * run `npm start`
        * navigate in your browser to <http://localhost:3080/>


## Release Notes

Go [here](https://github.com/ifandelse/machina.js/blob/master/changelog.md) to see the changelog.