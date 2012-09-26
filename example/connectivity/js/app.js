define([
	'bus',
    'connectivityFsm',
    'stethoscope',
    'mainView'
], function( bus, ConnectivityFsm, Stethoscope, MainView ){
	var stethoscope = new Stethoscope({ url: "heartbeat" });
	stethoscope.on("checking-heartbeat", function() {
		bus.heartbeat.publish({topic: "checking", data: {} });
	});

	var app = {
		view: new MainView(),
		monitor: new ConnectivityFsm( stethoscope )
	};

	app.view.render();

	return app;
});