define( [
	'postal'
], function ( postal ) {
	return {
		connectivity : postal.channel( "connectivity", "#" )
	};
} );