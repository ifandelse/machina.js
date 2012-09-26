require.config( {
	paths : {
		text             : "lib/require/text",
		backbone         : 'lib/backbone/backbone',
		underscore       : 'lib/underscore/underscore-min',
		mockjax          : 'lib/jquery.mockjax',
		machina          : 'lib/machina/machina',
		'machina.postal' : 'lib/machina/machina.postal',
		postal           : 'lib/postal/postal',
		'postal.diags'   : 'lib/postal/postal.diagnostics.min'
	},
	shim: {
		mockjax : [ 'jquery' ]
	},
	baseUrl : 'js'
} );

// This first require statement is pulling in foundational libraries
require([
		'jquery',
		'underscore',
        'mockjax',
        'machina.postal',
        'postal.diags'
	],
	function ( $, _ ) {

		// mockjax setup
		// Mocked response for the heartbeat check
		$.mockjax( {
			url : "heartbeat",
			type : "GET",
			status : 200,
			statusText: "success",
			responseText: { canYouHearMeNow: "good" }
		} );

		require(['app'], function( app ) {
			window.app = app;
		});

	}
);