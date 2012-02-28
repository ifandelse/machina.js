var AtmApplication = function ( target ) {
	//----------------------------------------------------------------------------
	//
	// The top level application object
	//
	//----------------------------------------------------------------------------
	var app = {
		atm   : new Atm(),
		models: {
			accountInfo: undefined
		},
		views : {
			main      : new AppView( { target: target } ),
			nav       : new NavView(),
			login     : new LoginView( { target: "#screen" } ),
			account   : new AccountView( { target: "#screen" } ),
			deposit   : new DepositView( { target: "#screen" } ),
			result    : new ResultView( { target: "#screen" } ),
			withdrawal: new WithdrawalView( { target: "#screen" } )
		},
		start : function () {
			this.atm.handle( "initialize" );
		}
	};

	app.navFsm = new NavFsm(app.atm, app.views.nav);

	//----------------------------------------------------------------------------
	//
	// Handlers for View Events
	//
	//----------------------------------------------------------------------------
	app.views.main.on( "AppRendered", function () {
		app.views.nav.render( app.views.nav.unAuthLayout );
	} );

	app.views.login.on( "Authenticate", function ( model ) {
		app.atm.handle( "authorize", model );
	} );

	app.views.deposit.on( "Deposit", function ( amount ) {
		app.atm.handle( "deposit", amount );
	} );

	app.views.withdrawal.on( "Withdrawal", function ( amount ) {
		app.atm.handle( "withdrawal", amount );
	} );

	//----------------------------------------------------------------------------
	//
	// Handlers for App FSM Events
	//
	//----------------------------------------------------------------------------
	app.atm.on( "Initialized", function () {
		app.views.main.render();
		app.router = new Router( app.atm, app.navFsm, app.views, app.models );
		Backbone.history.start( { root: "/example/atm/" } );
	} );

	app.atm.on( "Authorized", function ( data ) {
		app.models.accountInfo = new AccountInfo( { id: data.acct } );
		app.views.main.model.set( "currentAccount", data.acct ); //TODO = needed?
		window.location.hash = "account";
	} );

	app.atm.on( "UnAuthorized", function () {
		window.location.hash = "unauthorized";
	} );
	app.atm.on( "Result", function ( data ) {
		app.models.accountInfo.fetch();
		window.location.hash = "result/" + data.resultId;
	} );

	return app;
};

$( function () {
	window.atmApp = new AtmApplication( '#content' );
	window.atmApp.start();
} );
