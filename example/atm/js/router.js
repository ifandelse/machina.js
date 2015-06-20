var Router = function( atm, nav, views, models ) {
	var delegateSubmit = function( handler ) {
			$( document ).undelegate( "#submit", "click" );
			if ( handler ) {
				$( document ).delegate( "#submit", "click", handler );
			}
		},
		_Router = Backbone.Router.extend( {
			routes: {
				"deauthorize": "deauthorize",
				"unauthorized": "unauthorized",
				"account": "account",
				"deposit": "deposit",
				"withdrawal": "withdrawal",
				"result/:id": "result",
				"*other": "root"
			},

			initialize: function() {
				_.bindAll( this, "deauthorize", "unauthorized", "account", "deposit", "root", "withdrawal" );
			},

			deauthorize: function() {
				models.accountInfo = undefined;
				atm.handle( "deauthorize" );
				window.location.hash = "/"
			},

			unauthorized: function() {
				nav.handle( "unauthorized" );
				views.login.render();
			},

			account: function() {
				if ( !models.accountInfo ) {
					redirectUnAuth();
				} else {
					views.account.model = models.accountInfo;
					views.account.render();
					nav.handle( "account" );
				}
			},

			deposit: function() {
				if ( !models.accountInfo ) {
					redirectUnAuth();
				} else {
					views.deposit.model.set( models.accountInfo.toJSON() );
					views.deposit.render();
					nav.handle( "deposit" );
					delegateSubmit( function() {
						views.deposit.handleSubmit();
					} );
				}
			},

			result: function( id ) {
				if ( !models.accountInfo ) {
					redirectUnAuth();
				} else {
					views.result.model.set( { id: id, acct: models.accountInfo.toJSON().id } );
					views.result.model.fetch();
					views.result.render();
					nav.handle( "result" );
				}
			},

			root: function() {
				if ( !models.accountInfo ) {
					redirectUnAuth();
				}
			},

			withdrawal: function() {
				if ( !models.accountInfo ) {
					redirectUnAuth();
				} else {
					views.withdrawal.model.set( models.accountInfo.toJSON() );
					views.withdrawal.render();
					nav.handle( "withdrawal" );
					delegateSubmit( function() {
						views.withdrawal.handleSubmit();
					} );
				}
			}
		} ),
		router = new _Router(),
		redirectUnAuth = function() {
			router.navigate( "unauthorized", { trigger: true } );
		};

	return router;
};
