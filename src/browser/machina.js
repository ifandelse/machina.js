(function ( root, factory ) {
	if ( typeof define === "function" && define.amd ) {
		// AMD. Register as an anonymous module.
		define( ["underscore"], function ( _ ) {
			return factory( _, root );
		} );
	} else {
		// Browser globals
    root.machina = factory( root._, root );
	}
}( this, function ( _, global, undefined ) {

	//import("../machina.js");

	return machina;
} ));