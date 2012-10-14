/*
 machina
 Author: Jim Cowart (http://freshbrewedcode.com/jimcowart)
 License: Dual licensed MIT (http://www.opensource.org/licenses/mit-license) & GPL (http://www.opensource.org/licenses/gpl-license)
 Version 0.2.2
 */
var _ = require('underscore');

var slice = [].slice;
var NEXT_TRANSITION = "transition";
var NEXT_HANDLER    = "handler";
var HANDLING        = "handling";
var HANDLED         = "handled";
var NO_HANDLER      = "nohandler";
var TRANSITION      = "transition";
var INVALID_STATE   = "invalidstate";
var DEFERRED        = "deferred";
var NEW_FSM         = "newfsm";
var utils = {
	makeFsmNamespace: (function(){
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	})(),
	getDefaultOptions: function() {
		return {
			initialState      : "uninitialized",
			eventListeners    : {
				"*" : []
			},
			eventQueue        : [],
			namespace         : utils.makeFsmNamespace(),
			targetReplayState : "",
			state             : undefined,
			priorState        : undefined,
			_priorAction      : "",
			_currentAction    : ""
		};
	}
};
var Fsm = function ( options ) {
	_.extend( this, this._configureOptions( options || {} ) );
	if ( this.initialState ) {
		this.transition( this.initialState );
	}
	machina.fireEvent( NEW_FSM, this );
};

Fsm.prototype._configureOptions = function(options) {
	return _.extend(utils.getDefaultOptions(), this.options, options);
	/*if ( opt.eventListeners ) {
		this.eventListeners = _.extend( {}, opt.eventListeners );
	}*/
};

Fsm.prototype.trigger = Fsm.prototype.emit = Fsm.prototype.fireEvent = function ( eventName ) {
	var args = arguments;
	_.each( this.eventListeners["*"], function ( callback ) {
		try {
			callback.apply( this, slice.call( args, 0 ) );
		} catch ( exception ) {
			if ( console && typeof console.log !== "undefined" ) {
				console.log( exception.toString() );
			}
		}
	} );
	if ( this.eventListeners[eventName] ) {
		_.each( this.eventListeners[eventName], function ( callback ) {
			try {
				callback.apply( this, slice.call( args, 1 ) );
			} catch ( exception ) {
				if ( console && typeof console.log !== "undefined" ) {
					console.log( exception.toString() );
				}
			}
		} );
	}
};

Fsm.prototype.handle = function ( msgType ) {
	// vars to avoid a "this." fest
	var states = this.states, current = this.state, args = slice.call( arguments, 0 ), handlerName;
	this.currentActionArgs = args;
	if ( states[current] && (states[current][msgType] || states[current]["*"]) ) {
		handlerName = states[current][msgType] ? msgType : "*";
		this._currentAction = current + "." + handlerName;
		this.fireEvent.apply( this, [HANDLING].concat( args ) );
		states[current][handlerName].apply( this, args.slice( 1 ) );
		this.fireEvent.apply( this, [HANDLED].concat( args ) );
		this._priorAction = this._currentAction;
		this._currentAction = "";
		this.processQueue( NEXT_HANDLER );
	}
	else {
		this.fireEvent.apply( this, [NO_HANDLER].concat( args ) );
	}
	this.currentActionArgs = undefined;
};

Fsm.prototype.transition = function ( newState ) {
	var oldState;
	if ( this.states[newState] ) {
		this.targetReplayState = newState;
		this.priorState = this.state;
		this.state = newState;
		oldState = this.priorState;
		this.fireEvent.apply( this, [TRANSITION, oldState, newState ] );
		if ( this.states[newState]._onEnter ) {
			this.states[newState]._onEnter.call( this );
		}
		if ( this.targetReplayState === newState ) {
			this.processQueue( NEXT_TRANSITION );
		}
		return;
	}
	this.fireEvent.apply( this, [INVALID_STATE, this.state, newState ] );
};

Fsm.prototype.processQueue = function ( type ) {
	var filterFn = type === NEXT_TRANSITION ? function ( item ) { return item.type === NEXT_TRANSITION && ((!item.untilState) || (item.untilState === this.state)); } : function ( item ) { return item.type === NEXT_HANDLER; };
	var toProcess = _.filter( this.eventQueue, filterFn, this );
	this.eventQueue = _.difference( this.eventQueue, toProcess );
	_.each( toProcess, function ( item ) {
		this.handle.apply( this, item.args );
	}, this );
};

Fsm.prototype.clearQueue = function ( type, name ) {
	var filter;
	if ( type === NEXT_TRANSITION ) {
		filter = function ( evnt ) {
			return (evnt.type === NEXT_TRANSITION && (name ? evnt.untilState === name : true ));
		};
	} else if ( type === NEXT_HANDLER ) {
		filter = function ( evnt ) {
			return evnt.type === NEXT_HANDLER;
		};
	}
	this.eventQueue = _.filter( this.eventQueue, filter );
};

Fsm.prototype.deferUntilTransition = function ( stateName ) {
	if ( this.currentActionArgs ) {
		var queued = { type : NEXT_TRANSITION, untilState : stateName, args : this.currentActionArgs };
		this.eventQueue.push( queued );
		this.fireEvent.apply( this, [ DEFERRED, this.state, queued ] );
	}
};

Fsm.prototype.deferUntilNextHandler = function () {
	if ( this.currentActionArgs ) {
		var queued = { type : NEXT_TRANSITION, args : this.currentActionArgs };
		this.eventQueue.push( queued );
		this.fireEvent.apply( this, [ DEFERRED, this.state, queued ] );
	}
};

Fsm.prototype.on = function ( eventName, callback ) {
	if ( !this.eventListeners[eventName] ) {
		this.eventListeners[eventName] = [];
	}
	this.eventListeners[eventName].push( callback );
};

Fsm.prototype.off = function ( eventName, callback ) {
	if ( this.eventListeners[eventName] ) {
		this.eventListeners[eventName] = _.without( this.eventListeners[eventName], callback );
	}
};

var ctor = function() {};

var inherits = function(parent, protoProps, staticProps) {
	var child;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if (protoProps && protoProps.hasOwnProperty('constructor')) {
		child = protoProps.constructor;
	} else {
		child = function() {
			parent.apply(this, arguments);
		};
	}

	// Inherit class (static) properties from parent.
	_.extend(child, parent);

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	ctor.prototype = parent.prototype;
	child.prototype = new ctor();

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if (protoProps) {
		_.extend(child.prototype, protoProps);
	}

	// Add static properties to the constructor function, if supplied.
	if (staticProps) {
		_.extend(child, staticProps);
	}

	// Correctly set child's `prototype.constructor`.
	child.prototype.constructor = child;

	// Set a convenience property in case the parent's prototype is needed later.
	child.__super__ = parent.prototype;

	return child;
};

// The self-propagating extend function that Backbone classes use.
Fsm.extend = function(protoProps, classProps) {
	var child = inherits(this, protoProps, classProps);
	child.extend = this.extend;
	return child;
};

var machina = {
	Fsm: Fsm,
	bus: undefined,
	utils: utils,
	on: function(eventName, callback) {
		if(!this.eventListeners[eventName]) {
			this.eventListeners[eventName] = [];
		}
		this.eventListeners[eventName].push(callback);
	},
	off: function(eventName, callback) {
		if(this.eventListeners[eventName]){
			this.eventListeners[eventName] = _.without(this.eventListeners[eventName], callback);
		}
	},
	fireEvent: function(eventName) {
		var i = 0, len, args = arguments, listeners = this.eventListeners[eventName];
		if(listeners && listeners.length) {
			_.each(listeners, function(callback) {
				callback.apply(null,slice.call(args, 1));
			});
		}
	},
	eventListeners: {
		newFsm : []
	}
};

module.exports = machina;