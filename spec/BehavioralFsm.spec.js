const _ = require( "lodash" );
const machina = require( "../lib/machina.js" );
const specFactory = require( "./helpers/fsmFactory.js" )( machina );
/*
    This is a spec factory that takes a description and
    an object containing factory methods necessary to get
    the proper instances. These tests are run on Behavioral
    FSMs with varying levels of inheritance.
*/
function runBehavioralFsmSpec( description, fsmFactory ) {
	describe( "BehavioralFsm", function() {
		let fsm;
		describe( description, function() {
			describe( "and assuming defaults", function() {
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
					fsm.states.should.eql( { uninitialized: {}, } );
				} );
			} );
			describe( "and passing in options", function() {
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
						fsm = fsmFactory.instanceWithOptions( { initialState: null, } );
						const client = { name: "Dijkstra", };
						fsm.handle( client, "start" );
					} ).should.throw( /You must specify an initial state for this FSM/ );
				} );
				it( "should throw if the initial state specified doesn't exist", function() {
					( function() {
						fsm = fsmFactory.instanceWithOptions( { initialState: "howdy", } );
						const client = { name: "Dijkstra", };
						fsm.handle( client, "start" );
					} ).should.throw( /The initial state specified does not exist in the states object/ );
				} );
				it( "should invoke a custom initialize method", function() {
					fsm = fsmFactory.instanceWithOptions( {
						initialize() {
							this.initializeHasExecuted = true;
						},
					} );
					fsm.initializeHasExecuted.should.be.true();
				} );
			} );
			describe( "When acting on a client", function() {
				it( "should transition a new client to the initial state", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					events[ 0 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: undefined,
							action: "",
							toState: "uninitialized",
							client,
							namespace: fsm.namespace,
						},
					} );
				} );
				it( "should throw if handle is passed an undefined input value", function() {
					fsm = fsmFactory.instanceWithOptions();
					const client = { name: "Dijkstra", };
					( function() {
						fsm.handle( client );
					} ).should.throw( /input argument passed/ );
				} );
				it( "should handle input without arguments", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					events[ 2 ].should.eql( {
						eventName: "handling",
						data: {
							client,
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace,
						},
					} );
					events[ 6 ].should.eql( {
						eventName: "handled",
						data: {
							client,
							inputType: "start",
							delegated: false,
							ticket: undefined,
							namespace: fsm.namespace,
						},
					} );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle input with arguments", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					const res = fsm.handle( client, "canWeDoThis", "Grace Hopper" );
					res.should.equal( "yep, Grace Hopper can do it." );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle an object form inputType", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, { inputType: "start", delegated: true, ticket: "8675309", } );
					events[ 2 ].should.eql( {
						eventName: "handling",
						data: {
							client,
							inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace,
						},
					} );
					events[ 6 ].should.eql( {
						eventName: "handled",
						data: {
							client,
							inputType: "start",
							delegated: true,
							ticket: "8675309",
							namespace: fsm.namespace,
						},
					} );
					client.__machina__[ fsm.namespace ].state.should.equal( "ready" );
					fsm.compositeState( client ).should.equal( "ready" );
				} );
				it( "should handle object form inputType on catch-all handlers", function() {
					let passedClient, passedInputType;
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								"*"( client, inputType ) {
									passedClient = client;
									passedInputType = inputType;
								},
							},
						},
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, { inputType: "anything", delegated: false, } );
					passedClient.should.equal( client );
					passedInputType.should.equal( "anything" );
				} );
				it( "should handle string form inputType on catch-all handlers", function() {
					let passedClient, passedInputType;
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								"*"( client, inputType ) {
									passedClient = client;
									passedInputType = inputType;
								},
							},
						},
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "anything" );
					passedClient.should.equal( client );
					passedInputType.should.equal( "anything" );
				} );
				it( "should transition properly", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					events[ 3 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							client,
							namespace: fsm.namespace,
						},
					} );
					events[ 4 ].should.eql( { eventName: "ready-OnEnterFiring", data: undefined, } );
					events[ 5 ].should.eql( {
						eventName: "transitioned",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							client,
							namespace: fsm.namespace,
						},
					} );
				} );
				it( "should emit an 'invalidstate' event when attempting to transition into a non-existent state", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "invalidstate", function( data ) {
						events.push( { eventName: "invalidstate", data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.transition( client, "gotoIsntHarmful" );
					events[ 0 ].should.eql( {
						eventName: "invalidstate",
						data: {
							state: "uninitialized",
							attemptedState: "gotoIsntHarmful",
							client,
							namespace: fsm.namespace,
						},
					} );
				} );
				it( "should handle deferred-until-transition input properly (with a target state)", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "letsDoThis" );
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
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
											ticket: undefined,
										},
									],
									type: "transition",
									untilState: [ "ready", ],
								},
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined,
						},
						{
							data: {
								action: "uninitialized.start",
								client,
								fromState: "uninitialized",
								namespace: "specialSauceNamespace",
								toState: "ready",
							},
							eventName: "transitioned",
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "WeAreDoingThis",
							data: {
								someprop: "someval",
							},
						},
						{
							eventName: "ready-OnExitFiring",
							data: undefined,
						},
						{
							eventName: "transition",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						}, ] );
				} );
				it( "should handle deferred-until-transition input properly (with multiple target states)", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								letsDoThis( client ) {
									this.deferUntilTransition( client, [ "done", "notQuiteDone", ] );
								},
							},
							notQuiteDone: {
								letsDoThis() {
									this.emit( "weAlreadyDidThat" );
								},
							},
							done: {
								letsDoThis() {
									this.emit( "weAlreadyDidThat" );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "letsDoThis" );
					fsm.transition( client, "done" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									type: "transition",
									untilState: [ "done", "notQuiteDone", ],
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined,
										},
									],
								},
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "",
								toState: "done",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "done-OnEnterFiring",
							data: undefined,
						},
						{
							data: {
								action: "",
								client,
								fromState: "uninitialized",
								namespace: "specialSauceNamespace",
								toState: "done",
							},
							eventName: "transitioned",
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "weAlreadyDidThat",
							data: undefined,
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
					] );
				} );
				it( "should handle deferred-until-transition input properly (with NO target state)", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								letsDoThis( client ) {
									this.deferUntilTransition( client );
								},
							},
							done: {
								letsDoThis() {
									this.emit( "weAlreadyDidThat" );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "letsDoThis" );
					fsm.transition( client, "done" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
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
											ticket: undefined,
										},
									],
								},
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "",
								toState: "done",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "done-OnEnterFiring",
							data: undefined,
						},
						{
							data: {
								action: "",
								client,
								fromState: "uninitialized",
								namespace: "specialSauceNamespace",
								toState: "done",
							},
							eventName: "transitioned",
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "weAlreadyDidThat",
							data: undefined,
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
					] );
				} );
				it( "should handle deferAndTransition properly", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								letsDoThis( client ) {
									this.deferAndTransition( client, "ready" );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "letsDoThis" );
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "transitioned",
							data: {
								action: "",
								fromState: undefined,
								toState: "uninitialized",
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "deferred",
							data: {
								state: "uninitialized",
								queuedArgs: {
									type: "transition",
									untilState: [ "ready", ],
									args: [
										{
											inputType: "letsDoThis",
											delegated: false,
											ticket: undefined,
										},
									],
								},
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.letsDoThis",
								toState: "ready",
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined,
						},
						{
							data: {
								action: "uninitialized.letsDoThis",
								client,
								fromState: "uninitialized",
								namespace: "specialSauceNamespace",
								toState: "ready",
							},
							eventName: "transitioned",
						},
						{
							eventName: "handling",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "WeAreDoingThis",
							data: {
								someprop: "someval",
							},
						},
						{
							eventName: "ready-OnExitFiring",
							data: undefined,
						},
						{
							eventName: "transition",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "transitioned",
							data: {
								fromState: "ready",
								action: "ready.letsDoThis",
								toState: "notQuiteDone",
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "handled",
							data: {
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								client,
								namespace: "specialSauceNamespace",
							},
						},
						{
							eventName: "nohandler",
							data: {
								args: [
									client,
									{
										inputType: "start",
										delegated: false,
										ticket: undefined,
									},
								],
								inputType: "start",
								delegated: false,
								client,
								namespace: "specialSauceNamespace",
								ticket: undefined,
							},
						},
					] );
				} );
				it( "should clear queued input when calling clearQueue", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								anotherInputHandler( client ) {
									this.clearQueue( client );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "letsDoThis" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "ready", ],
							args: [
								{
									inputType: "letsDoThis",
									delegated: false,
									ticket: undefined,
								},
							],
						},
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
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
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
											ticket: undefined,
										},
									],
									type: "transition",
									untilState: [ "ready", ],
								},
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "letsDoThis",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "anotherInputHandler",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								client,
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "ready-OnEnterFiring",
							data: undefined,
						},
						{
							eventName: "transitioned",
							data: {
								action: "uninitialized.start",
								client,
								fromState: "uninitialized",
								namespace: "specialSauceNamespace",
								toState: "ready",
							},
						},
						{
							eventName: "handled",
							data: {
								client,
								inputType: "start",
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						}, ] );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [] );
				} );
				it( "should clear relevant queued input when calling clearQueue & passing the target state", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								deferMeUntilDone( client ) {
									this.deferUntilTransition( client, "done" );
								},
								deferMeUntilNotQuiteDone( client ) {
									this.deferUntilTransition( client, [ "notQuiteDone", "done", ] );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "deferMeUntilDone" );
					fsm.handle( client, "deferMeUntilNotQuiteDone" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "done", ],
							args: [
								{
									inputType: "deferMeUntilDone",
									delegated: false,
									ticket: undefined,
								},
							],
						},
						{
							type: "transition",
							untilState: [ "notQuiteDone", "done", ],
							args: [
								{
									inputType: "deferMeUntilNotQuiteDone",
									delegated: false,
									ticket: undefined,
								},
							],
						},
					] );
					fsm.clearQueue( client, "done" );
					client.__machina__[ fsm.namespace ].inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "notQuiteDone", ],
							args: [
								{
									inputType: "deferMeUntilNotQuiteDone",
									delegated: false,
									ticket: undefined,
								},
							],
						},
					] );
				} );
				it( "should throw an exception if a string is used as a client", function() {
					fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( "nope", "start" );
					} ).should.throw();
				} );
				it( "should throw an exception if a bool is used as a client", function() {
					fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( true, "start" );
					} ).should.throw();
				} );
				it( "should throw an exception if a number is used as a client", function() {
					fsm = fsmFactory.instanceWithOptions();
					( function() {
						fsm.handle( 42, "start" );
					} ).should.throw();
				} );
				it( "should emit a nohandler event if an invalid input name is used", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "nope" );
					events[ 2 ].eventName.should.equal( "nohandler" );
				} );
			} );
			describe( "When emitting events", function() {
				it( "should allow wildcard subscribers", function() {
					fsm = fsmFactory.instanceWithOptions();
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					events.map( function( evnt ) {
						return evnt.eventName;
					} ).should.eql( [ "transition", "transitioned", "handling", "transition", "ready-OnEnterFiring", "transitioned", "handled", ] );
				} );
				it( "should allow specific events to be subscribed to", function() {
					fsm = fsmFactory.instanceWithOptions();
					const eventsA = [];
					const eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data, } );
					} );
					fsm.on( "transition", function( data ) {
						eventsB.push( { eventName: "transition", data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					eventsA.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined, }, ] );
					eventsB.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transition",
							data: {
								fromState: "uninitialized",
								action: "uninitialized.start",
								toState: "ready",
								client,
								namespace: fsm.namespace,
							},
						},
					] );
				} );
				it( "should clear all subscribers when off() is called without arguments", function() {
					fsm = fsmFactory.instanceWithOptions();
					const eventsA = [];
					const eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( evnt, data ) {
						eventsA.push( { eventName: evnt, data, } );
					} );
					fsm.on( "transition", function( evnt, data ) {
						eventsB.push( { eventName: evnt, data, } );
					} );
					fsm.off();
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [] );
				} );
				it( "should clear all subscribers for an event when off() is called with just event name", function() {
					fsm = fsmFactory.instanceWithOptions();
					const eventsA = [];
					const eventsB = [];
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data, } );
					} );
					fsm.on( "transition", function( data ) {
						eventsB.push( { eventName: "transition", data, } );
					} );
					fsm.off( "transition" );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					eventsA.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined, }, ] );
					eventsB.should.eql( [] );
				} );
				it( "should clear the correct subscriber when off() is called with event name & callback", function() {
					fsm = fsmFactory.instanceWithOptions();
					const eventsA = [];
					const eventsB = [];
					const callback = function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data, } );
					};
					fsm.on( "ready-OnEnterFiring", callback );
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsB.push( { eventName: "ready-OnEnterFiring", data, } );
					} );
					fsm.off( "ready-OnEnterFiring", callback );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined, }, ] );
				} );
				it( "should clear the correct subscriber when using the on() return value", function() {
					fsm = fsmFactory.instanceWithOptions();
					const eventsA = [];
					const eventsB = [];
					const sub = fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsA.push( { eventName: "ready-OnEnterFiring", data, } );
					} );
					fsm.on( "ready-OnEnterFiring", function( data ) {
						eventsB.push( { eventName: "ready-OnEnterFiring", data, } );
					} );
					sub.off();
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					eventsA.should.eql( [] );
					eventsB.should.eql( [ { eventName: "ready-OnEnterFiring", data: undefined, }, ] );
				} );
				it( "should only log an exception if subscriber throws and useSafeEmit is set to true", function() {
					fsm = fsmFactory.instanceWithOptions( { useSafeEmit: true, } );
					const log = console.log;
					let res;
					console.log = function( msg ) {
						res = msg;
					};
					fsm.on( "ready-OnEnterFiring", function() {
						throw new Error( "OH SNAP!" );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					res.should.match( /Error: OH SNAP!/ );
					console.log = log;
				} );
				it( "should throw an exception if subscriber throws and useSafeEmit is set to false", function() {
					fsm = fsmFactory.instanceWithOptions( { useSafeEmit: false, } );
					fsm.on( "ready-OnEnterFiring", function() {
						throw new Error( "OH SNAP!" );
					} );
					const client = { name: "Dijkstra", };
					( function() {
						fsm.handle( client, "start" );
					} ).should.throw( /OH SNAP!/ );
				} );
				it( "should enforce payload structure (for BehavioralFsm instances", function() {
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								start( client ) {
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
									const payload = this.buildEventPayload( client, `oh, hai there ${ client.name }` );
									this.emit( "customEvent", payload );
								},
							},
						},
					} );
					const events = [];
					fsm.on( "*", function( evnt, data ) {
						events.push( { eventName: evnt, data, } );
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					events.should.eql( [
						{
							eventName: "transition",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "transitioned",
							data: {
								fromState: undefined,
								action: "",
								toState: "uninitialized",
								client,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handling",
							data: {
								inputType: "start",
								client,
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "customEvent",
							data: {
								client,
								data: "oh, hai there Dijkstra",
								namespace: fsm.namespace,
							},
						},
						{
							eventName: "handled",
							data: {
								inputType: "start",
								client,
								delegated: false,
								ticket: undefined,
								namespace: fsm.namespace,
							},
						},
					] );
				} );
			} );
			describe( "When creating two instances from the same extended constructor function", function() {
				it( "should not share instance configuration state", function() {
					const eventA = [];
					const eventB = [];
					const fsmA = fsmFactory.instanceWithOptions();
					const fsmB = fsmFactory.instanceWithOptions( { initialState: "done", } );
					const clientA = { name: "Dijkstra", };
					const clientB = { name: "Joy", };
					fsmA.on( "*", function( eventName, data ) {
						eventA.push( { eventName, data, } );
					} );
					fsmB.on( "*", function( eventName, data ) {
						eventB.push( { eventName, data, } );
					} );

					fsmA.initialState.should.equal( "uninitialized" );
					fsmB.initialState.should.equal( "done" );

					// Acting on fsmA should not affect fsmB
					fsmA.handle( clientA, "start" );
					eventA[ 3 ].should.eql( {
						eventName: "transition",
						data: {
							fromState: "uninitialized",
							action: "uninitialized.start",
							toState: "ready",
							client: clientA,
							namespace: fsmA.namespace,
						},
					} );
					eventA[ 4 ].should.eql( { eventName: "ready-OnEnterFiring", data: undefined, } );
					eventB.length.should.equal( 0 );

					fsmB.handle( clientB, "letsDoThis" );
					fsmB.handle( clientB, "start" );
					eventA.length.should.equal( 7 );
					eventB.length.should.equal( 5 );
				} );
			} );
			describe( "When passing arguments to transition", function() {
				it( "should pass the arguments to the _onEnter handler", function() {
					let custom;
					fsm = fsmFactory.instanceWithOptions( {
						states: {
							uninitialized: {
								start( client ) {
									this.transition( client, "ready", "Custom args!" );
								},
							},
							ready: {
								_onEnter( client, customArgs ) {
									custom = customArgs;
								},
							},
						},
					} );
					const client = { name: "Dijkstra", };
					fsm.handle( client, "start" );
					custom.should.equal( "Custom args!" );
				} );
			} );
			if ( fsmFactory.extendingWithStaticProps ) {
				describe( "When adding static props", function() {
					it( "should inherit static (constructor-level) members", function() {
						const ctor = fsmFactory.extendingWithStaticProps();
						ctor.should.have.property( "someStaticMethod" );
					} );
				} );
			}
		} );
	} );
}

_.each( specFactory.behavioral, function( val, key ) {
	runBehavioralFsmSpec( key, val );
} );
