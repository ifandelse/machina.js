// mockjax setup
// Mocked response for the heartbeat check
$.mockjax( {
	url : "heartbeat",
	type : "GET",
	status : 200,
	statusText: "success",
	responseText: { canYouHearMeNow: "good" }
} );

var monitor = window.connectivity.monitor = new window.connectivity.ConnectivityFsm({ url: "heartbeat" });

monitor.on("*", function() {
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