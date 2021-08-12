import events from "./events.js";
import _ from "lodash";

const makeFsmNamespace = ( function() {
	let machinaCount = 0;
	return function() {
		return `fsm.${ machinaCount++ }`;
	};
}() );

function getDefaultBehavioralOptions() {
	return {
		initialState: "uninitialized",
		eventListeners: {
			"*": [],
		},
		states: {},
		namespace: makeFsmNamespace(),
		useSafeEmit: false,
		hierarchy: {},
		pendingDelegations: {},
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
		inExitHandler: false,
	};
}

/*
	handle ->
		child = stateObj._child && stateObj._child.instance;

	transition ->
		newStateObj._child = getChildFsmInstance( newStateObj._child );
		child = newStateObj._child && newStateObj._child.instance;
*/
function getChildFsmInstance( config ) {
	if ( !config ) {
		return;
	}
	let childFsmDefinition = {};
	if ( typeof config === "object" ) {
		// is this a config object with a factory?
		if ( config.factory ) {
			childFsmDefinition = config;
			childFsmDefinition.instance = childFsmDefinition.factory();
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
	// Need to investigate potential for discarded event
	// listener memory leak in long-running, deeply-nested hierarchies.
	return child.on( "*", function( eventName, data ) {
		let ticket;
		switch ( eventName ) {
		case events.NO_HANDLER:
			if ( !data.ticket && !data.delegated && data.namespace !== fsm.namespace ) {
				// Ok - we're dealing w/ a child handling input that should bubble up
				data.args[ 1 ].bubbling = true;
			}
			// we do NOT bubble _reset inputs up to the parent
			if ( data.inputType !== "_reset" ) {
				fsm.handle( fsm, data.args ); // eslint-disable-line prefer-spread
			}
			break;
		case events.HANDLING :
			ticket = data.ticket;
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
const _machKeys = [ "states", "initialState", ];
const extend = function( protoProps, staticProps ) {
	const parent = this; // eslint-disable-line no-invalid-this, consistent-this
	let fsm; // placeholder for instance constructor
	const machObj = {}; // object used to hold initialState & states from prototype for instance-level merging
	const Ctor = function() {}; // placeholder ctor function used to insert level in prototype chain

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
		fsm = function( ...args ) {
			args[ 0 ] = args[ 0 ] || {};
			const instanceStates = args[ 0 ].states || {};
			const blendedState = _.merge( _.cloneDeep( machObj ), { states: instanceStates, } );
			blendedState.initialState = args[ 0 ].initialState || this.initialState; // eslint-disable-line no-invalid-this
			_.extend( args[ 0 ], blendedState );
			parent.apply( this, args ); // eslint-disable-line no-invalid-this
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

/* eslint-disable no-magic-numbers */
function createUUID() {
	const s = [];
	const hexDigits = "0123456789abcdef";
	for ( let i = 0; i < 36; i++ ) {
		s[ i ] = hexDigits.substr( Math.floor( Math.random() * 0x10 ), 1 );
	}
	s[ 14 ] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
	s[ 19 ] = hexDigits.substr( ( s[ 19 ] & 0x3 ) | 0x8, 1 ); // bits 6-7 of the clock_seq_hi_and_reserved to 01
	s[ 8 ] = s[ 13 ] = s[ 18 ] = s[ 23 ] = "-";
	return s.join( "" );
}
/* eslint-enable no-magic-numbers */

const utils = {
	createUUID,
	extend,
	getDefaultBehavioralOptions,
	getDefaultClientMeta,
	getChildFsmInstance,
	listenToChild,
	makeFsmNamespace,
};

export { utils };
