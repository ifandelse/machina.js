var orig = amplify.publish;

amplify.publish = function( topic, message ) {
	try {
		console.log( topic + " " + JSON.stringify( message ) );
	}
	catch ( exception ) {
		console.log( topic + " (unable to serialize payload)" );
	}
	orig.call( this, topic, message );
}
