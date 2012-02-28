var Atm = function( ) {
	var fsm;
	fsm = new machina.Fsm({
		initialState: "uninitialized",
		stateBag: {},
		events: [
			"Initialized",
			"Authorized",
			"UnAuthorized",
			"Deposit",
			"Withdrawal",
			"OverLimit",
			"Result"
		],
		states: {
			"uninitialized" : {
				"initialize" : function( state ) {
					// TODO: any other init work here...
					this.fireEvent( "Initialized" );
					this.transition( "unauthorized" );
				}
			},
			"unauthorized" : {
				_onEnter: function( state ) {
					this.fireEvent( "UnAuthorized", { msg: "Please enter your account and PIN." } );
				},
				"*" : function( state ) {
					this.fireEvent( "UnAuthorized", { msg: "You must authenticate first." } );
				},
				authorize : function( state, credentials ){
					if(authRepository.authorize( credentials.acct, credentials.pin )){
						state.acct = credentials.acct;
						this.transition( "authorized" );
						return;
					}
					this.fireEvent( "UnAuthorized", { msg: "Invalid Account and/or PIN."} );
				}
			},
			"authorized" : {
				_onEnter: function( state ) {
					this.fireEvent( "Authorized", { acct: state.acct } );
				},
				deposit : function( state, amount ) {
					var result = clientRepository.deposit( state.acct, amount );
					this.fireEvent("Result", result);
				},
				withdrawal : function( state, amount ) {
					var result = clientRepository.withdrawal( state.acct, amount );
					this.fireEvent("Result", result);
				},
				deauthorize : function( state ) {
					authRepository.deauthorize(state.acct);
					delete state.acct;
					this.transition("unauthorized");
				}
			}
		}
	});
	return fsm;
};