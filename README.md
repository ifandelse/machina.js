# machina v2.0.0-1

## What is it?
Machina.js is a JavaScript framework for highly customizable finite state machines (FSMs).  Many of the ideas for machina have been *loosely* inspired by the Erlang/OTP FSM behaviors.

## Why Would I Use It?
Finite state machines are a great conceptual model for many concerns facing developers – from conditional UI, connectivity monitoring & management to initialization and more. State machines can simplify tangled paths of asynchronous code, they're easy to test, and they inherently lend themselves to helping you avoid unexpected edge-case-state pitfalls. machina aims to give you the tools you need to model state machines in JavaScript, without being too prescriptive on the problem domain you're solving for.

Some frequent use cases for machina:

* online/offline connectivity management
* conditional UI (menus, navigation, workflow)
* initiliazation of node.js processes or single-page-apps
* responding to user input devices (remotes, keyboard, mouse, etc.)

### Quick Example

First - you need to include it in your environment (browser, node, etc.):

```javascript
// If you're not using an AMD loader, machina is available on the window
// Just make sure you have lodash loaded before machina
var MyFsm = machina.Fsm.extend({ /* your stuff */});

// If you're using an AMD loader:
require(['machina'], function(machina){
    return machina.Fsm.extend({ /* your stuff */});
});

// node.js/CommonJS:
var machina = require('machina');

// FYI machina v0.3.x & earlier returned a factory
// function in CommonJS environments:
var lodash = require('lodash');
var machina = require('machina')(lodash);
var MyFsm = machina.Fsm.extend({ /* your stuff */});
```

Great, now that we know how to pull it in, let's create an FSM to represent a vehicle traffic light at a pedestrian crosswalk:

```javascript
var vehicleSignal = new machina.Fsm( {

    // the initialize method is called right after the FSM
    // instance is constructed, giving you a place for any
    // setup behavior, etc. It receives the same arguments
    // (options) as the constructor function.
    initialize: function( options ) {
        // your setup code goes here...
    },

    namespace: "vehicle-signal",

    // `initialState` tells machina what state to start the FSM in.
    // The default value is "uninitialized". Not providing
    // this value will throw an exception in v1.0+
    initialState: "uninitialized",

    // The states object's top level properties are the
    // states in which the FSM can exist. Each state object
    // contains input handlers for the different inputs
    // handled while in that state.
    states: {
        uninitialized: {
            // Input handlers are usually functions. They can
            // take arguments, too (even though this one doesn't)
            // The "*" handler is special (more on that in a bit)
            "*": function() {
                this.deferUntilTransition();
                // the `transition` method takes a target state (as a string)
                // and transitions to it. You should NEVER directly assign the
                // state property on an FSM. Also - while it's certainly OK to
                // call `transition` externally, you usually end up with the
                // cleanest approach if you endeavor to transition *internally*
                // and just pass input to the FSM.
                this.transition( "green" );
            }
        },
        green: {
            // _onEnter is a special handler that is invoked
            // immediately as the FSM transitions into the new state
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 30000 );
                this.emit( "vehicles", { status: "GREEN" } );
            },
            // If all you need to do is transition to a new state
            // inside an input handler, you can provide the string
            // name of the state in place of the input handler function.
            timeout: "green-interruptible",
            pedestrianWaiting: function() {
                this.deferUntilTransition( "green-interruptible" );
            },
            // _onExit is a special handler that is invoked just before
            // the FSM leaves the current state and transitions to another
            _onExit: function() {
                clearTimeout( this.timer );
            }
        },
        "green-interruptible": {
            pedestrianWaiting: "yellow"
        },
        yellow: {
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 5000 );
                // machina FSMs are event emitters. Here we're
                // emitting a custom event and data, etc.
                this.emit( "vehicles", { status: "YELLOW" } );
            },
            timeout: "red",
            _onExit: function() {
                clearTimeout( this.timer );
            }
        },
        red: {
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 1000 );
                this.emit( "vehicles", { status: "RED" } );
            },
            _reset: "green",
            _onExit: function() {
                clearTimeout(this.timer);
            }
        }
    },

    // While you can call the FSM's `handle` method externally, it doesn't
    // make for a terribly expressive API. As a general rule, you wrap calls
    // to `handle` with more semantically meaningful method calls like these:
    reset: function() {
        this.handle( "_reset" );
    },

    pedestrianWaiting: function() {
        this.handle( "pedestrianWaiting" );
    }
} );

// Now, to use it:
// This call causes the FSM to transition from uninitialized -> green
// & queues up pedestrianWaiting input, which replays after the timeout
// causes a transition to green-interruptible....which immediately
// transitions to yellow since we have a pedestrian waiting. After the
// next timeout, we end up in "red".
vehicleSignal.pedestrianWaiting();
// Once the FSM is in the "red" state, we can reset it to "green" by calling:
vehicleSignal.reset();
```

Though the code comments give you a lot of detail, let's break down what's happening in the above FSM:

* When you are creating an FSM, the constructor takes one argument, the `options` arg - which is an object that contains (at least) the `states` & `initialState` values for your FSM, as well as an optional `initialize` method (which is invoked at the end of the underlying constructor function) and any additional properties or methods you want on the FSM.
* It can exist in one of five possible states: `uninitialized`, `green`, `green-interruptible`, `yellow` and `red`. (Only one state can be active at a time.)
* The states themselves are objects under the `states` property on the FSM, and contain handlers whose names match the input types that the FSM accepts while in that state.
* It starts in the `uninitialized` state.
* It accepts input either by calling `handle` directly and passing the input type as a string (plus any arguments), or by calling top level methods you put on your FSM's prototype that wrap the calls to `handle` with a more expressive API.
* You do *not* assign the state value of the FSM directly, instead, you use `transition(stateName)` to transition to a different state.
* Special "input handlers" exist in machina: `_onEnter`, `_onExit` and `*`. In fact, the very first state (`uninitialized`) in this FSM is using `*`. It's the "catch-all" handler which, if provided, will match any input in that state that's not explicitly matched by name. In this case, any input handled in `uninitialized` will cause the FSM to defer the input (queue it up for replay after transitioning), and immediately transfer to `green`. (This is just to demonstrate how a start-up-only state can automatically transfer into active state(s) as clients begin using the FSM. )

>Note - input handlers can return values. Just be aware that this is not reliable in hierarchical FSMs.

### Going Further
machina provides two constructor functions for creating an FSM: `machina.Fsm` and `machina.BehavioralFsm`:

#### The BehavioralFsm Constructor
`BehavioralFsm` is new to machina as of v1.0 (though the `Fsm` constructor now inherits from it). The `BehavioralFsm` constructor lets you create an FSM that defines *behavior* (hence the name) that you want applied to multiple, separate instances of *state*. A `BehavioralFsm` instance does not (should not!) track state locally, on itself. For example, consider this scenario....where we get to twist our `vehicleSignal` FSM beyond reason: :smile:

```javascript
var vehicleSignal = new machina.BehavioralFsm( {

    initialize: function( options ) {
        // your setup code goes here...
    },

    namespace: "vehicle-signal",

    initialState: "uninitialized",

    states: {
        uninitialized: {
            "*": function( client ) {
                this.deferUntilTransition( client );
                this.transition( client, "green" );
            }
        },
        green: {
            _onEnter: function( client ) {
                client.timer = setTimeout( function() {
                    this.handle(  client, "timeout" );
                }.bind( this ), 30000 );
                this.emit( "vehicles", { client: client, status: GREEN } );
            },
            timeout: "green-interruptible",
            pedestrianWaiting: function( client ) {
                this.deferUntilTransition(  client, "green-interruptible" );
            },
            _onExit: function( client ) {
                clearTimeout( client.timer );
            }
        },
        "green-interruptible": {
            pedestrianWaiting: "yellow"
        },
        yellow: {
            _onEnter: function( client ) {
                client.timer = setTimeout( function() {
                    this.handle( client, "timeout" );
                }.bind( this ), 5000 );
                this.emit( "vehicles", { client: client, status: YELLOW } );
            },
            timeout: "red",
            _onExit: function( client ) {
                clearTimeout( client.timer );
            }
        },
        red: {
            _onEnter: function( client ) {
                client.timer = setTimeout( function() {
                    this.handle( client, "timeout" );
                }.bind( this ), 1000 );
            },
            _reset: "green",
            _onExit: function( client ) {
                clearTimeout( client.timer );
            }
        }
    },

    reset: function( client ) {
        this.handle(  client, "_reset" );
    },

    pedestrianWaiting: function( client ) {
        this.handle( client, "pedestrianWaiting" );
    }
} );

// Now we can have multiple 'instances' of traffic lights that all share the same FSM:
var light1 = { location: "Dijsktra Ave & Hunt Blvd", direction: "north-south" };
var light2 = { location: "Dijsktra Ave & Hunt Blvd", direction: "east-west" };

// to use the behavioral fsm, we pass the "client" in as the first arg to API calls:
vehicleSignal.pedestrianWaiting( light1 );

// Now let's signal a pedestrian waiting at light2
vehicleSignal.pedestrianWaiting( light2 );

// if you were to inspect light1 and light2, you'd see they both have
// a __machina__ property, which contains metadata related to this FSM.
// For example, light1.__machina__.vehicleSignal.state might be "green"
// and light2.__machina__.vehicleSignal.state might be "yellow" (depending
// on when you check). The point is - the "clients' state" is tracked
// separately from each other, and from the FSM. Here's a snapshot of
// light1 right after the vehicleSignal.pedestrianWaiting( light1 ) call:

{
  "location": "Dijsktra Ave & Hunt Blvd",
  "direction": "north-south",
  "__machina__": {
    "vehicle-signal": {
      "inputQueue": [
        {
          "type": "transition",
          "untilState": "green-interruptible",
          "args": [
            {
              "inputType": "pedestrianWaiting",
              "delegated": false
            }
          ]
        }
      ],
      "targetReplayState": "green",
      "state": "green",
      "priorState": "uninitialized",
      "priorAction": "",
      "currentAction": "",
      "currentActionArgs": [
        {
          "inputType": "pedestrianWaiting",
          "delegated": false
        }
      ],
      "inExitHandler": false
    }
  },
  "timer": 11
}

```

Though we're using the *same FSM for behavior*, the *state is tracked separately*. This enables you to keep a smaller memory footprint, especially in situations where you'd otherwise have lots of individual instances of the same FSM in play. More importantly, though, it allows you to take a more functional approach to FSM behavior and state should you prefer to do so. (As a side note, it also makes it much simpler to store a client's state and re-load it later and have the FSM pick up where it left off, etc.)

#### The Fsm Constructor
If you've used machina prior to v1.0, the `Fsm` constructor is what you're familiar with. It's functionally equivalent to the `BehavioralFsm` (in fact, it inherits from it), except that it can only deal with one client: *itself*. There's no need to pass a `client` argument to the API calls on an `Fsm` instance, since it only acts on itself. All of the metadata that was stamped on our `light1` and `light2` clients above (under the `__machina__` property) is at the instance level on an `Fsm` (as it has been historically for this constructor).

### Wait - What's This About Inheritance?
machina's FSM constructor functions are simple to extend. If you don't need an instance, but just want a modified constructor function to use later to create instances, you can do something like this:

```javascript
var TrafficLightFsm = machina.Fsm.extend({ /* your options */ });

// later/elsewhere in your code:
var trafficLight = new TrafficLightFsm();

// you can also override any of the options:
var anotherLight = new TrafficLightFsm({ initialState: "go" });
```

The `extend` method works similar to other frameworks (like Backbone, for example). The primary difference is this: *the states object will be deep merged across the prototype chain* into an instance-level `states` property (so it doesn't mutate the prototype chain). This means you can add new states as well as add new (or override existing) handlers to existing states as you inherit from "parent" FSMs. This can be very useful, but – as with all things inheritance-related – use with caution!

### And You Mentioned Events?
machina FSMs are event emitters, and subscribing to them is pretty easy:

```javascript

// I'd like to know when the transition event occurs
trafficLight.on("transition", function (data){
    console.log("we just transitioned from " + data.fromState + " to " + data.toState);
});

// Or, maybe I want to know when ANY event occurs
trafficLight.on("*", function (eventName, data){
    console.log("this thing happened:", eventName);
});

```

Unsubscribing can be done a couple of ways:

```javascript
//each listener gets a return value
var sub = trafficLight.on("transition", someCallback);
sub.off(); // unsubscribes the handler

// OR, we can use the FSM's prototype method -
// remove this specific subscription:
trafficLight.off("transition", someCallback);
// remove all transition subscribers
trafficLight.off("transition");
// remove ALL subscribers, period:
trafficLight.off();
```

You can emit your own custom events in addition to the built-in events machina emits. To read more about these events, see the [wiki](https://github.com/ifandelse/machina.js/wiki).

### Things Suddenly Got Hierarchical!
One of the most exciting additions in v1.0: machina now supports hierarchical state machines. Remember our earlier example of the `vehicleSignal` FSM? Well, that's only *part* of a pedestrian crosswalk. Pedestrians need their own signal as well - typically a sign that signals "Walk" and "Do Not Walk". Let's peek at what an FSM for this might look like:

```javascript
var pedestrianSignal = new machina.Fsm( {
    namespace: "pedestrian-signal",
    initialState: "uninitialized",
    reset: function() {
        this.transition( "walking" );
    },
    states: {
        uninitialized: {
            "*": function() {
                this.deferUntilTransition();
                this.transition( "walking" );
            }
        },
        walking: {
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 30000 );
                this.emit( "pedestrians", { status: WALK } );
            },
            timeout: "flashing",
            _onExit: function() {
                clearTimeout( this.timer );
            }
        },
        flashing: {
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 5000 );
                this.emit( "pedestrians", { status: DO_NOT_WALK, flashing: true } );
            },
            timeout: "dontwalk",
            _onExit: function() {
                clearTimeout( this.timer );
            }
        },
        dontwalk: {
            _onEnter: function() {
                this.timer = setTimeout( function() {
                    this.handle( "timeout" );
                }.bind( this ), 1000 );
            },
            _reset: "walking",
            _onExit: function() {
                clearTimeout( this.timer );
            }
        }
    }
} )
```

In many ways, our `pedestrianSignal` is similar to the `vehicleSignal` FSM:

* It starts in the `uninitialized` state, and the first input causes it to transition to `walking` before actually processing the input.
* It can only be in one of four states: `uninitialized`, `walking`, `flashing` and `dontwalk`.
* This FSM's input is primarily internally-executed, based on timers (`setTimeout` calls).

Now - we *could* stand up an instance of `pedestrianSignal` and `vehicleSignal`, and subscribe them to each other's `transition` events. This would make them "siblings" - where `pedestrianSignal` could, for example, only transition to `walking` when `vehicleSignal` is in the `red` state, etc. While there are scenarios where this sort of "sibling" approach is useful, what we really have is a hierarchy. There are two higher level states that each FSM represents, a "vehicles-can-cross" state and a "pedestrians-can-cross" state. With machina v1.0, we can create an FSM to model these higher states, and attach our `pedestrianSignal` and `vehicleSignal` FSMs to their parent states:

```javascript
var crosswalk = new machina.Fsm( {
    namespace: "crosswalk",
    initialState: "vehiclesEnabled",
    states: {
        vehiclesEnabled: {
            _child: vehicleSignal,
            _onEnter: function() {
                this.emit( "pedestrians", { status: DO_NOT_WALK } );
            },
            timeout: "pedestriansEnabled"
        },
        pedestriansEnabled: {
            _child: pedestrianSignal,
            _onEnter: function() {
                this.emit( "vehicles", { status: RED } );
            },
            timeout: "vehiclesEnabled"
        }
    }
} );
```
Notice how each state has a `_child` property? This property can be used to assign an FSM instance to act as a child FSM for this parent state (or a factory function that produces an instance to be used, etc.). Here's how it works:

* When an FSM is handling input, it attempts to let the child FSM handle it first. If the child emits a `nohandler` event, the parent FSM will take over and attempt to handle it. For example - if a `pedestrianWaiting` input is fed to the above FSM while in the `vehiclesEnabled` state, it will be passed on to the `vehicleSignal` FSM to be handled there.
* Events emitted from the child FSM are bubbled up to be emitted by the top level parent (except for the `nohandler` event).
* If a child FSM handles input that it does not have a handler for, it will bubble the input up to the parent FSM to be handled there. Did you notice that both our `pedestrianSignal` and `vehicleSignal` FSMs queue up a `timeout` input in the `dontwalk` and `red` states, respectively? However, neither of those FSMs have an input handler for `timeout` in those states. When these FSMs become part of the hierarchy above, as children of the `crosswalk` FSM, the `timeout` input will bubble up to the parent FSM to be handled, where there *are* handlers for it.
* When the parent FSM transitions to a new state, any child FSM from a previous state is ignored entirely (i.e. - events emitted, or input bubbled, will *not* be handled in the parent). If the parent FSM transitions back to that state, it will resume listening to the child FSM, etc.
* As the parent state transitions into any of its states, it will tell the child FSM to handle a `_reset` input. This gives you a hook to move the child FSM to the correct state before handling any further input. For example, you'll notice our `pedestrianSignal` FSM has a `_reset` input handler in the `dontwalk` state, which transitions the FSM to the `walking` state.

In v1.1.0, machina added the `compositeState()` method to the `BehavioralFsm` and `Fsm` prototypes. This means you can get the current state of the FSM hierarchy. For example:

```javascript
// calling compositeState on Fsm instances
console.log( crosswalk.compositeState() ); // vehiclesEnabled.green

// calling compositeState on BehavioralFsm instances
// (you have to pass the client arg)
console.log( crosswalk.compositeState( fsmClient ) ); // pedestriansEnabled.walking
```

>Caveats: This feature is very new to machina, so expect it to evolve a bit. I plan to fine-tune how events bubble in a hierarchy a bit more.

### The Top Level machina object
The top level `machina` object has the following members:

* `Fsm` - the constructor function used to create FSMs.
* `BehavioralFsm` – the constructor function used to create BehavioralFSM instances.
* `utils` - contains helper functions that can be overridden to change default behavior(s) in machina:
    * `makeFsmNamespace` - function that provides a default "channel" or "exchange" for an FSM instance.  (e.g. - fsm.0, fsm.1, etc.)
* `on` - method used to subscribe a callback to top-level machina events (currently the only event published at this level is `newFsm`)
* `off` - method used to unsubscribe a callback to top-level machina events.
* `emit` - top-level method used to emit events.
* `eventListeners` - an object literal containing the susbcribers to any top-level events.

## Build, Tests & Examples
machina.js uses [gulp.js](http://gulpjs.com/) to build.

* Install node.js (and consider using [nvm](https://github.com/creationix/nvm) to manage your node versions)
* run `npm install` & `bower install` to install all dependencies
* To build, run `npm run build` - then check the lib folder for the output
* To run the examples:
    * `npm start`
    * navigate in your browser to <http://localhost:3080/>
* To run tests & examples:
    * To run node-based tests: `npm run test`
    * To run istanbul (code test coverage): `npm run coverage`
    * To see a browser-based istanbul report: `npm run show-coverage`


## Release Notes

Go [here](https://github.com/ifandelse/machina.js/blob/master/changelog.md) to see the changelog.

##Have More Questions?
Read the [wiki](https://github.com/ifandelse/machina.js/wiki) and the source – you might find your answer and more! Check out the [issue](https://github.com/ifandelse/machina.js/issues/4) opened by @burin - a *great* example of how to use github issues to ask questions, provide sample code, etc. I only ask that if you open an issue, that it be *focused on a specific problem or bug* (not wide-open ambiguity, please).


