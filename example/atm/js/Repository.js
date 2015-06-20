var clientRepository, authRepository, resources, accounts, currentAcct;
( function( _ ) {
	var results = {	};
	accounts = {
		"123456789": {
			pin: "8675",
			name: "Elwin Ransom",
			limit: 20000,
			balance: 100000
		},
		"987654321": {
			pin: "3090",
			name: "Edward Weston",
			limit: 400,
			balance: 300
		}
	};
	authRepository = {
		authorize: function( acct, pin ) {
			var authed = accounts[acct] && accounts[acct].pin === pin;
			if ( authed ) {
				currentAcct = acct;
				return true;
			}
			return false;
		},

		deauthorize: function( acct ) {
			if ( currentAcct === acct ) {
				currentAcct = undefined;
				return true;
			}
			return false;
		}
	};
	clientRepository = {
		withdrawal: function( acct, amount ) {
			var current = accounts[currentAcct],
				newBal = current.balance - amount,
				result = {
					status: ( amount > current.limit ) ? "OverLimit" : ( newBal < 0 ) ? "InsufficientFunds" : "Successful",
					transactionAmount: amount
				};
			if ( result.status === "Successful" )
				current.balance = newBal;
			if ( !results[acct] ) {
				results[acct] = [];
			}
			results[acct].push( $.extend( true, { transactionType: "Withdrawal" }, accounts[ currentAcct ], result ) );
			return { acct: acct, resultId: results[acct].length - 1 };
		},
		deposit: function( acct, amount ) {
			accounts[ currentAcct ].balance += amount;
			if ( !results[acct] ) {
				results[acct] = [];
			}
			results[acct].push( $.extend( true, { transactionType: "Deposit" }, accounts[ currentAcct ], { status: "Successful", transactionAmount: amount } ) );
			return { acct: acct, resultId: results[acct].length - 1 };
		}
	};
	resources = {
		result: {
			read: function( model, options ) {
				options.success( results[model.acct][model.id] );
			}
		},
		accountInfo: {
			read: function( model, options ) {
				options.success( accounts[model.id] );
			}
		}
	};

	Backbone.sync = function( method, model, options ) {
		var modelType = model.get( "modelType" );
		resources[modelType][method]( model.toJSON(), options );
	};
} )( _ );
