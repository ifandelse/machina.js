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
			initialState: "uninitialized",
			eventListeners: {
				"*" : []
			},
			states: {},
			eventQueue: [],
			namespace: utils.makeFsmNamespace()
		};
	}
};
var Fsm = function ( options ) {
	var opt;
	var initialState;
	var defaults = utils.getDefaultOptions();
	if ( options ) {
		if ( options.eventListeners ) {
			this.eventListeners = _.extend( {}, options.eventListeners );
		}
		if ( options.messaging ) {
			options.messaging = _.extend( {}, defaults.messaging, options.messaging );
		}
	}
	opt = _.extend( defaults, options || {} );
	initialState = opt.initialState;
	delete opt.initialState;
	_.extend( this, opt );
	this.targetReplayState = "";
	this.state = undefined;
	this.priorState = undefined;
	this._priorAction = "";
	this._currentAction = "";
	if ( initialState ) {
		this.transition( initialState );
	}
	machina.fireEvent( NEW_FSM, this );
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