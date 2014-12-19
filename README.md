#machina v0.5.0

##What is it?
Machina.js is a JavaScript framework for highly customizable finite state machines (FSMs).  Many of the ideas for machina have been *loosely* inspired by the Erlang/OTP FSM behaviors.

##Why Would I Use It?
Finite state machines are a great conceptual model for many concerns facing developers – from conditional UI, connectivity monitoring & management to initialization and more. State machines can simplify tangled paths of asynchronous code, they're easy to test, and they inherently lend themselves to helping you avoid unexpected edge-case-state pitfalls. machina aims to give you the tools you need to model state machines in JavaScript, without being too prescriptive for the problem domain you're solving for.

Some frequent use cases for machina:

* online/offline connectivity management
* conditional UI (menus, navigation, workflow)
* initiliazation of node.js processes or single-page-apps
* responding to user input devices (remotes, keyboard, mouse, etc.)

###Quick Example

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

Great, now that we know how to pull it in, let's create an FSM to represent a traffic light:

```javascript
var trafficLight = new machina.Fsm({

    // the initialize method is called right after the FSM
    // instance is constructed, giving you a place for any
    // setup behavior, etc. It receives the same arguments
    // (options) as the constructor function.
    initialize: function( options ) {
        // your setup code goes here...
    },

    // `initialState` tells machina what state to start the FSM in.
    // The default value is "uninitialized". Not providing
    // this value will throw an exception in v0.5+
    initialState: "disabled",

    // The states object's top level properties are the
    // states in which the FSM can exist. Each state object
    // contains input handlers for the different inputs
    // handled while in that state.
    states: {

        disabled: {
            // Input handlers are usually functions. They can
            // take arguments, too.
            activate: function(isStopped) {
                this.transition(isStopped ? "stop" : "go");
            }
        },

        stop: {
            // Input handlers don't have to take arguments, though.
            advance : function() {
                // machina FSMs are event emitters. Here we're
                // emitting a custom event and data, etc.
                this.emit("TimeToGo", { foo: "bar" });

                // the `transition` method takes a target state
                // (as a string) and transitions to it. You should
                // NEVER directly assign the state property on an FSM.
                // Also - while it's certainly OK to call `transition`
                // externally, you usually end up with the cleanest approach
                // if you endeavor to transition *internally* and just pass
                // input to the FSM.
                this.transition("go");
            }
        },

        go: {
            // If all you need to do is transition to a new state
            // inside an input handler, you can provide the string
            // name of the state in place of the input handler function.
            advance : "caution"
        },

        caution: {
            // _onEnter is a special handler that is invoked
            // immediately as the FSM transitions into the new state
            _onEnter: function() {
                this.timeout = setTimeout(function() {
                    this.handle("advance");
                }.bind(this), 5000);
            },

            advance: "stop",

            // _onExit is a special handler that is invoked just before
            // the FSM leaves the current state and transitions to another
            _onExit: function() {
                clearTimeout(this.timeout);
            }
        }
    },

    // While you can call the FSM's `handle` method externally, it doesn't
    // make for a terribly expressive API. As a general rule, you wrap calls
    // to `handle` with more semantically meaningful method calls like these:

    advance: function() {
        this.handle("advance");
    },

    activateInStop: function () {
        this.handle("activate", true);
    },

    activateInGo: function() {
        this.handle("activate", false);
    }
});

// Now, to use it:
trafficLight.activateInStop(); // trafficLight.state = stop
trafficLight.advance(); // trafficLight.state = go
trafficLight.advance(); // trafficLight.state = caution
// after five seconds, it transitions to stop
```

Though the code comments give you a lot of detail, let's break down what's happening in the above FSM:

* When you are creating an FSM, the constructor takes one argument, the `options` arg - which is an object that contains (at least) the `states` & `initialState` values for your FSM, as well as an optional `initialize` method (which is invoked at the end of the underlying constructor function) and any additional properties or methods you want on the FSM.
* It can exist in one of four possible states: `disabled`, `stop`, `go` and `caution`. (Only one state can be active at a time.)
* The states themselves are objects under the `states` property on the FSM, and contain handlers whose names match the input types that the FSM accepts while in that state.
* It starts in the `disabled` state.
* It accepts input either by calling `handle` directly and passing the input type as a string (plus any arguments), or by calling top level methods you put on your FSM's prototype that wrap the calls to `handle` with a more expressive API.
* You do *not* assign the state value of the FSM directly, instead, you use `transition(stateName)` to transition to a different state.
* Special "input handlers" exist in machina: `_onEnter`, `_onExit` and `*`. (We don't see `*` in the above example. It's the "catch-all" handler which, if provided, will match any input in that state that's not explicitly matched by name.)

###Going Further
machina provides two constructor functions for creating an FSM: `machina.Fsm` and `machina.BehavioralFsm`:

####The BehavioralFsm Constructor
`BehavioralFsm` is new to machina as of v0.5 (though the `Fsm` constructor now inherits from it). The `BehavioralFsm` constructor lets you create an FSM that defines *behavior* (hence the name) that you want applied to multiple, separate instances of *state*. A `BehavioralFsm` instance does not (should not!) track state locally, on itself. For example, consider this scenario....where we get to twist our "TrafficLightFsm" beyond reason (:smile:):

```javascript
var trafficLightFsm = new machina.BehavioralFsm({

    initialState: "disabled",

    states: {

        disabled: {
            activate: function(client, isStopped) {
                this.transition(client, isStopped ? "stop" : "go");
            }
        },

        stop: {
            advance : function(client) {
                this.emit("TimeToGo", { foo: "bar", client: client });
                this.transition(client, "go");
            }
        },

        go: {
            advance : "caution"
        },

        caution: {
            _onEnter: function() {
                this.timeout = setTimeout(function() {
                    this.handle(client, "advance");
                }.bind(this), 5000);
            },

            advance: "stop",

            _onExit: function() {
                clearTimeout(this.timeout);
            }
        }
    },

    advance: function(client) {
        this.handle(client, "advance");
    },

    activateInStop: function (client) {
        this.handle(client, "activate", true);
    },

    activateInGo: function(client) {
        this.handle(client, "activate", false);
    }
});

// Now we can have multiple 'instances' of traffic lights that all share the same FSM:
var light1 = { location: "Dijsktra Ave & Hunt Blvd", direction: "north-south" };
var light2 = { location: "Dijsktra Ave & Hunt Blvd", direction: "east-west" };

// to use the behavioral fsm, we pass the "client" in as the first arg to API calls:
trafficLightFsm.activateInStop(light1);

/* Stringifying `light1` at this point would give us this:

    {
      "location": "Dijsktra Ave & Hunt Blvd",
      "direction": "north-south",
      "__machina__": {
        "inputQueue": [],
        "targetReplayState": "stop",
        "state": "stop",
        "priorState": "disabled",
        "priorAction": "disabled.activate",
        "currentAction": "",
        "currentActionArgs": [
          "activate",
          true
        ],
        "inExitHandler": false
      }
    }

You can see that our trafficLightFsm has "stamped" this client with it's machina-specific state.
You may also notice that the prior state was "disabled". This means that the very first
thing a BehavioralFsm does when acting on a client it hasn't seen before is to transition it
into the initial state *before* doing anything else (like handling the `activate` input).

*/

// Now let's activate light2
trafficLightFsm.activateInGo(light2);

/* Stringifying `light2` at this point gives us:

    {
      "location": "Dijsktra Ave & Hunt Blvd",
      "direction": "east-west",
      "__machina__": {
        "inputQueue": [],
        "targetReplayState": "go",
        "state": "go",
        "priorState": "disabled",
        "priorAction": "disabled.activate",
        "currentAction": "",
        "currentActionArgs": [
          "activate",
          false
        ],
        "inExitHandler": false
      }
    }

*/

// Now, if we wanted to cause an accident, put both traffic lights in the "go" state:
trafficLightFsm.advance(light1);


```

Though we're using the *same FSM for behavior*, the *state is tracked separately*. This enables you to keep a smaller memory footprint, especially in situations where you'd otherwise have lots of individual instances of the same FSM in play. More importantly, though, it allows you to take a more functional approach to FSM behavior and state should you prefer to do so. (As a side note, it also makes it much simpler to store a client's state and re-load it later and have the FSM pick up where it left off, etc.)

####The Fsm Constructor
If you've used machina prior to v0.5, the `Fsm` constructor is what you're familiar with. It's functionally equivalent to the `BehavioralFsm` (in fact, it inherits from it), except that it can only deal with one client: *itself*. There's no need to pass a `client` argument to the API calls on an `Fsm` instance, since it only acts on itself. All of the metadata that was stamped on our `light1` and `light2` clients above (under the `__machina__` property) is at the instance level on an `Fsm` (as it has been historically for this constructor).

###Wait - What's This About Inheritance?
machina's FSM constructor functions are simple to extend. If you don't need an instance, but just want a modified constructor function to use later to create instances, you can do something like this:

```javascript
var TrafficLightFsm = machina.Fsm.extend({ /* your options */ });

// later/elsewhere in your code:
var trafficLight = new TrafficLightFsm();

// you can also override any of the options:
var anotherLight = new TrafficLightFsm({ initialState: "go" });
```

The `extend` method works similar to other frameworks (like Backbone, for example). The primary difference is this: *the states object will be deep merged across the prototype chain*. This means you can add new states as well as add new (or override existing) handlers to existing states as you inherit from "parent" FSMs. This can be very useful, but – as with all things inheritance-related – use with caution!

###And You Mentioned Events?
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


