define( [
	'jquery',
	'machina',
	'underscore'
], function ( $, machina, _ ) {

	return function ( stethoscope ) {

		var useStethoscope = function ( fsm, steth ) {
			_.each( ['heartbeat', 'no-heartbeat'], function ( eventName ) {
				steth.on( eventName, function () {
					fsm.handle( eventName );
				} );
			} );
		};

		var fsm = new machina.Fsm( {

			namespace : 'connectivity',

			initialState : "offline",

			states : {
				probing : {
					_onEnter : function () {
						var self = this;
						if ( !self.wiredUp ) {
							useStethoscope( self, stethoscope );
							self.wiredUp = true;
						}
						stethoscope.checkHeartbeat();
					},
					heartbeat : "online",
					"no-heartbeat" : "disconnected",
					"go.offline" : "offline",
					"*" : function () {
						this.deferUntilTransition();
					}
				},

				online : {
					"window.offline"  : "probing",
					"appCache.error"  : "probing",
					"request.timeout" : "probing",
					"go.offline"      : "offline"
				},

				disconnected : {
					"window.online"        : "probing",
					"appCache.downloading" : "probing",
					"go.online"            : "probing",
					"go.offline"           : "offline"
				},

				offline : {
					"go.online" : "probing"
				}
			}
		} );

		$( window ).bind( "online", function () {
			fsm.handle( "window.online" );
		} );

		$( window ).bind( "offline", function () {
			fsm.handle( "window.offline" );
		} );

		$( window.applicationCache ).bind( "error", function () {
			fsm.handle( "appCache.error" );
		} );

		$( window.applicationCache ).bind( "downloading", function () {
			fsm.handle( "appCache.downloading" );
		} );

		return fsm;
	};
} );