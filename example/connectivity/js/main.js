require.config( {
	paths: {
		text: 'text',
		backbone: 'backbone',
		lodash: 'lodash',
		underscore: 'lodash.underscore',
		mockjax: 'jquery.mockjax',
		machina: 'http://cdnjs.cloudflare.com/ajax/libs/machina.js/1.1.0/machina',
		'machina.postal': 'machina.postal',
		postal: 'postal',
		'postal.diags': 'postal.diagnostics',
		jquery: 'jquery',
	},
	shim: {
		mockjax: [ 'jquery' ],
		backbone: {
			deps: [ 'lodash', 'jquery' ],
			exports: 'Backbone'
		}
	}
} );

// This first require statement is pulling in foundational libraries
require( [
	'jquery',
	'mockjax',
	'machina.postal',
	'postal.diags'
 ],
	function( $ ) {
		require( [ 'app' ], function( app ) {
			// mockjax setup
			// Mocked response for the heartbeat check
			$.mockjax( {
				url: "heartbeat",
				type: "GET",
				response: function( settings ) {
					if ( app.simulateDisconnect ) {
						this.isTimeout = true;
					} else {
						this.responseText = {
							canYouHearMeNow: "good"
						};
					}
				}
			} );
			// more for convenience, our app gets a global namespace
			window.app = app;
		} );
	}
);
