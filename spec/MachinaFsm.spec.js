/* global _ */

/*
    This is a spec factory that takes a description and
    an object containing factory methods necessary to get
    the proper instances. These tests are run on Machina
    "classic" FSMs with varying levels of inheritance.
*/
function runMachinaFsmSpec( description, fsmFactory ) {
	describe( "MachinaFsm", function() {
		describe( description, function() {
			describe( "and assuming defaults", function() {
				var fsm;
				before( function() {
					fsm = fsmFactory.instanceWithDefaults();
				} );
				it( "should default the initial state to uninitialized", function() {
					fsm.initialState.should.equal( "uninitialized" );
				} );
				it( "should assign a generic namespace", function() {
					fsm.namespace.should.match( /fsm\.[0-9]*/ );
				} );
				it( "should default to empty states object", function() {
					fsm.states.should.eql( { uninitialized: {} } );
				} );
			} );
			describe( "and passing in options", function() {
				var fsm;
				before( function() {
					fsm = fsmFactory.instanceWithOptions();
				} );
				it( "should set the expected namespace", function() {
					fsm.namespace.should.equal( "specialSauceNamespace" );
				} );
				it( "should set the expected initial state value", function() {
					fsm.initialState.should.equal( "uninitialized" );
				} );
				it( "should transition to the intialState", function() {
					fsm.state.should.equal( "uninitialized" );
					fsm.compositeState().should.equal( "uninitialized" );
				} );
				it( "should set the expected states and input handlers", function() {
					fsm.states.should.eql( fsmFactory.options.states );
				} );
				it( "should throw if the initialState prop isn't set", function() {
					( function() {
						var fsm = fsmFactory.instanceWithOptions( { initialState: null } );
					} ).should.throw( /You must specify an initial state for this FSM/ );
				} );
				it( "should throw if the initial state specified doesn't exist", function() {
					( function() {
						var fsm = fsmFactory.instanceWithOptions( { initialState: "howdy" } );
					} ).should.throw( /The initial state specified does not exist in the states object/ );
				} );
				it( "should invoke a custom initialize method", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						initialize: function() {
							this.initializeHasExecuted = true;
						}
					} );
					fsm.initializeHasExecuted.should.be.true;
				} );
			} );
			describe( "When acting on itself as the client", function() {
				it( "should throw if handle is passed an undefined input value", function() {
					var fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle();
					} ).should.throw( /input argument passed/ );
				} );
				it( "should handle input without arguments", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "start" );
					events[ 0 ].should.eql( {
						eventName: "handling",
						data: {
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace
						}
					} );
					events[ 3 ].should.eql( {
						eventName: "handled",
						data: {
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace
						}
					} );
					fsm.state.should.equal( "ready" );
					fsm.compositeState().should.equal( "ready" );
				} );
				it( "should handle input with arguments", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					var res;
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "start" );
					res = fsm.handle( "canWeDoThis", "Grace Hopper" );
					res.should.equal( "yep, Grace Hopper can do it." );
					fsm.state.should.equal( "ready" );
					fsm.compositeState().should.equal( "ready" );
				} );
				it( "should handle an object form inputType", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( { inputType: "start", delegated: true, ticket: "8675309" } );
					events[ 0 ].should.eql( {
						eventName: "handling",
						data: {
							inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace
						}
					} );
					events[ 3 ].should.eql( {
						eventName: "handled",
						data: { inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace }
					} );
					fsm.state.should.equal( "ready" );
					fsm.compositeState().should.equal( "ready" );
				} );
				it( "should transition properly", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "start" );
					events[ 1 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							namespace: fsm.namespace
						}
					} );
					events[ 2 ].should.eql( { eventName: "ready-OnEnterFiring", data: undefined } );
				} );
				it( "should emit an 'invalidstate' event when attempting to transition into a non-existent state", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "invalidstate", function( data ) {
						events.push( { eventName: "invalidstate", data: data } );
					} );
					fsm.transition( "gotoIsntHarmful" );
					events[ 0 ].should.eql( {
						eventName: "invalidstate",
						data: {
							state: "uninitialized",
							attemptedState: "gotoIsntHarmful",
							namespace: fsm.namespace
						}
					} );
				} );
				it( "should handle deferred-until-transition input properly", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "letsDoThis" );
					fsm.handle( "start" );
					events.should.eql( [
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined
										}
									],
									type: "transition",
									untilState: "ready"
								},
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								namespace: fsm.namespace
							}
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "WeAreDoingThis",
							data: {
								someprop: "someval"
							}
						},
						{
							eventName: "ready-OnExitFiring",
							data: undefined
						},
						{
							eventName: "transition",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						} ] );
				} );
				it( "should handle deferred-until-transition input properly (with NO target state)", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								letsDoThis: function( client ) {
									this.deferUntilTransition( client );
								}
							},
							done: {
								letsDoThis: function() {
									this.emit( "weAlreadyDidThat" );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "letsDoThis" );
					fsm.transition( "done" );
					events.should.eql( [
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									type: "transition",
									untilState: undefined,
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined
										}
									]
								},
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "",
								toState: "done",
								namespace: fsm.namespace
							}
						},
						{
							eventName: "done-OnEnterFiring",
							data: undefined
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "weAlreadyDidThat",
							data: undefined
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						}
					] );
				} );
				it( "should handle deferAndTransition properly", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								letsDoThis: function() {
									this.deferAndTransition( "ready" );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "letsDoThis" );
					fsm.handle( "start" );
					events.should.eql( [
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									type: "transition",
									untilState: "ready",
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined
										}
									]
								},
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.letsDoThis",
								toState: "ready",
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "WeAreDoingThis",
							data: {
								someprop: "someval"
							}
						},
						{
							eventName: "ready-OnExitFiring",
							data: undefined
						},
						{
							eventName: "transition",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "nohandler",
							data: {
								args: [
									fsm,
									{
										inputType: "start",
										delegated: false,
										ticket: undefined
									}
								],
								inputType: "start",
								delegated: false,
								namespace: "specialSauceNamespace",
								ticket: undefined
							}
						}
					] );
				} );
				it( "should clear queued input when calling clearQueue", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								anotherInputHandler: function() {
									this.clearQueue();
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "letsDoThis" );
					fsm.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: "ready",
							args: [
								{
									inputType: "letsDoThis",
									delegated: false,
									ticket: undefined
								}
							]
						}
					] );
					fsm.handle( "anotherInputHandler" );
					fsm.handle( "start" );
					events.should.eql( [
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									type: "transition",
									untilState: "ready",
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined
										}
									]
								},
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "transition",
							data:
							{
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								namespace: fsm.namespace
							}
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined
						},
						{
							eventName: "handled",
							data: {
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						}
					] );
					fsm.inputQueue.should.eql( [] );
				} );
				it( "should clear relevant queued input when calling clearQueue & passing the target state", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								deferMeUntilDone: function() {
									this.deferUntilTransition( "done" );
								},
								deferMeUntilNotQuiteDone: function() {
									this.deferUntilTransition( "notQuiteDone" );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "deferMeUntilDone" );
					fsm.handle( "deferMeUntilNotQuiteDone" );
					fsm.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: "done",
							args: [
								{
									inputType: "deferMeUntilDone",
									delegated: false,
									ticket: undefined
								}
							]
						},
						{
							type: "transition",
							untilState: "notQuiteDone",
							args: [
								{
									inputType: "deferMeUntilNotQuiteDone",
									delegated: false,
									ticket: undefined
								}
							]
						}
					] );
					fsm.clearQueue( "done" );
					fsm.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: "notQuiteDone",
							args: [
								{
									inputType: "deferMeUntilNotQuiteDone",
									delegated: false,
									ticket: undefined
								}
							]
						}
					] );
				} );
				it( "should emit a nohandler event if an invalid input name is used", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "nope" );
					events[ 0 ].eventName.should.equal( "nohandler" );
				} );
			} );
			describe( "When emitting events", function() {
				it( "should allow wildcard subscribers", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					fsm.handle( "start" );
					events.map( function( evnt ) {
						return evnt.eventName;
					} ).should.eql( [ "handling", "transition", "ready-OnEnterFiring", "handled" ] );
				} );
				it( "should allow specific events to be subscribed to", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var eventsA = [];
					var eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data: data } );
					} );
					fsm.on( "transition", function( data ) {
						eventsB.push( { eventName: "transition", data: data } );
					} );
					fsm.handle( "start" );
					eventsA.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined } ] );
					eventsB.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								namespace: fsm.namespace
							}
						}
					] );
				} );
				it( "should clear all subscribers when off() is called without arguments", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var eventsA = [];
					var eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( evnt, data ) {
						eventsA.push( { eventName: evnt, data: data } );
					} );
					fsm.on( "transition", function( evnt, data ) {
						eventsB.push( { eventName: evnt, data: data } );
					} );
					fsm.off();
					fsm.handle( "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [] );
				} );
				it( "should clear the correct subscriber when off() is called with event name & callback", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var eventsA = [];
					var eventsB = [];
					var callback = function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data: data } );
					};
					fsm.on( "ready-OnEnterFiring", callback );
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsB.push( { eventName: "ready-OnEnterFiring", data: data } );
					} );
					fsm.off( "ready-OnEnterFiring", callback );
					fsm.handle( "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined } ] );
				} );
				it( "should clear the correct subscriber when using the on() return value", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var eventsA = [];
					var eventsB = [];
					var sub = fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data: data } );
					} );
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsB.push( { eventName: "ready-OnEnterFiring", data: data } );
					} );
					sub.off();
					fsm.handle( "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined } ] );
				} );
				it( "should only log an exception if subscriber throws and useSafeEmit is set to true", function() {
					var fsm = fsmFactory.instanceWithOptions( { useSafeEmit: true } );
					var log = console.log;
					var res;
					console.log = function( msg ) {
						res = msg;
					};
					fsm.on( "ready-OnEnterFiring", function( evnt, data ) {
						throw new Error( "OH SNAP!" );
					} );
					fsm.handle( "start" );
					res.should.match( /Error: OH SNAP!/ );
					console.log = log;
				} );
				it( "should throw an exception if subscriber throws and useSafeEmit is set to false", function() {
					var fsm = fsmFactory.instanceWithOptions( { useSafeEmit: false } );
					fsm.on( "ready-OnEnterFiring", function( evnt, data ) {
						throw new Error( "OH SNAP!" );
					} );
					( function() {
						fsm.handle( "start" );
					} ).should.throw( /OH SNAP!/ );
				} );
			} );
			describe( "When creating two instances from the same extended constructor function", function() {
				it( "should not share instance state", function() {
					var eventA = [];
					var eventB = [];
					var fsmA = fsmFactory.instanceWithOptions();
					var fsmB = fsmFactory.instanceWithOptions( { initialState: "done" } );
					fsmA.on( "*", function( eventName, data ) {
						eventA.push( { eventName: eventName, data: data } );
					} );
					fsmB.on( "*", function( eventName, data ) {
						eventB.push( { eventName: eventName, data: data } );
					} );

					fsmA.initialState.should.equal( "uninitialized" );
					fsmA.state.should.equal( "uninitialized" );
					fsmA.compositeState().should.equal( "uninitialized" );
					fsmB.initialState.should.equal( "done" );
					fsmB.state.should.equal( "done" );
					fsmB.compositeState().should.equal( "done" );

					// Acting on fsmA should not affect fsmB
					fsmA.handle( "start" );
					eventA.length.should.equal( 4 );
					eventB.length.should.equal( 0 );

					fsmB.handle( "letsDoThis" );
					fsmB.handle( "start" );
					eventA.length.should.equal( 4 );
					eventB.length.should.equal( 2 );
				} );
			} );
			if ( fsmFactory.extendingWithStaticProps ) {
				describe( "When adding static props", function() {
					it( "should inherit static (constructor-level) members", function() {
						var ctor = fsmFactory.extendingWithStaticProps();
						ctor.should.have.property( "someStaticMethod" );
					} );
				} );
			}
		} );
	} );
}

_.each( global.specFactory.machinaFsm, function( val, key ) {
	runMachinaFsmSpec( key, val );
} );
