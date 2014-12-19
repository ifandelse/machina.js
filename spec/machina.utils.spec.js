// /* global describe, it, after, before, expect */
// ( function() {
// 	var machina = typeof window === "undefined" ? require( "../lib/machina.js" ) : window.machina;
// 	var expect = typeof window === "undefined" ? require( "expect.js" ) : window.expect;
// 	var _ = typeof window === "undefined" ? require( "lodash" ) : window._;
// 	var rgx = /.*\.[0-9]*/;
// 	describe( "machina.utils", function() {
// 		describe( "When calling machina.utils.makeFsmNamespace", function() {
// 			var name = machina.utils.makeFsmNamespace();
// 			it( "should return fsm.{number}", function() {
// 				expect( rgx.test( name ) ).to.be( true );
// 			} );
// 		} );
// 		describe( "When calling machina.utils.getDefaultOptions", function() {
// 			var options = machina.utils.getDefaultOptions();
// 			it( "initialState should default to uninitialized", function() {
// 				expect( options.initialState ).to.be( "uninitialized" );
// 			} );
// 			it( "events should default to 1 empty arrays", function() {
// 				expect( options.eventListeners[ "*" ].length ).to.be( 0 );
// 			} );
// 			it( "states should default to empty object", function() {
// 				expect( _.isEmpty( options.state ) ).to.be( true );
// 			} );
// 			it( "namespace should default to expected pattern", function() {
// 				expect( rgx.test( options.namespace ) ).to.be( true );
// 			} );
// 			it( "states object should be empty", function() {
// 				expect( _.isEmpty( options.states ) ).to.be( true );
// 			} );
// 			it( "event queue should be empty", function() {
// 				expect( options.eventQueue.length ).to.be( 0 );
// 			} );
// 			it( "targetReplayState should be empty", function() {
// 				expect( options.targetReplayState ).to.be( "" );
// 			} );
// 			it( "state should be undefined", function() {
// 				expect( options.state === undefined ).to.be( true );
// 			} );
// 			it( "prior state should be undefined", function() {
// 				expect( options.priorState === undefined ).to.be( true );
// 			} );
// 			it( "prior action should be empty", function() {
// 				expect( options._priorAction ).to.be( "" );
// 			} );
// 			it( "current action should be empty", function() {
// 				expect( options._currentAction ).to.be( "" );
// 			} );
// 		} );
// 	} );
// }());
