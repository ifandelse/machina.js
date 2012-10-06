/*
  This FSM generates the following custom events:
   "Initialized",
   "Authorized",
   "UnAuthorized",
   "Deposit",
   "Withdrawal",
   "OverLimit",
   "Result"
 */
var Atm = function( ) {
	var fsm;
	fsm = new machina.Fsm({
		initialState: "uninitialized",
		states: {
			"uninitialized" : {
				"initialize" : function() {
					// TODO: any other init work here...
					this.fireEvent( "Initialized" );
					this.transition( "unauthorized" );
				}
			},
			"unauthorized" : {
				_onEnter: function() {
					this.fireEvent( "UnAuthorized", { msg: "Please enter your account and PIN." } );
				},
				"*" : function() {
					this.fireEvent( "UnAuthorized", { msg: "You must authenticate first." } );
				},
				authorize : function( credentials ){
					if(authRepository.authorize( credentials.acct, credentials.pin )){
						this.acct = credentials.acct;
						this.transition( "authorized" );
						return;
					}
					this.fireEvent( "UnAuthorized", { msg: "Invalid Account and/or PIN."} );
				}
			},
			"authorized" : {
				_onEnter: function() {
					this.fireEvent( "Authorized", { acct: this.acct } );
				},
				deposit : function( amount ) {
					var result = clientRepository.deposit( this.acct, amount );
					this.fireEvent("Result", result);
				},
				withdrawal : function( amount ) {
					var result = clientRepository.withdrawal( this.acct, amount );
					this.fireEvent("Result", result);
				},
				deauthorize : function() {
					authRepository.deauthorize(this.acct);
					delete this.acct;
					this.transition("unauthorized");
				}
			}
		}
	});
	return fsm;
};