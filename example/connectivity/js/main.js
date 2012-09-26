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

		require(['app'], function( app ) {
			// mockjax setup
			// Mocked response for the heartbeat check
			$.mockjax( {
				url : "heartbeat",
				type : "GET",
				response: function ( settings ) {
					if ( app.simulateDisconnect ) {
						this.isTimeout = true;
					} else {
						this.responseText = { canYouHearMeNow: "good" }
					}
				}
			} );


			window.app = app;
		});

	}
);