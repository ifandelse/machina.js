var NavFsm = function( appFsm, navView ) {
	var fsm = new machina.Fsm( {
		initialState: "unauthorized",
		states: {
			"unauthorized": {
				_onEnter: function() {
					navView.unAuthLayout();
				},
				"*": function() {
					navView.unAuthLayout();
				}
			},
			"authorized": {
				"*": function() {
					navView.authLayout();
				},
				"deposit": function() {
					navView.depositLayout();
				},
				"withdrawal": function() {
					navView.withdrawalLayout();
				}
			}
		}
	} );
	appFsm.on( "Authorized", function() {
		fsm.transition( "authorized" );
	} );
	appFsm.on( "UnAuthorized", function() {
		fsm.transition( "unauthorized" );
	} );
	return fsm;
};
