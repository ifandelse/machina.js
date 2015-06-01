/* global _ */

/*
    This is a spec factory that takes a description and
    an object containing factory methods necessary to get
    the proper instances. These tests are run on Behavioral
    FSMs with varying levels of inheritance.
*/
function runBehavioralFsmSpec( description, fsmFactory ) {
	describe( "BehavioralFsm", function() {
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
				it( "should set the expected states and input handlers", function() {
					fsm.states.should.eql( fsmFactory.options.states );
				} );
				it( "should throw if the initialState prop isn't set", function() {
					( function() {
						var fsm = fsmFactory.instanceWithOptions( { initialState: null } );
						var client = { name: "Dijkstra" };
						fsm.handle( client, "start" );
					} ).should.throw( /You must specify an initial state for this FSM/ );
				} );
				it( "should throw if the initial state specified doesn't exist", function() {
					( function() {
						var fsm = fsmFactory.instanceWithOptions( { initialState: "howdy" } );
						var client = { name: "Dijkstra" };
						fsm.handle( client, "start" );
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
			describe( "When acting on a client", function() {
				it( "should transition a new client to the initial state", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					events[ 0 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: undefined,
							action: "",
							toState: "uninitialized",
							client: client,
							namespace: fsm.namespace
						}
					} );
				} );
				it( "should throw if handle is passed an undefined input value", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var client = { name: "Dijkstra" };
					( function() {
						fsm.handle( client );
					} ).should.throw( /input argument passed/ );
				} );
				it( "should handle input without arguments", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					events[ 1 ].should.eql( {
						eventName: "handling",
						data: {
							client: client,
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace
						}
					} );
					events[ 4 ].should.eql( {
						eventName: "handled",
						data: {
							client: client,
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace
						}
					} );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle input with arguments", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					var res;
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					res = fsm.handle( client, "canWeDoThis", "Grace Hopper" );
					res.should.equal( "yep, Grace Hopper can do it." );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle an object form inputType", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, { inputType: "start", delegated: true, ticket: "8675309" } );
					events[ 1 ].should.eql( {
						eventName: "handling",
						data: {
							client: client,
							inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace
						}
					} );
					events[ 4 ].should.eql( {
						eventName: "handled",
						data: {
							client: client,
							inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace
						}
					} );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle object form inputType on catch-all handlers", function() {
					var passedClient, passedInputType;
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								"*": function( client, inputType ) {
									passedClient = client;
									passedInputType = inputType;
								}
							}
						}
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, { inputType: "anything", delegated: false } );
					passedClient.should.equal( client );
					passedInputType.should.equal( "anything" );
				} );
				it( "should handle string form inputType on catch-all handlers", function() {
					var passedClient, passedInputType;
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								"*": function( client, inputType ) {
									passedClient = client;
									passedInputType = inputType;
								}
							}
						}
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "anything" );
					passedClient.should.equal( client );
					passedInputType.should.equal( "anything" );
				} );
				it( "should transition properly", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					events[ 2 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							client: client,
							namespace: fsm.namespace
						}
					} );
					events[ 3 ].should.eql( { eventName: "ready-OnEnterFiring", data: undefined } );
				} );
				it( "should emit an 'invalidstate' event when attempting to transition into a non-existent state", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "invalidstate", function( data ) {
						events.push( { eventName: "invalidstate", data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.transition( client, "gotoIsntHarmful" );
					events[ 0 ].should.eql( {
						eventName: "invalidstate",
						data: {
							state: "uninitialized",
							attemptedState: "gotoIsntHarmful",
							client: client,
							namespace: fsm.namespace
						}
					} );
				} );
				it( "should handle deferred-until-transition input properly (with a target state)", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "letsDoThis" );
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
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
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
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
								client: client,
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
								client: client,
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
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "letsDoThis" );
					fsm.transition( client, "done" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
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
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
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
								client: client,
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
								client: client,
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
								client: client,
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
								letsDoThis: function( client ) {
									this.deferAndTransition( client, "ready" );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "letsDoThis" );
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client: client,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client: client,
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
								client: client,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.letsDoThis",
								toState: "ready",
								client: client,
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
								client: client,
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
								client: client,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client: client,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client: client,
								namespace: "specialSauceNamespace"
							}
						},
						{
							eventName: "nohandler",
							data: {
								args: [
									client,
									{
										inputType: "start",
										delegated: false,
										ticket: undefined
									}
								],
								inputType: "start",
								delegated: false,
								client: client,
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
								anotherInputHandler: function( client ) {
									this.clearQueue( client );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "letsDoThis" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
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
					fsm.handle( client, "anotherInputHandler" );
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
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
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								client: client,
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								client: client,
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
								client: client,
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
								client: client,
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						} ] );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [] );
				} );
				it( "should clear relevant queued input when calling clearQueue & passing the target state", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								deferMeUntilDone: function( client ) {
									this.deferUntilTransition( client, "done" );
								},
								deferMeUntilNotQuiteDone: function( client ) {
									this.deferUntilTransition( client, "notQuiteDone" );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "deferMeUntilDone" );
					fsm.handle( client, "deferMeUntilNotQuiteDone" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
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
					fsm.clearQueue( client, "done" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
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
				it( "should throw an exception if a string is used as a client", function() {
					var fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( "nope", "start" );
					} ).should.throw();
				} );
				it( "should throw an exception if a bool is used as a client", function() {
					var fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( true, "start" );
					} ).should.throw();
				} );
				it( "should throw an exception if a number is used as a client", function() {
					var fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( 42, "start" );
					} ).should.throw();
				} );
				it( "should emit a nohandler event if an invalid input name is used", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "nope" );
					events[ 1 ].eventName.should.equal( "nohandler" );
				} );
			} );
			describe( "When emitting events", function() {
				it( "should allow wildcard subscribers", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					events.map( function( evnt ) {
						return evnt.eventName;
					} ).should.eql( [ "transition", "handling", "transition", "ready-OnEnterFiring", "handled" ] );
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					eventsA.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined } ] );
					eventsB.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								client: client,
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [] );
				} );
				it( "should clear all subscribers for an event when off() is called with just event name", function() {
					var fsm = fsmFactory.instanceWithOptions();
					var eventsA = [];
					var eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data: data } );
					} );
					fsm.on( "transition", function( data ) {
						eventsB.push( { eventName: "transition", data: data } );
					} );
					fsm.off( "transition" );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					eventsA.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined } ] );
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
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
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					res.should.match( /Error: OH SNAP!/ );
					console.log = log;
				} );
				it( "should throw an exception if subscriber throws and useSafeEmit is set to false", function() {
					var fsm = fsmFactory.instanceWithOptions( { useSafeEmit: false } );
					fsm.on( "ready-OnEnterFiring", function( evnt, data ) {
						throw new Error( "OH SNAP!" );
					} );
					var client = { name: "Dijkstra" };
					( function() {
						fsm.handle( client, "start" );
					} ).should.throw( /OH SNAP!/ );
				} );
				it( "should enforce payload structure (for BehavioralFsm instances", function() {
					var fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								start: function( client ) {
									/*  emitting the string (second arg) will result
									    in an object payload like
									    {
									        data: {
									            client: client,
									            data: "oh, hai there Dijkstra"
									        }
									    }
									    Not crazy about the data.data part, however, the point is
									    to encourage structured payloads to begin with (so, objects)
									    This is just the fallback if that isn't done.
									*/
									var payload = this.buildEventPayload( client, "oh, hai there " + client.name );
									this.emit( "customEvent", payload );
								}
							}
						}
					} );
					var events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data: data } );
					} );
					var client = { name: "Dijkstra" };
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client: client,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handling",
							data: {
								inputType: "start",
								client: client,
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						},
						{
							eventName: "customEvent",
							data: {
								client: client,
								data: "oh, hai there Dijkstra",
								namespace: fsm.namespace
							}
						},
						{
							eventName: "handled",
							data: {
								inputType: "start",
								client: client,
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace
							}
						}
					] );
				} );
			} );
			describe( "When creating two instances from the same extended constructor function", function() {
				it( "should not share instance configuration state", function() {
					var eventA = [];
					var eventB = [];
					var fsmA = fsmFactory.instanceWithOptions();
					var fsmB = fsmFactory.instanceWithOptions( { initialState: "done" } );
					var clientA = { name: "Dijkstra" };
					var clientB = { name: "Joy" };
					fsmA.on( "*", function( eventName, data ) {
						eventA.push( { eventName: eventName, data: data } );
					} );
					fsmB.on( "*", function( eventName, data ) {
						eventB.push( { eventName: eventName, data: data } );
					} );

					fsmA.initialState.should.equal( "uninitialized" );
					fsmB.initialState.should.equal( "done" );

					// Acting on fsmA should not affect fsmB
					fsmA.handle( clientA, "start" );
					eventA[ 2 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							client: clientA,
							namespace: fsmA.namespace
						}
					} );
					eventA[ 3 ].should.eql( { eventName: "ready-OnEnterFiring", data: undefined } );
					eventB.length.should.equal( 0 );

					fsmB.handle( clientB, "letsDoThis" );
					fsmB.handle( clientB, "start" );
					eventA.length.should.equal( 5 );
					eventB.length.should.equal( 4 );
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

_.each( global.specFactory.behavioral, function( val, key ) {
	runBehavioralFsmSpec( key, val );
} );
