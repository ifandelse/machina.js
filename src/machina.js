/*global module, define */
( function( root, factory ) {
	/* istanbul ignore if  */
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( [ "lodash" ], function( _ ) {
			return factory( _, root );
		} );
	/* istanbul ignore else  */
	} else if ( typeof module === "object" && module.exports ) {
		// Node, or CommonJS-Like environments
		module.exports = factory( require( "lodash" ) );
	} else {
		// Browser globals
		root.machina = factory( root._, root );
	}
}( this, function( _, global, undefined ) {
	//import("utils.js");
	//import("emitter.js");
	//import("BehavioralFsm.js");
	//import("Fsm.js");
	//import("api.js");
	return machina;
} ));
