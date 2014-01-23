/*global module, define */
(function ( root, factory ) {
	if ( typeof module === "object" && module.exports ) {
		// Node, or CommonJS-Like environments
		module.exports = function ( _ ) {
			_ = _ || require( "underscore" );
			return factory( _ );
		};
	} else if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( ["underscore"], function ( _ ) {
			return factory( _, root );
		});
	} else {
		// Browser globals
		root.machina = factory( root._, root );
	}
}( this, function ( _, global, undefined ) {
	//import("utils.js");
	//import("fsm.js");
	//import("api.js");
	return machina;
}));
