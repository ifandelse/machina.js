const { sinon, } = global;

describe( "BehavioralFsm", () => {
	let	instance,
		emitter,
		emitterInstance,
		childInstanceStub,
		utils,
		mockInstance,
		clientMeta,
		result;

	beforeEach( () => {
		childInstanceStub = {
			instance: { namespace: "child.fsm", },
		};
		utils = {
			getDefaultBehavioralOptions: sinon.stub().returns( { defaultBehavioralOptions: true, } ),
			getChildFsmInstance: sinon.stub().returns( childInstanceStub ),
			listenToChild: sinon.stub().returns( "LISTENING" ),
			getDefaultClientMeta: sinon.stub().returns( { defaultMeta: true, } ),
			createUUID: sinon.stub().returns( "UUID" ),
			extend: sinon.stub().returns( "EXTEND_FUNCTION" ),
		};

		emitterInstance = {
			emit: sinon.stub(),
		};

		emitter = {
			getInstance: sinon.stub().returns( emitterInstance ),
			instance: emitterInstance,
		};

		instance = global.proxyquire( "../src/BehavioralFsm", {
			"./utils": { utils, },
			"./emitter": emitter,
		} );
	} );

	describe( "when creating an instance", () => {
		let newInstance;

		beforeEach( () => {
			emitterInstance.emit = sinon.stub();
			instance.BehavioralFsm.prototype.initialize = sinon.stub();
			newInstance = new instance.BehavioralFsm( { optionsObject: true, }, "arg1", "arg2" );
		} );

		it( "should extend options over the instance", () => {
			newInstance.should.containSubset( { optionsObject: true, } );
		} );

		it( "should set default values", () => {
			newInstance.should.containSubset( { defaultBehavioralOptions: true, } );
		} );

		it( "should call initialize", () => {
			instance.BehavioralFsm.prototype.initialize.should.be.calledOnceWithExactly(
				{ optionsObject: true, },
				"arg1",
				"arg2"
			);
		} );

		it( "should emit a NEW_FSM event", () => {
			emitterInstance.emit.should.be.calledOnceWithExactly(
				"newfsm",
				newInstance
			);
		} );

		it( "should set the extend static prop", () => {
			instance.BehavioralFsm.extend.should.eql( utils.extend );
		} );
	} );

	describe( "initClient", () => {
		describe( "when initial state is not provided", () => {
			beforeEach( () => {
				mockInstance = {};
			} );

			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
				} ).should.throw( "You must specify an initial state for this FSM" );
			} );
		} );

		describe( "when an invalid initial state is provided", () => {
			beforeEach( () => {
				mockInstance = {
					initialState: "calzoom",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
				};
			} );

			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
				} ).should.throw( "The initial state specified does not exist in the states object." );
			} );
		} );

		describe( "when a valid initial state is provided", () => {
			beforeEach( () => {
				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
					transition: sinon.stub(),
				};
				instance.BehavioralFsm.prototype.initClient.call( mockInstance, "CLIENT" );
			} );

			it( "should call transition", () => {
				mockInstance.transition.should.be.calledOnceWithExactly( "CLIENT", "readyForCalzone" );
			} );
		} );
	} );

	describe( "configForState", () => {
		let listener;
		describe( "when it's not hierarchical", () => {
			beforeEach( () => {
				listener = sinon.stub();

				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {},
						awaitingMoreCalzone: {},
					},
					hierarchy: {
						readyForCalzone: { off: listener, },
						totallyNotFunction: "wat",
					},
				};
				result = instance.BehavioralFsm.prototype.configForState.call( mockInstance, "calzone" );
			} );

			it( "should call off on any existing child listeners", () => {
				listener.should.be.calledOnce();
			} );

			it( "should return undefined", () => {
				( result === undefined ).should.be.true();
			} );
		} );

		describe( "when it's hierarchical", () => {
			beforeEach( () => {
				listener = sinon.stub();

				mockInstance = {
					initialState: "readyForCalzone",
					states: {
						readyForCalzone: {},
						calzone: {
							_child: {},
						},
						awaitingMoreCalzone: {},
					},
					hierarchy: {
						readyForCalzone: { off: listener, },
						totallyNotFunction: "wat",
					},
				};
				result = instance.BehavioralFsm.prototype.configForState.call( mockInstance, "calzone" );
			} );

			it( "should call off on any existing child listeners", () => {
				listener.should.be.calledOnce();
			} );

			it( "should listen to the new child state", () => {
				utils.listenToChild.should.be.calledOnceWithExactly( mockInstance, childInstanceStub.instance );
			} );

			it( "should add the child namespace to the hierarchy property", () => {
				mockInstance.hierarchy[ "child.fsm" ].should.eql( "LISTENING" );
			} );

			it( "should return the child", () => {
				result.should.equal( childInstanceStub.instance );
			} );
		} );
	} );

	describe( "ensureClientMeta", () => {
		let clientArg;

		describe( "when the arg is not an object", () => {
			it( "should throw an error", () => {
				( function() {
					instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, "calzone" );
				} ).should.throw( "An FSM client must be an object." );
			} );
		} );

		describe( "when the namespace is not present", () => {
			beforeEach( () => {
				clientArg = {};
				mockInstance = {
					namespace: "name.space",
					initClient: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, clientArg );
			} );

			it( "should call initClient", () => {
				mockInstance.initClient.should.be.calledOnceWithExactly( clientArg );
			} );

			it( "should return the client meta", () => {
				result.should.eql( { defaultMeta: true, } );
			} );
		} );

		describe( "when the namespace is already present", () => {
			let alreadyInitdClient;

			beforeEach( () => {
				alreadyInitdClient = { alreadyInitd: true, };
				clientArg = {
					__machina__: {
						"name.space": alreadyInitdClient,
					},
				};
				mockInstance = {
					namespace: "name.space",
					initClient: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.ensureClientMeta.call( mockInstance, clientArg );
			} );

			it( "should not call initClient", () => {
				mockInstance.initClient.should.not.be.called();
			} );

			it( "should return the client meta", () => {
				result.should.eql( alreadyInitdClient );
			} );
		} );
	} );

	describe( "buildEventPayload", () => {
		describe( "when the data is a plain object", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, { stuff: "things", } );
			} );

			it( "should extend the client & namespace over the data and return it", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					stuff: "things",
				} );
			} );
		} );

		describe( "when the data is not a plain object", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, "delicious carbonara" );
			} );

			it( "should return an object with client, data, and namespace", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					data: "delicious carbonara",
				} );
			} );
		} );

		describe( "when the data is falsy", () => {
			beforeEach( () => {
				mockInstance = {
					namespace: "cal.zone",
				};
				result = instance.BehavioralFsm.prototype.buildEventPayload.call( mockInstance, { clientArg: true, }, undefined );
			} );

			it( "should return an object with client, data, and namespace", () => {
				result.should.eql( {
					namespace: "cal.zone",
					client: { clientArg: true, },
					data: null,
				} );
			} );
		} );
	} );

	describe( "getHandlerArgs", () => {
		describe( "when isCatchAll is true", () => {
			describe( "when the input is an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", { inputType: "calzone", }, "carbonara", ], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"calzone",
						"carbonara",
					] );
				} );
			} );

			describe( "when the input is not an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", "calzone", "carbonara", ], true );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"calzone",
						"carbonara",
					] );
				} );
			} );
		} );

		describe( "when isCatchAll is false", () => {
			describe( "when the input is an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", { inputType: "calzone", }, "carbonara", ], false );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"carbonara",
					] );
				} );
			} );

			describe( "when the input is not an object", () => {
				beforeEach( () => {
					result = instance.BehavioralFsm.prototype.getHandlerArgs.call( mockInstance, [ "CLIENT", "calzone", "carbonara", ], false );
				} );

				it( "should return the expected args", () => {
					result.should.eql( [
						"CLIENT",
						"carbonara",
					] );
				} );
			} );
		} );
	} );

	describe( "getSystemHandlerArgs", () => {
		it( "should return the given client and args in a single array", () => {
			instance.BehavioralFsm.prototype.getSystemHandlerArgs.call( mockInstance, [ "cal", "zone", ], "CLIENT" ).should.eql( [
				"CLIENT",
				"cal",
				"zone",
			] );
		} );
	} );

	describe( "handle", () => {
		let mockClient,
			mockChild;

		describe( "when the input is undefined", () => {
			it( "should throw an error", () => {
				mockClient = {};
				( function() {
					instance.BehavioralFsm.prototype.handle.call( mockInstance, mockClient );
				} ).should.throw( "The input argument passed to the FSM's handle method is undefined. Did you forget to pass the input name?" );
			} );
		} );

		describe( "when input is a string", () => {
			describe( "when inExitHandler is false", () => {
				describe( "with a child, no pending delegations and not bubbling", () => {
					beforeEach( () => {
						mockClient = {};
						clientMeta = {
							state: "ready",
						};
						mockChild = {
							handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
							namespace: "mock.child",
						};
						mockInstance = {
							ensureClientMeta: sinon.stub().returns( clientMeta ),
							configForState: sinon.stub().returns( mockChild ),
							buildEventPayload: sinon.stub(),
							emit: sinon.stub(),
							getHandlerArgs: sinon.stub(),
							states: {
								ready: {
									calzone: sinon.stub(),
								},
							},
							pendingDelegations: {},
						};
						result = instance.BehavioralFsm.prototype.handle.call( mockInstance, mockClient, "calzone", "arg1", "arg2" );
					} );

					it( "should call handle on child (and use an existing ticket number if present)", () => {
						mockChild.handle.should.be.calledOnceWithExactly(
							{},
							{ inputType: "calzone", delegated: true, ticket: "UUID", },
							"arg1",
							"arg2"
						);
					} );

					it( "should update the pendingDelegations prop", () => {
						mockInstance.pendingDelegations.should.eql( {
							UUID: { delegatedTo: "mock.child", },
						} );
					} );

					it( "should return the result", () => {
						result.should.eql( "YOUR CALZONE, SIR" );
					} );
				} );
			} );

			describe( "when inExitHandler is true", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "ready",
						inExitHandler: true,
					};
					mockChild = {
						handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
						namespace: "mock.child",
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						emit: sinon.stub(),
						states: {
							ready: {
								calzone: sinon.stub(),
							},
						},
						pendingDelegations: {},
					};
					result = instance.BehavioralFsm.prototype.handle.call(
						mockInstance,
						mockClient,
						"calzone",
						"arg1",
						"arg2"
					);
				} );

				it( "should return undefined", () => {
					( result === undefined ).should.be.true();
				} );

				it( "should not execute any handlers", () => {
					mockInstance.states.ready.calzone.should.not.be.called();
					mockChild.handle.should.not.be.called();
				} );
			} );
		} );

		describe( "when input is an object", () => {
			describe( "when inExitHandler is false", () => {
				describe( "with a child, no pending delegations and not bubbling", () => {
					beforeEach( () => {
						mockClient = {};
						clientMeta = {
							state: "ready",
						};
						mockChild = {
							handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
							namespace: "mock.child",
						};
						mockInstance = {
							ensureClientMeta: sinon.stub().returns( clientMeta ),
							configForState: sinon.stub().returns( mockChild ),
							buildEventPayload: sinon.stub(),
							emit: sinon.stub(),
							getHandlerArgs: sinon.stub(),
							states: {
								ready: {
									calzone: sinon.stub(),
								},
							},
							pendingDelegations: {},
						};
						result = instance.BehavioralFsm.prototype.handle.call(
							mockInstance,
							mockClient,
							{
								inputType: "calzone",
								delegated: false,
								ticket: undefined,
								bubbling: false,
							},
							"arg1",
							"arg2"
						);
					} );

					it( "should create a ticket number if one is not present", () => {
						utils.createUUID.should.be.calledOnce();
					} );

					it( "should update the pendingDelegations prop", () => {
						mockInstance.pendingDelegations.should.eql( {
							UUID: { delegatedTo: "mock.child", },
						} );
					} );

					it( "should call handle on the child", () => {
						mockChild.handle.should.be.calledOnceWithExactly(
							mockClient,
							{
								inputType: "calzone",
								delegated: true,
								ticket: "UUID",
								bubbling: false,
							},
							"arg1",
							"arg2"
						);
					} );

					it( "should return the result", () => {
						result.should.eql( "YOUR CALZONE, SIR" );
					} );
				} );

				describe( "with a child, no pending delegations & bubbling", () => {
					beforeEach( () => {
						mockClient = {};
						clientMeta = {
							state: "ready",
						};
						mockChild = {
							handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
							namespace: "mock.child",
						};
						mockInstance = {
							ensureClientMeta: sinon.stub().returns( clientMeta ),
							configForState: sinon.stub().returns( mockChild ),
							buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
							emit: sinon.stub(),
							getHandlerArgs: sinon.stub().returns( [ mockClient, "arg1", "arg2", ] ),
							states: {
								ready: {
									calzone: sinon.stub(),
								},
							},
							pendingDelegations: {
								8675309: { delegatedTo: "mock.child", },
							},
						};
						result = instance.BehavioralFsm.prototype.handle.call(
							mockInstance,
							mockClient,
							{
								inputType: "calzone",
								delegated: false,
								ticket: "8675309",
								bubbling: true,
							},
							"arg1",
							"arg2"
						);
					} );

					it( "should remove any pending delegations", () => {
						mockInstance.pendingDelegations.should.eql( {} );
					} );

					it( "should call buildEventPayload with expected args", () => {
						mockInstance.buildEventPayload.should.be.calledOnceWithExactly(
							mockClient,
							{
								inputType: "calzone",
								delegated: false,
								ticket: "8675309",
							}
						);
					} );

					it( "should emit a HANDLING event", () => {
						mockInstance.emit.should.be.calledTwice();
						mockInstance.emit.getCall( 0 ).should.be.calledWithExactly(
							"handling",
							"EVENT_PAYLOAD"
						);
					} );

					it( "should get the handler args", () => {
						mockInstance.getHandlerArgs.should.be.calledOnceWithExactly( [
							{},
							{
								inputType: "calzone",
								delegated: false,
								ticket: "8675309",
								bubbling: true,
							},
							"arg1",
							"arg2",

						], false );
					} );

					it( "should call the handler if a function is provided", () => {
						mockInstance.states.ready.calzone.should.be.calledOnceWithExactly( mockClient, "arg1", "arg2" );
					} );

					it( "should emit a HANDLED event", () => {
						mockInstance.emit.getCall( 1 ).should.be.calledWithExactly(
							"handled",
							"EVENT_PAYLOAD"
						);
					} );

					it( "should update clientMeta props", () => {
						clientMeta.should.eql( {
							currentAction: "",
							currentActionArgs: undefined,
							priorAction: "ready.calzone",
							state: "ready",
						} );
					} );
				} );

				describe( "with a child, pending delegations, not bubbling, and no matching handler", () => {
					beforeEach( () => {
						mockClient = {};
						clientMeta = {
							state: "ready",
						};
						mockChild = {
							handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
							namespace: "mock.child",
						};
						mockInstance = {
							ensureClientMeta: sinon.stub().returns( clientMeta ),
							configForState: sinon.stub().returns( mockChild ),
							buildEventPayload: sinon.stub().returns( { paylod: "EVENT_PAYLOAD", } ),
							emit: sinon.stub(),
							getHandlerArgs: sinon.stub().returns( [ mockClient, "arg1", "arg2", ] ),
							states: {
								ready: {
									otherHandlersButNotCalzoneInThisState: sinon.stub(),
								},
							},
							pendingDelegations: {
								8675309: { delegatedTo: "mock.child", },
							},
						};
						result = instance.BehavioralFsm.prototype.handle.call(
							mockInstance,
							mockClient,
							{
								inputType: "calzone",
								delegated: false,
								ticket: "8675309",
								bubbling: false,
							},
							"arg1",
							"arg2"
						);
					} );

					it( "should emit a NO_HANDLER event if not handler is found", () => {
						mockInstance.emit.should.be.calledOnceWithExactly(
							"nohandler",
							{
								args: [
									{},
									{
										inputType: "calzone",
										delegated: false,
										ticket: "8675309",
										bubbling: false,
									},
									"arg1",
									"arg2",
								],
								paylod: "EVENT_PAYLOAD",
							}
						);
					} );
				} );
			} );

			describe( "when inExitHandler is true", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "ready",
						inExitHandler: true,
					};
					mockChild = {
						handle: sinon.stub().returns( "YOUR CALZONE, SIR" ),
						namespace: "mock.child",
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						emit: sinon.stub(),
						states: {
							ready: {
								calzone: sinon.stub(),
							},
						},
						pendingDelegations: {},
					};
					result = instance.BehavioralFsm.prototype.handle.call(
						mockInstance,
						mockClient,
						{
							inputType: "calzone",
							delegated: false,
							ticket: "8675309",
							bubbling: false,
						},
						"arg1",
						"arg2"
					);
				} );

				it( "should return undefined", () => {
					( result === undefined ).should.be.true();
				} );

				it( "should not execute any handlers", () => {
					mockInstance.states.ready.calzone.should.not.be.called();
					mockChild.handle.should.not.be.called();
				} );
			} );
		} );
	} );

	describe( "transition", () => {
		let mockClient,
			mockChild;

		describe( "when we're in an exit handler", () => {
			beforeEach( () => {
				mockClient = {};
				clientMeta = {
					state: "readyForCalzone",
					inExitHandler: true,
				};
				mockChild = {
					namespace: "mock.child",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					configForState: sinon.stub().returns( mockChild ),
					buildEventPayload: sinon.stub(),
					emit: sinon.stub(),
					getSystemHandlerArgs: sinon.stub(),
					states: {
						readyForCalzone: {},
						nomNomCalzone: {},
					},
				};
				result = instance.BehavioralFsm.prototype.transition.call(
					mockInstance,
					mockClient,
					"nomNomCalzone"
				);
			} );

			it( "should not transition", () => {
				clientMeta.state.should.eql( "readyForCalzone" );
			} );
		} );

		describe( "when the new state is the same as the current state", () => {
			beforeEach( () => {
				mockClient = {};
				clientMeta = {
					state: "readyForCalzone",
					inExitHandler: false,
				};
				mockChild = {
					namespace: "mock.child",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					configForState: sinon.stub().returns( mockChild ),
					buildEventPayload: sinon.stub(),
					emit: sinon.stub(),
					getSystemHandlerArgs: sinon.stub(),
					states: {
						readyForCalzone: {},
						nomNomCalzone: {},
					},
				};
				result = instance.BehavioralFsm.prototype.transition.call(
					mockInstance,
					mockClient,
					"readyForCalzone"
				);
			} );

			it( "should not transition", () => {
				clientMeta.state.should.eql( "readyForCalzone" );
			} );
		} );

		describe( "when an invalid state is passed", () => {
			beforeEach( () => {
				mockClient = {};
				clientMeta = {
					state: "readyForCalzone",
					inExitHandler: false,
				};
				mockChild = {
					namespace: "mock.child",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					configForState: sinon.stub().returns( mockChild ),
					buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
					emit: sinon.stub(),
					getSystemHandlerArgs: sinon.stub(),
					states: {
						readyForCalzone: {},
						nomNomCalzone: {},
					},
				};
				result = instance.BehavioralFsm.prototype.transition.call(
					mockInstance,
					mockClient,
					"dasEssenIstSehrGut"
				);
			} );

			it( "should not transition", () => {
				clientMeta.state.should.eql( "readyForCalzone" );
			} );

			it( "should build the event payload for the invalid state event", () => {
				mockInstance.buildEventPayload.should.be.calledOnceWithExactly(
					mockClient,
					{
						state: "readyForCalzone",
						attemptedState: "dasEssenIstSehrGut",
					}
				);
			} );

			it( "should emit an invalid state event", () => {
				mockInstance.emit.should.be.calledOnceWithExactly(
					"invalidstate",
					"EVENT_PAYLOAD"
				);
			} );
		} );

		describe( "when the new state is one we can transition into", () => {
			describe( "when the state we're exiting has an onExit handler", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "readyForCalzone",
						inExitHandler: false,
						currentAction: "gimmehCalzone",
					};
					mockChild = {
						namespace: "mock.child",
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						configForState: sinon.stub().returns(),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
						getSystemHandlerArgs: sinon.stub(),
						processQueue: sinon.stub(),
						states: {
							readyForCalzone: {
								gimmehCalzone: sinon.stub(),
								_onExit: sinon.stub(),
							},
							nomNomCalzone: {},
						},
					};
					result = instance.BehavioralFsm.prototype.transition.call(
						mockInstance,
						mockClient,
						"nomNomCalzone"
					);
				} );

				it( "should invoke the exit handler", () => {
					mockInstance.states.readyForCalzone._onExit.should.be.calledOnceWithExactly( mockClient );
				} );

				it( "should set the new and prior state properties", () => {
					clientMeta.targetReplayState.should.eql( "nomNomCalzone" );
					clientMeta.priorState = "readyForCalzone";
					clientMeta.state = "nomNomCalzone";
				} );

				it( "should build the event payload for transition/transitioned events", () => {
					mockInstance.buildEventPayload.should.be.calledOnceWithExactly(
						mockClient,
						{
							fromState: "readyForCalzone",
							action: "gimmehCalzone",
							toState: "nomNomCalzone",
						}
					);
				} );

				it( "should emit a transition event", () => {
					mockInstance.emit.should.be.calledTwice();
					mockInstance.emit.getCall( 0 ).should.be.calledWithExactly(
						"transition",
						"EVENT_PAYLOAD"
					);
				} );

				it( "should emit a transitioned event", () => {
					mockInstance.emit.getCall( 1 ).should.be.calledWithExactly(
						"transitioned",
						"EVENT_PAYLOAD"
					);
				} );
			} );

			describe( "when the state we're entering has an onEnter handler", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "readyForCalzone",
						inExitHandler: false,
						currentAction: "gimmehCalzone",
					};
					mockChild = {
						namespace: "mock.child",
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						configForState: sinon.stub().returns(),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
						getSystemHandlerArgs: sinon.stub().returns( [ "SYSTEM_HANDLER_ARGS", ] ),
						processQueue: sinon.stub(),
						states: {
							readyForCalzone: {
								gimmehCalzone: sinon.stub(),
							},
							nomNomCalzone: {
								_onEnter: sinon.stub(),
							},
						},
					};
					result = instance.BehavioralFsm.prototype.transition.call(
						mockInstance,
						mockClient,
						"nomNomCalzone",
						"arg1",
						"arg2"
					);
				} );

				it( "should set the new and prior state properties", () => {
					clientMeta.targetReplayState.should.eql( "nomNomCalzone" );
					clientMeta.priorState = "readyForCalzone";
					clientMeta.state = "nomNomCalzone";
				} );

				it( "should emit a transition event", () => {
					mockInstance.emit.should.be.calledTwice();
					mockInstance.emit.getCall( 0 ).should.be.calledWithExactly(
						"transition",
						"EVENT_PAYLOAD"
					);
				} );

				it( "should invoke the onEnter handler", () => {
					mockInstance.getSystemHandlerArgs.should.be.calledOnceWithExactly(
						[ "arg1", "arg2", ],
						mockClient
					);
					mockInstance.states.nomNomCalzone._onEnter.should.be.calledOnceWithExactly(
						"SYSTEM_HANDLER_ARGS"
					);
				} );

				it( "should emit a transitioned event", () => {
					mockInstance.emit.getCall( 1 ).should.be.calledWithExactly(
						"transitioned",
						"EVENT_PAYLOAD"
					);
				} );

				it( "should call processQueue", () => {
					mockInstance.processQueue.should.be.calledOnceWithExactly( mockClient, "transition" );
				} );
			} );

			describe( "when the FSM is hierarchical", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "readyForCalzone",
						inExitHandler: false,
						currentAction: "gimmehCalzone",
					};
					mockChild = {
						namespace: "mock.child",
						handle: sinon.stub(),
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						configForState: sinon.stub().returns( mockChild ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
						getSystemHandlerArgs: sinon.stub().returns( [ "SYSTEM_HANDLER_ARGS", ] ),
						processQueue: sinon.stub(),
						states: {
							readyForCalzone: {
								gimmehCalzone: sinon.stub(),
							},
							nomNomCalzone: {},
						},
					};
					result = instance.BehavioralFsm.prototype.transition.call(
						mockInstance,
						mockClient,
						"nomNomCalzone",
						"arg1",
						"arg2"
					);
				} );

				it( "should handle _reset on the child", () => {
					mockChild.handle.should.be.calledOnceWithExactly( mockClient, "_reset" );
				} );
			} );

			describe( "when the client's new state doesn't match the replay state", () => {
				beforeEach( () => {
					mockClient = {};
					clientMeta = {
						state: "readyForCalzone",
						inExitHandler: false,
						currentAction: "gimmehCalzone",
					};
					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						configForState: sinon.stub().returns(),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
						getSystemHandlerArgs: sinon.stub().returns( [ "SYSTEM_HANDLER_ARGS", ] ),
						processQueue: sinon.stub(),
						states: {
							readyForCalzone: {
								gimmehCalzone: sinon.stub(),
							},
							nomNomCalzone: {
								_onEnter() {
									// simulating another transition while transitioning to the new state
									clientMeta.targetReplayState = "waitingForMoreCalzone";
								},
							},
							waitingForMoreCalzone: {},
						},
					};
					result = instance.BehavioralFsm.prototype.transition.call(
						mockInstance,
						mockClient,
						"nomNomCalzone",
						"arg1",
						"arg2"
					);
				} );

				it( "should not call processQueue", () => {
					mockInstance.processQueue.should.not.be.called();
				} );
			} );
		} );
	} );

	describe( "deferUntilTransition", () => {
		describe( "when the input can be deferred", () => {
			describe( "when the stateName arg is not an array", () => {
				beforeEach( () => {
					clientMeta = {
						currentActionArgs: [ "ARG1", "ARG2", ],
						inputQueue: [],
					};

					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
					};
					result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", "calzone" );
				} );

				it( "should call ensureClientMeta", () => {
					mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
				} );

				it( "should add the input to the client's queue", () => {
					clientMeta.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "calzone", ],
							args: [ "ARG1", "ARG2", ],
						},
					] );
				} );

				it( "should emit a deferred event", () => {
					mockInstance.emit.should.be.calledOnceWithExactly( "deferred", "EVENT_PAYLOAD" );
				} );
			} );

			describe( "when the stateName arg is undefined", () => {
				beforeEach( () => {
					clientMeta = {
						currentActionArgs: [ "ARG1", "ARG2", ],
						inputQueue: [],
					};

					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
					};
					result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT" );
				} );

				it( "should call ensureClientMeta", () => {
					mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
				} );

				it( "should add the input to the client's queue", () => {
					clientMeta.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: undefined,
							args: [ "ARG1", "ARG2", ],
						},
					] );
				} );

				it( "should emit a deferred event", () => {
					mockInstance.emit.should.be.calledOnceWithExactly( "deferred", "EVENT_PAYLOAD" );
				} );
			} );

			describe( "when the stateName arg is an array", () => {
				beforeEach( () => {
					clientMeta = {
						currentActionArgs: [ "ARG1", "ARG2", ],
						inputQueue: [],
					};

					mockInstance = {
						ensureClientMeta: sinon.stub().returns( clientMeta ),
						buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
						emit: sinon.stub(),
					};
					result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", [ "calzone", "carbonara", ] );
				} );

				it( "should call ensureClientMeta", () => {
					mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
				} );

				it( "should add the input to the client's queue", () => {
					clientMeta.inputQueue.should.eql( [
						{
							type: "transition",
							untilState: [ "calzone", "carbonara", ],
							args: [ "ARG1", "ARG2", ],
						},
					] );
				} );

				it( "should emit a deferred event", () => {
					mockInstance.emit.should.be.calledOnceWithExactly( "deferred", "EVENT_PAYLOAD" );
				} );
			} );
		} );

		describe( "when the input cannot be deferred", () => {
			beforeEach( () => {
				clientMeta = {
					currentActionArgs: undefined,
					inputQueue: [],
				};

				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					buildEventPayload: sinon.stub().returns( "EVENT_PAYLOAD" ),
					emit: sinon.stub(),
				};
				result = instance.BehavioralFsm.prototype.deferUntilTransition.call( mockInstance, "CLIENT", [ "calzone", "carbonara", ] );
			} );

			it( "should not add the input to the client's queue", () => {
				clientMeta.inputQueue.length.should.equal( 0 );
			} );

			it( "should not emit a deferred event", () => {
				mockInstance.emit.should.not.be.called();
			} );
		} );
	} );

	describe( "deferAndTransition", () => {
		beforeEach( () => {
			mockInstance = {
				deferUntilTransition: sinon.stub(),
				transition: sinon.stub(),
			};
			result = instance.BehavioralFsm.prototype.deferAndTransition.call( mockInstance, "CLIENT", "calzone" );
		} );

		it( "should call deferUntilTransition", () => {
			mockInstance.deferUntilTransition.should.be.calledOnceWithExactly( "CLIENT", "calzone" );
		} );

		it( "should call transition", () => {
			mockInstance.transition.should.be.calledOnceWithExactly( "CLIENT", "calzone" );
		} );
	} );

	describe( "processQueue", () => {
		beforeEach( () => {
			clientMeta = {
				state: "calzone",
				inputQueue: [
					{ untilState: [ "calzone", ], args: [ "arg1", "arg2", ], },
					{ untilState: [ "carbonara", ], args: [ "arg1", "arg2", ], },
					{ untilState: [ "calzone", "carbonara", ], args: [ "arg3", "arg4", ], },
				],
			};
			mockInstance = {
				ensureClientMeta: sinon.stub().returns( clientMeta ),
				handle: sinon.stub(),
			};
			result = instance.BehavioralFsm.prototype.processQueue.call( mockInstance, "CLIENT" );
		} );

		it( "should call ensureClientMeta", () => {
			mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
		} );

		it( "should update the inputQueue", () => {
			clientMeta.inputQueue.should.eql( [
				{ untilState: [ "carbonara", ], args: [ "arg1", "arg2", ], },
			] );
		} );

		it( "should process the queued inputs, calling handle for each one", () => {
			mockInstance.handle.should.be.calledTwice();
			mockInstance.handle.getCall( 0 ).should.be.calledWithExactly( "CLIENT", "arg1", "arg2" );
			mockInstance.handle.getCall( 1 ).should.be.calledWithExactly( "CLIENT", "arg3", "arg4" );
		} );
	} );

	describe( "clearQueue", () => {
		describe( "when not passing a state name", () => {
			beforeEach( () => {
				clientMeta = {
					inputQueue: [ "queued", "inputs", ],
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
				};
				result = instance.BehavioralFsm.prototype.clearQueue.call( mockInstance, "CLIENT" );
			} );

			it( "should clear all queued inputs", () => {
				clientMeta.inputQueue.length.should.equal( 0 );
			} );
		} );

		describe( "when passing a state name", () => {
			beforeEach( () => {
				clientMeta = {
					inputQueue: [
						{ untilState: [ "calzone", "carbonara", ], },
						{ untilState: [ "calzone", "carbonara", ], },
						{ untilState: [ "cheesecake", "carbonara", ], },
						{ untilState: [ "calzone", ], },
					],
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
				};
				result = instance.BehavioralFsm.prototype.clearQueue.call( mockInstance, "CLIENT", "calzone" );
			} );

			it( "should clear on queued inputs related to that state", () => {
				clientMeta.inputQueue.should.eql( [
					{ untilState: [ "carbonara", ], },
					{ untilState: [ "carbonara", ], },
					{ untilState: [ "cheesecake", "carbonara", ], },
				] );
			} );
		} );
	} );

	describe( "compositeState", () => {
		describe( "when the FSM is hierarchical", () => {
			beforeEach( () => {
				clientMeta = {
					state: "STATEY-STATE-STATE",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					states: {
						"STATEY-STATE-STATE": {
							_child: {
								instance: {
									compositeState: sinon.stub().returns( "COMPOSITE.STATE" ),
								},
							},
						},
					},
				};
				result = instance.BehavioralFsm.prototype.compositeState.call( mockInstance, "CLIENT" );
			} );

			it( "should ensure client meta", () => {
				mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should call compositeState on the child instance", () => {
				mockInstance.states[ "STATEY-STATE-STATE" ]._child.instance.compositeState.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should return the expected string state value", () => {
				result.should.eql( "STATEY-STATE-STATE.COMPOSITE.STATE" );
			} );
		} );

		describe( "when the FSM is not hierarchical", () => {
			beforeEach( () => {
				clientMeta = {
					state: "STATEY-STATE-STATE",
				};
				mockInstance = {
					ensureClientMeta: sinon.stub().returns( clientMeta ),
					states: {
						"STATEY-STATE-STATE": {},
					},
				};
				result = instance.BehavioralFsm.prototype.compositeState.call( mockInstance, "CLIENT" );
			} );

			it( "should ensure client meta", () => {
				mockInstance.ensureClientMeta.should.be.calledOnceWithExactly( "CLIENT" );
			} );

			it( "should return the expected string state value", () => {
				result.should.eql( "STATEY-STATE-STATE" );
			} );
		} );
	} );
} );
