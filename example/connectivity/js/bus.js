define( [
	'postal',
	'postal.diags'
], function( postal, DiagnosticsWireTap ) {
	return {
		_wiretaps: {
			firehose: new DiagnosticsWireTap( "firehose", function( x ) {
				console.log( x );
			} )
		},
		connectivityOutput: postal.channel( "connectivity.events", "#" ),
		connectivityInput: postal.channel( "connectivity", "#" ),
		heartbeat: postal.channel( "heartbeat", "#" )
	};
} );
