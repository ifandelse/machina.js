QUnit.specify( "machina.js", function () {
	var rgx = /.*\.[0-9]*/;
	describe( "machina.utils", function () {
		describe( "When calling machina.utils.makeFsmExchange", function () {
			var name = machina.utils.makeFsmNamespace();
			it( "should return fsm.{number}", function () {
				assert( rgx.test( name ) ).equals( true );
			} );
		} );
		describe( "When calling machina.utils.getDefaultOptions", function () {
			var options = machina.utils.getDefaultOptions();
			it( "initialState should default to uninitialized", function () {
				assert( options.initialState ).equals( "uninitialized" );
			} );
			it( "events should default to 1 empty arrays", function () {
				assert( options.eventListeners["*"].length ).equals( 0 );
			} );
			it( "states should default to empty object", function () {
				assert( _.isEmpty( options.state ) ).equals( true );
			} );
			it( "namespace should default to expected pattern", function () {
				assert( rgx.test( options.namespace ) ).equals( true );
			} );
			it( "states object should be empty", function () {
				assert( _.isEmpty( options.states ) ).equals( true );
			} );
			it( "event queue should be empty", function () {
				assert( options.eventQueue.length ).equals( 0 );
			} );
			it( "targetReplayState should be empty", function () {
				assert( options.targetReplayState ).equals( "" );
			} );
			it( "state should be undefined", function () {
				assert( options.state === undefined ).equals( true );
			} );
			it( "prior state should be undefined", function () {
				assert( options.priorState === undefined ).equals( true );
			} );
			it( "prior action should be empty", function () {
				assert( options._priorAction ).equals( "" );
			} );
			it( "current action should be empty", function () {
				assert( options._currentAction ).equals( "" );
			} );
		} );
	} );
} );