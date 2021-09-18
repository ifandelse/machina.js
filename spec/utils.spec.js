import _ from "lodash";

describe( "utils", () => {
	let events,
		utils;

	beforeEach( () => {
		events = {
			NO_HANDLER: "nohandler",
			HANDLING: "handling",
		};

		const exp = global.proxyquire( "../src/utils", {
			"./events.js": events,
		} );
		utils = exp.utils;
	} );

	describe( "when calling createUUID", () => {
		let values;

		beforeEach( () => {
			values = new Set();
			for ( let i = 0; i < 10000; i++ ) {
				values.add( utils.createUUID() );
			}
		} );

		it( "should return a reasonably unique identifier", () => {
			values.size.should.equal( 10000 );
		} );
	} );

	describe( "extend", () => {
		let result,
			parent,
			instance,
			ctor;

		describe( "when a constructor is provided", () => {
			beforeEach( () => {
				parent = {
					totallyParentProp: true,
				};
				parent.prototype = {
					totallyParentProto: true,
				};
				ctor = function() {};
				result = utils.extend.call(
					parent,
					{
						constructor: ctor,
					},
					{
						totallyStaticProp: true,
					}
				);
			} );

			it( "should make the custom constructor the fsm", () => {
				result.should.equal( ctor );
			} );

			it( "should inherit class props from parent", () => {
				result.totallyParentProp.should.be.true();
			} );

			it( "should set the prototype chain", () => {
				result.prototype.totallyParentProto.should.be.true();
			} );

			it( "should apply static props", () => {
				result.totallyStaticProp.should.be.true();
			} );

			it( "should set the constructor property", () => {
				result.prototype.constructor.should.equal( result );
			} );

			it( "should set the __super__ property", () => {
				result.__super__.should.equal( parent.prototype );
			} );
		} );

		describe( "when no constructor is provided", () => {
			describe( "when not passing args to the default constructor", () => {
				beforeEach( () => {
					parent = function parentFn() {};
					parent.someClassProp = "calzone";
					parent.prototype = {
						totallyParentProto: true,
					};
					result = utils.extend.call(
						parent,
						{
							initialState: "ready",
							states: {
								ready: {},
								doingTheThing: {},
								completed: {},
							},
						},
						{
							totallyStaticProp: true,
						}
					);
					instance = new result(); // eslint-disable-line new-cap
				} );

				it( "apply states to the instance", () => {
					instance.states.should.eql( {
						ready: {},
						doingTheThing: {},
						completed: {},
					} );
					instance.initialState.should.equal( "ready" );
				} );

				it( "should inherit class props from parent", () => {
					result.someClassProp.should.equal( "calzone" );
				} );

				it( "should set the prototype chain", () => {
					result.prototype.totallyParentProto.should.be.true();
				} );

				it( "should apply static props", () => {
					result.totallyStaticProp.should.be.true();
				} );

				it( "should set the constructor property", () => {
					result.prototype.constructor.should.equal( result );
				} );

				it( "should set the __super__ property", () => {
					result.__super__.should.equal( parent.prototype );
				} );
			} );

			describe( "when passing args to the default constructor", () => {
				describe( "when using the default initialState", () => {
					beforeEach( () => {
						parent = function parentFn( ...args ) {
							const [ options, ] = args;
							_.extend( this, options ); // eslint-disable-line no-invalid-this
						};
						parent.someClassProp = "calzone";
						parent.prototype = {
							totallyParentProto: true,
						};
						result = utils.extend.call(
							parent,
							{
								initialState: "ready",
								states: {
									ready: {},
									doingTheThing: {},
									completed: {},
								},
							},
							{
								totallyStaticProp: true,
							}
						);
						// eslint-disable-next-line
						instance = new result( {
							states: {
								afterActionReview: {},
							},
						} ); // eslint-disable-line new-cap
					} );

					it( "apply states to the instance", () => {
						instance.states.should.eql( {
							ready: {},
							doingTheThing: {},
							completed: {},
							afterActionReview: {},
						} );
						instance.initialState.should.equal( "ready" );
					} );

					it( "should inherit class props from parent", () => {
						result.someClassProp.should.equal( "calzone" );
					} );

					it( "should set the prototype chain", () => {
						result.prototype.totallyParentProto.should.be.true();
					} );

					it( "should apply static props", () => {
						result.totallyStaticProp.should.be.true();
					} );

					it( "should set the constructor property", () => {
						result.prototype.constructor.should.equal( result );
					} );

					it( "should set the __super__ property", () => {
						result.__super__.should.equal( parent.prototype );
					} );
				} );

				describe( "when overriding initialState", () => {
					beforeEach( () => {
						parent = function parentFn( ...args ) {
							const [ options, ] = args;
							_.extend( this, options ); // eslint-disable-line no-invalid-this
						};
						parent.someClassProp = "calzone";
						parent.prototype = {
							totallyParentProto: true,
						};
						result = utils.extend.call(
							parent,
							{
								initialState: "ready",
								states: {
									ready: {},
									doingTheThing: {},
									completed: {},
								},
							},
							{
								totallyStaticProp: true,
							}
						);
						// eslint-disable-next-line
						instance = new result( {
							initialState: "afterActionReview",
							states: {
								afterActionReview: {},
							},
						} ); // eslint-disable-line new-cap
					} );

					it( "apply states to the instance", () => {
						instance.states.should.eql( {
							ready: {},
							doingTheThing: {},
							completed: {},
							afterActionReview: {},
						} );
						instance.initialState.should.equal( "afterActionReview" );
					} );

					it( "should inherit class props from parent", () => {
						result.someClassProp.should.equal( "calzone" );
					} );

					it( "should set the prototype chain", () => {
						result.prototype.totallyParentProto.should.be.true();
					} );

					it( "should apply static props", () => {
						result.totallyStaticProp.should.be.true();
					} );

					it( "should set the constructor property", () => {
						result.prototype.constructor.should.equal( result );
					} );

					it( "should set the __super__ property", () => {
						result.__super__.should.equal( parent.prototype );
					} );
				} );
			} );
		} );

		describe( "when no protoProps are provided", () => {
			beforeEach( () => {
				parent = function parentFn() {};
				parent.someClassProp = "calzone";
				parent.prototype = {
					totallyParentProto: true,
				};
				result = utils.extend.call(
					parent,
					null,
					{
						totallyStaticProp: true,
					}
				);
				instance = new result(); // eslint-disable-line new-cap
			} );

			it( "should inherit class props from parent", () => {
				result.someClassProp.should.equal( "calzone" );
			} );

			it( "should set the prototype chain", () => {
				result.prototype.totallyParentProto.should.be.true();
			} );

			it( "should apply static props", () => {
				result.totallyStaticProp.should.be.true();
			} );

			it( "should set the constructor property", () => {
				result.prototype.constructor.should.equal( result );
			} );

			it( "should set the __super__ property", () => {
				result.__super__.should.equal( parent.prototype );
			} );
		} );
	} );

	const { sinon, } = global;

	describe( "getDefaultBehavioralOptions", () => {
		it( "should return the expected FSM defaults", () => {
			utils.getDefaultBehavioralOptions().should.eql( {
				initialState: "uninitialized",
				eventListeners: {
					"*": [],
				},
				states: {},
				namespace: "fsm.0",
				useSafeEmit: false,
				hierarchy: {},
				pendingDelegations: {},
			} );
		} );
	} );

	describe( "getDefaultClientMeta", () => {
		it( "should return the expected client metadata", () => {
			utils.getDefaultClientMeta().should.eql( {
				inputQueue: [],
				targetReplayState: "",
				state: undefined,
				priorState: undefined,
				priorAction: "",
				currentAction: "",
				currentActionArgs: undefined,
				inExitHandler: false,
			} );
		} );
	} );

	describe( "getChildFsmInstance", () => {
		let result,
			config;

		describe( "when config is falsy", () => {
			it( "should return undefined", () => {
				( utils.getChildFsmInstance() === undefined ).should.be.true();
			} );
		} );

		describe( "when config is an object", () => {
			describe( "with a factory", () => {
				beforeEach( () => {
					const factoryFn = () => "INSTANCE";
					config = {
						factory: factoryFn,
					};
					result = utils.getChildFsmInstance( config );
				} );

				it( "should make the passed config the child FSM", () => {
					result.should.equal( config );
				} );

				it( "should set the instance to the factory's return value", () => {
					result.instance.should.equal( "INSTANCE" );
				} );
			} );

			describe( "without a factory", () => {
				beforeEach( () => {
					config = {};
					result = utils.getChildFsmInstance( config );
				} );

				it( "should create a factory that returns the passed config", () => {
					result.factory().should.eql( config );
				} );
			} );
		} );

		describe( "when config is a function", () => {
			beforeEach( () => {
				config = () => { return "INSTANCE"; };
				result = utils.getChildFsmInstance( config );
			} );

			it( "should set the factory prop equal to passed config function", () => {
				result.factory.should.equal( config );
			} );

			it( "should set the instance value to result of factory invocation", () => {
				result.instance.should.equal( "INSTANCE" );
			} );
		} );

		describe( "when config is neither object nor function", () => {
			// NOTE - this is a TypeError, but we should really be more explicit here...
			it( "should throw an error", () => {
				( function() {
					result = utils.getChildFsmInstance( "calzone" );
				} ).should.throw();
			} );
		} );
	} );

	describe( "listenToChild", () => {
		let fsm,
			child,
			handler,
			data;

		beforeEach( () => {
			fsm = {
				namespace: "NAMESPACE",
				handle: sinon.stub(),
				emit: sinon.stub(),
				pendingDelegations: {},
			};
			child = {
				on: sinon.stub(),
			};
			utils.listenToChild( fsm, child );
			handler = child.on.getCall( 0 ).args[ 1 ];
		} );

		describe( "with a NO_HANDLER event", () => {
			describe( "when there's a ticket", () => {
				beforeEach( () => {
					data = {
						ticket: "TICKET",
						delegated: false,
						namespace: "NAMESPACE",
						args: [ null, { bubbling: false, }, ],
						inputType: "TOTALLY_NOT_RESET",
					};
					handler( "nohandler", data );
				} );

				it( "should not be marked as bubbling", () => {
					data.args[ 1 ].bubbling.should.be.false();
				} );

				it( "should have the fsm handle the event", () => {
					fsm.handle.should.be.calledOnceWithExactly( fsm, data.args );
				} );
			} );

			describe( "when there's not a ticket", () => {
				describe( "and it's delegated", () => {
					beforeEach( () => {
						data = {
							ticket: undefined,
							delegated: true,
							namespace: "NAMESPACE",
							args: [ null, { bubbling: false, }, ],
							inputType: "TOTALLY_NOT_RESET",
						};
						handler( "nohandler", data );
					} );

					it( "should not be marked as bubbling", () => {
						data.args[ 1 ].bubbling.should.be.false();
					} );

					it( "should have the fsm handle the event", () => {
						fsm.handle.should.be.calledOnceWithExactly( fsm, data.args );
					} );
				} );

				describe( "and it's not delegated & namespaces do not match", () => {
					beforeEach( () => {
						data = {
							ticket: undefined,
							delegated: false,
							namespace: "NAMESPACE123",
							args: [ null, { bubbling: false, }, ],
							inputType: "TOTALLY_NOT_RESET",
						};
						handler( "nohandler", data );
					} );

					it( "should be marked as bubbling", () => {
						data.args[ 1 ].bubbling.should.be.true();
					} );

					it( "should have the fsm handle the event", () => {
						fsm.handle.should.be.calledOnceWithExactly( fsm, data.args );
					} );
				} );

				describe( "and it's not delegated & namespaces match", () => {
					beforeEach( () => {
						data = {
							ticket: undefined,
							delegated: false,
							namespace: "NAMESPACE",
							args: [ null, { bubbling: false, }, ],
							inputType: "TOTALLY_NOT_RESET",
						};
						handler( "nohandler", data );
					} );

					it( "should not be marked as bubbling", () => {
						data.args[ 1 ].bubbling.should.be.false();
					} );

					it( "should have the fsm handle the event", () => {
						fsm.handle.should.be.calledOnceWithExactly( fsm, data.args );
					} );
				} );
			} );

			describe( "when it's a reset event", () => {
				beforeEach( () => {
					data = {
						ticket: undefined,
						delegated: false,
						namespace: "NAMESPACE",
						args: [ null, { bubbling: false, }, ],
						inputType: "_reset",
					};
					handler( "nohandler", data );
				} );

				it( "should not have the fsm handle the event", () => {
					fsm.handle.should.not.be.called();
				} );
			} );
		} );

		describe( "with a HANDLING event", () => {
			describe( "when there's a ticket and it's pending delegation", () => {
				beforeEach( () => {
					fsm.pendingDelegations.TICKET = "A thing";
					data = {
						ticket: "TICKET",
						delegated: false,
						namespace: "NAMESPACE",
						args: [ null, { bubbling: false, }, ],
						inputType: "_reset",
					};
					handler( "handling", data );
				} );

				it( "should delete the pending delegation key", () => {
					( fsm.pendingDelegations.TICKET === undefined ).should.be.true();
				} );

				it( "should have the fsm emit the event", () => {
					fsm.emit.should.be.calledOnceWithExactly( "handling", data );
				} );
			} );

			describe( "when there's a ticket and it's not pending delegation", () => {
				beforeEach( () => {
					data = {
						ticket: "TICKET",
						delegated: false,
						namespace: "NAMESPACE",
						args: [ null, { bubbling: false, }, ],
						inputType: "_reset",
					};
					handler( "handling", data );
				} );

				it( "should have the fsm emit the event", () => {
					fsm.emit.should.be.calledOnceWithExactly( "handling", data );
				} );
			} );

			describe( "when there's not a ticket", () => {
				beforeEach( () => {
					data = {
						ticket: undefined,
						delegated: false,
						namespace: "NAMESPACE",
						args: [ null, { bubbling: false, }, ],
						inputType: "_reset",
					};
					handler( "handling", data );
				} );

				it( "should have the fsm emit the event", () => {
					fsm.emit.should.be.calledOnceWithExactly( "handling", data );
				} );
			} );
		} );

		describe( "with any other event", () => {
			beforeEach( () => {
				data = {
					ticket: undefined,
					delegated: false,
					namespace: "NAMESPACE",
					args: [ null, { bubbling: false, }, ],
					inputType: "_reset",
				};
				handler( "calzone-in-muh-belleh", data );
			} );

			it( "should have the fsm emit the event", () => {
				fsm.emit.should.be.calledOnceWithExactly( "calzone-in-muh-belleh", data );
			} );
		} );
	} );

	describe( "makeFsmNamespace", () => {
		it( "should return the expected default machina namespace with each call", () => {
			utils.makeFsmNamespace().should.equal( "fsm.0" );
			utils.makeFsmNamespace().should.equal( "fsm.1" );
			utils.makeFsmNamespace().should.equal( "fsm.2" );
		} );
	} );
} );
