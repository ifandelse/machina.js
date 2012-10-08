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
		} );
	} );
});