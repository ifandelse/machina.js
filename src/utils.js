/* global _ */
/* jshint -W098, -W003 */
var slice = [].slice;
var NEXT_TRANSITION = "transition";
var HANDLING = "handling";
var HANDLED = "handled";
var NO_HANDLER = "nohandler";
var TRANSITION = "transition";
var INVALID_STATE = "invalidstate";
var DEFERRED = "deferred";
var NEW_FSM = "newfsm";

function getDefaultBehavioralOptions() {
	return {
		initialState: "uninitialized",
		eventListeners: {
			"*": []
		},
		states: {},
		namespace: utils.makeFsmNamespace(),
		useSafeEmit: false,
		hierarchy: {},
		pendingDelegations: {}
	};
}

function getDefaultClientMeta() {
	return {
		inputQueue: [],
		targetReplayState: "",
		state: undefined,
		priorState: undefined,
		priorAction: "",
		currentAction: "",
		currentActionArgs: undefined,
		inExitHandler: false
	};
}

function getLeaklessArgs( args, startIdx ) {
	var result = [];
	for ( var i = ( startIdx || 0 ); i < args.length; i++ ) {
		result[ i ] = args[ i ];
	}
	return result;
}

function getChildFsmInstance( config ) {
	if ( !config ) {
		return;
	}
	var childFsmDefinition = {};
	if ( typeof config === "object" ) {
		// is this a config object with a factory?
		if ( config.factory ) {
			childFsmDefinition = config;
		} else {
			// assuming this is a machina instance
			childFsmDefinition.factory = function() {
				return config;
			};
		}
	} else if ( typeof config === "function" ) {
		childFsmDefinition.factory = config;
	}
	childFsmDefinition.instance = childFsmDefinition.factory();
	return childFsmDefinition;
}

function listenToChild( fsm, child ) {
	return child.on( "*", function( eventName, data ) {
		switch ( eventName ) {
			case "nohandler":
				if ( !data.ticket && !data.delegated && data.namespace !== fsm.namespace ) {
					// Ok - we're dealing w/ a child handling input that should bubble up
					data.args[ 1 ].bubbling = true;
				}
				// we do NOT bubble _reset inputs up to the parent
				if ( data.inputType !== "_reset" ) {
					fsm.handle.apply( fsm, data.args );
				}
				break;
			case "handling" :
				var ticket = data.ticket;
				if ( ticket && fsm.pendingDelegations[ ticket ] ) {
					delete fsm.pendingDelegations[ ticket ];
				}
				fsm.emit( eventName, data ); // possibly transform payload?
				break;
			default:
				fsm.emit( eventName, data ); // possibly transform payload?
				break;
		}
	} );
}

// _machKeys are members we want to track across the prototype chain of an extended FSM constructor
// Since we want to eventually merge the aggregate of those values onto the instance so that FSMs
// that share the same extended prototype won't share state *on* those prototypes.
var _machKeys = [ "states", "initialState" ];
var extend = function( protoProps, staticProps ) {
	var parent = this;
	var fsm; // placeholder for instance constructor
	var machObj = {}; // object used to hold initialState & states from prototype for instance-level merging
	var Ctor = function() {}; // placeholder ctor function used to insert level in prototype chain

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if ( protoProps && protoProps.hasOwnProperty( "constructor" ) ) {
		fsm = protoProps.constructor;
	} else {
		// The default machina constructor (when using inheritance) creates a
		// deep copy of the states/initialState values from the prototype and
		// extends them over the instance so that they'll be instance-level.
		// If an options arg (args[0]) is passed in, a states or intialState
		// value will be preferred over any data pulled up from the prototype.
		fsm = function() {
			var args = slice.call( arguments, 0 );
			args[ 0 ] = args[ 0 ] || {};
			var blendedState;
			var instanceStates = args[ 0 ].states || {};
			blendedState = _.merge( _.cloneDeep( machObj ), { states: instanceStates } );
			blendedState.initialState = args[ 0 ].initialState || this.initialState;
			_.extend( args[ 0 ], blendedState );
			parent.apply( this, args );
		};
	}

	// Inherit class (static) properties from parent.
	_.merge( fsm, parent );

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	Ctor.prototype = parent.prototype;
	fsm.prototype = new Ctor();

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if ( protoProps ) {
		_.extend( fsm.prototype, protoProps );
		_.merge( machObj, _.transform( protoProps, function( accum, val, key ) {
			if ( _machKeys.indexOf( key ) !== -1 ) {
				accum[ key ] = val;
			}
		} ) );
	}

	// Add static properties to the constructor function, if supplied.
	if ( staticProps ) {
		_.merge( fsm, staticProps );
	}

	// Correctly set child's `prototype.constructor`.
	fsm.prototype.constructor = fsm;

	// Set a convenience property in case the parent's prototype is needed later.
	fsm.__super__ = parent.prototype;
	return fsm;
};

function createUUID() {
	var s = [];
	var hexDigits = "0123456789abcdef";
	for ( var i = 0; i < 36; i++ ) {
		s[ i ] = hexDigits.substr( Math.floor( Math.random() * 0x10 ), 1 );
	}
	s[ 14 ] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
	/* jshint ignore:start */
	s[ 19 ] = hexDigits.substr( ( s[ 19 ] & 0x3 ) | 0x8, 1 ); // bits 6-7 of the clock_seq_hi_and_reserved to 01
	/* jshint ignore:end */
	s[ 8 ] = s[ 13 ] = s[ 18 ] = s[ 23 ] = "-";
	return s.join( "" );
}

var utils = {
	makeFsmNamespace: ( function() {
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	} )(),
	listenToChild: listenToChild,
	getLeaklessArgs: getLeaklessArgs,
	getDefaultOptions: getDefaultBehavioralOptions,
	getDefaultClientMeta: getDefaultClientMeta,
	createUUID: createUUID
};
