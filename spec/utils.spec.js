/* global machina */
describe( "Machina Namespace Events", function() {
	describe( "when subscribing to machina top-level events", function() {
		describe( "when subscribing to specific events", function() {
			it( "should be notified of new FSM instances", function() {
				var res;
				var callback = function( fsm ) {
					res = fsm;
				};
				machina.on( "newfsm", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res.should.equal( x );
			} );
			it( "should allow a listener to unsubscribe", function() {
				var res = [];
				var callback = function( fsm ) {
					res.push( fsm );
				};
				machina.on( "newfsm", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res.should.eql( [ x ] );
				machina.off( "newfsm", callback );
				var y = new machina.Fsm( { states: { uninitialized: {} } } );
				res.should.eql( [ x ] );
			} );
			it( "should throw if useSafeEmit is set to false and a subscriber throws", function() {
				machina.useSafeEmit = false;
				var res;
				var callback = function( fsm ) {
					throw new Error( "O NOES!" );
				};
				machina.on( "newfsm", callback );
				( function() {
					var x = new machina.Fsm( { states: { uninitialized: {} } } );
				} ).should.throw( /O NOES/ );
				machina.off( "newfsm", callback );
			} );
			it( "should console.log if useSafeEmit is set to true and a subscriber throws", function() {
				machina.useSafeEmit = true;
				var res;
				var callback = function( fsm ) {
					throw new Error( "O NOES!" );
				};
				var log = console.log;
				console.log = function( msg ) {
					res = msg;
				};
				machina.on( "newfsm", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res.should.match( /Error: O NOES!/ );
				console.log = log;
				machina.off( "newfsm", callback );
			} );
		} );
		describe( "when subscribing to the wildcard '*' (all events)", function() {
			it( "should be notified of new FSM instances", function() {
				var res;
				var callback = function( eventName, fsm ) {
					res = { fsm: fsm, eventName: eventName };
				};
				machina.on( "*", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res.fsm.should.equal( x );
				res.eventName.should.equal( "newfsm" );
			} );
			it( "should allow a listener to unsubscribe", function() {
				var res = [];
				var callback = function( eventName, fsm ) {
					res.push( { fsm: fsm, eventName: eventName } );
				};
				machina.on( "*", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res[ 0 ].fsm.should.equal( x );
				res[ 0 ].eventName.should.equal( "newfsm" );
				res.length.should.equal( 1 );
				machina.off( "*", callback );
				var y = new machina.Fsm( { states: { uninitialized: {} } } );
				res.length.should.equal( 1 );
			} );
			it( "should throw if useSafeEmit is set to false and a subscriber throws", function() {
				machina.useSafeEmit = false;
				var res;
				var callback = function( eventName, fsm ) {
					throw new Error( "O NOES!" );
				};
				machina.on( "*", callback );
				( function() {
					var x = new machina.Fsm( { states: { uninitialized: {} } } );
				} ).should.throw( /O NOES/ );
			} );
			it( "should console.log if useSafeEmit is set to true and a subscriber throws", function() {
				machina.useSafeEmit = true;
				var res;
				var callback = function( eventName, fsm ) {
					throw new Error( "O NOES!" );
				};
				var log = console.log;
				console.log = function( msg ) {
					res = msg;
				};
				machina.on( "*", callback );
				var x = new machina.Fsm( { states: { uninitialized: {} } } );
				res.should.match( /Error: O NOES!/ );
				console.log = log;
			} );
		} );
	} );
} );
