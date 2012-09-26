define([
	'bus',
    'connectivityFsm',
    'stethoscope'
], function( bus, ConnectivityFsm, Stethoscope ){
	var app = {
		monitor: new ConnectivityFsm( new Stethoscope({ url: "heartbeat" }) )
	};

	app.monitor.on("*", function() {
		$('body' ).append("<div><pre>" + JSON.stringify(arguments, null, 4) + "</pre></div><hr />");
	});

	/*
	 the following commands can be issued via console (or whatever) to get an idea of how the FSM reacts:

	 // go online
	 monitor.handle("goOnline");

	 // go offline
	 monitor.handle("goOffline");

	 // simulate window.offline event
	 $(window).trigger("window.offline");

	 etc., etc.

	 */

	return app;
});