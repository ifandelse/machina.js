var slice = [].slice;
var NEXT_TRANSITION = "transition";
var NEXT_HANDLER = "handler";
var HANDLING = "handling";
var HANDLED = "handled";
var NO_HANDLER = "nohandler";
var TRANSITION = "transition";
var INVALID_STATE = "invalidstate";
var DEFERRED = "deferred";
var NEW_FSM = "newfsm";
var utils = {
	makeFsmNamespace: ( function() {
		var machinaCount = 0;
		return function() {
			return "fsm." + machinaCount++;
		};
	} )(),
	getDefaultOptions: function() {
		return {
			initialState: "uninitialized",
			eventListeners: {
				"*": []
			},
			states: {},
			eventQueue: [],
			namespace: utils.makeFsmNamespace(),
			targetReplayState: "",
			state: undefined,
			priorState: undefined,
			_priorAction: "",
			_currentAction: ""
		};
	}
};

if ( !_.deepExtend ) {
	var behavior = {
			"*": function( obj, sourcePropKey, sourcePropVal ) {
				obj[ sourcePropKey ] = sourcePropVal;
			},
			"object": function( obj, sourcePropKey, sourcePropVal ) {
				obj[ sourcePropKey ] = deepExtend( {}, obj[ sourcePropKey ] || {}, sourcePropVal );
			},
			"array": function( obj, sourcePropKey, sourcePropVal ) {
				obj[ sourcePropKey ] = [];
				_.each( sourcePropVal, function( item, idx ) {
					behavior[ getHandlerName( item ) ]( obj[ sourcePropKey ], idx, item );
				}, this );
			}
		},
		getActualType = function( val ) {
			if ( _.isArray( val ) ) {
				return "array";
			}
			if ( _.isDate( val ) ) {
				return "date";
			}
			if ( _.isRegExp( val ) ) {
				return "regex";
			}
			return typeof val;
		},
		getHandlerName = function( val ) {
			var propType = getActualType( val );
			return behavior[ propType ] ? propType : "*";
		},
		deepExtend = function( obj ) {
			_.each( slice.call( arguments, 1 ), function( source ) {
				_.each( source, function( sourcePropVal, sourcePropKey ) {
					behavior[ getHandlerName( sourcePropVal ) ]( obj, sourcePropKey, sourcePropVal );
				} );
			} );
			return obj;
		};

	_.mixin( {
		deepExtend: deepExtend
	} );
}