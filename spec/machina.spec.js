QUnit.specify("machina.js", function(){
	var fsm,
		rgx = /.*\.[0-9]*/;
	describe("machina.utils", function(){
		describe("When calling machina.utils.makeFsmExchange", function() {
			var name = machina.utils.makeFsmNamespace();
			it("should return fsm.{number}", function(){
				assert(rgx.test(name)).equals(true);
			});
		});
		describe("When calling machina.utils.getDefaultOptions", function() {
			var options = machina.utils.getDefaultOptions();
			it("initialState should default to uninitialized", function(){
				assert(options.initialState).equals("uninitialized");
			});
			it("events should default to 1 empty arrays", function(){
				assert(options.eventListeners["*"].length).equals(0);
			});
			it("states should default to empty object", function(){
				assert(_.isEmpty(options.state)).equals(true);
			});
			it("stateBag should default to empty object", function(){
				assert(_.isEmpty(options.stateBag)).equals(true);
			});
			it("messaging should default to expected values", function(){
				assert(rgx.test(options.messaging.handlerNamespace)).equals(true);
				assert(rgx.test(options.messaging.eventNamespace)).equals(true);
				assert(options.messaging.subscriptions.length).equals(0);
			});
		});
		describe("With defaulted FSM", function(){
			var fsmB;
			fsm = new machina.Fsm();
			fsmB = new machina.Fsm();
			describe("When calling machina.utils.getQualifiedHandlerNames", function() {
				var handlers = machina.utils.getHandlerNames(fsm);
				it("should return an empty array", function(){
					assert(handlers.length).equals(0);
				});
			});
		});
		describe("With custom FSM", function(){
			fsm = new machina.Fsm({
				states: {
					"one" : {
						"a": function() { },
						"b": function() { }
					},
					"two" : {
						"b": function() { },
						"c": function() { }
					}
				}
			});
			describe("When calling machina.utils.getQualifiedHandlerNames", function() {
				var handlers = machina.utils.getHandlerNames(fsm);
				it("should return an array with three handler names", function(){
					assert(handlers[0]).equals("a");
					assert(handlers[1]).equals("b");
					assert(handlers[2]).equals("c");
					assert(handlers.length).equals(3);
				});
			});
		});
	});
	describe("helpers", function(){
		var list = ["One", "Two", "Three"],
			result = transformEventListToObject(list);
		describe("When calling transformEventListToObject", function() {
			it("should transform the array into an object", function(){
				assert(result.One.length).equals(0);
				assert(result.Two.length).equals(0);
				assert(result.Three.length).equals(0);
			});
		});
		describe("When calling parseEvents on an array of event names", function() {
			var res = parseEventListeners(list);
			it("should transform the array into an object", function(){
				assert(result.One.length).equals(0);
				assert(result.Two.length).equals(0);
				assert(result.Three.length).equals(0);
			});
		});
		describe("When calling parseEvents on an events object", function() {
			var res = parseEventListeners(result);
			it("should return the events object", function(){
				assert(result).equals(res);
			});
		});
	});
	describe("machina.Fsm", function() {
		describe("When creating a new Fsm", function(){
			var event1 = 0,
				event2 = 0,
				event3 = 0,
				noHandlerInvoked = false,
				transitionedHandler = false,
				handlingHandler = false,
				handledHandler = false,
				invalidStateHandler = false,
				customEventInvoked = false,
				onEnterInvoked = false,
				xfsm = new machina.Fsm({
					states: {
						"uninitialized" : {
							"event1" : function() {
								event1++;
								this.fireEvent("CustomEvent");
								this.transition("initialized");
							}
						},
						"initialized" : {
							_onEnter: function() {
								onEnterInvoked = true;
							},
							"event2" : function() {
								event2++;
							},
							"event3" : function() {
								event3++;
							}
						}
					},
					eventListeners: {
						"NoHandler": [function() { noHandlerInvoked = true; }],
						"Transitioned": [function() { transitionedHandler = true; }],
						"Handling": [function() { handlingHandler = true; }],
						"Handled": [function() { handledHandler = true; }],
						"InvalidState": [function() { invalidStateHandler = true; }],
						"CustomEvent": [function() { customEventInvoked = true; }]
					}
				});
			xfsm.handle("nothingwillgetthis");
			xfsm.handle("event1");
			xfsm.handle("event2");
			xfsm.handle("event3");
			xfsm.transition("NoSuchState");

			it("should fire the Transitioned event", function(){
				assert(transitionedHandler).equals(true);
			});
			it("should fire the NoHandler event", function(){
				assert(noHandlerInvoked).equals(true);
			});
			it("should fire the Handling event", function(){
				assert(handlingHandler).equals(true);
			});
			it("should fire the Handled event", function(){
				assert(handledHandler).equals(true);
			});
			it("should fire the CustomEvent event", function(){
				assert(customEventInvoked).equals(true);
			});
			it("should fire the OnEnter handler", function(){
				assert(onEnterInvoked).equals(true);
			});
			it("should fire the InvalidState handler", function(){
				assert(invalidStateHandler).equals(true);
			});
			it("should have invoked handlers", function(){
				assert(event1).equals(true);
				assert(event2).equals(true);
				assert(event3).equals(true);
			});
		});
		describe("When deferring until after the next transition", function(){
			var event2 = 0,
				deferredInvoked = false,
				xfsm = new machina.Fsm({
					states: {
						"uninitialized" : {
							"event1" : function() {
								this.transition("initialized");
							},
							"event2" : function() {
								this.deferUntilTransition();
							}
						},
						"initialized" : {
							"event2" : function() {
								event2++;
							}
						}
					},
					eventListeners: {
						"Deferred": [function() { deferredInvoked = true; }]
					}
				});
			xfsm.handle("event2");
			xfsm.handle("event1");

			it("should fire the Deferred event", function(){
				assert(deferredInvoked).equals(true);
			});
			it("should have invoked the handler on replay", function(){
				assert(event2).equals(1);
			});
		});

		describe("When deferring until a specific state", function(){
			var event2 = 0,
				deferredInvoked = false,
				xfsm = new machina.Fsm({
					states: {
						"uninitialized" : {
							"event1" : function() {
								this.transition("initialized");
							},
							"event2" : function() {
								this.deferUntilTransition("ready");
							}
						},
						"initialized" : {
							"event1" : function() {
								this.transition("ready");
							},
							"event2" : function() {
								event2++;
							}
						},
						"ready" : {
							"event2" : function() {
								event2++;
							}
						}
					},
					eventListeners: {
						"Deferred": [function() { deferredInvoked = true; }]
					}
				});
			xfsm.handle("event2");
			xfsm.handle("event1");
			xfsm.handle("event1");

			it("should fire the Deferred event", function(){
				assert(deferredInvoked).equals(true);
			});
			it("should have invoked the handler once in 'ready' state", function(){
				assert(event2).equals(1);
			});
		});

		describe("When deferring until the next handler call", function(){
			var event2 = 0,
				deferredInvoked = false,
				xfsm = new machina.Fsm({
					states: {
						"uninitialized" : {
							"event1" : function() {
								this.transition("initialized");
							},
							"event2" : function() {
								this.deferUntilNextHandler();
							}
						},
						"initialized" : {
							"event1" : function() {
								this.transition("ready");
							},
							"event2" : function() {
								event2++;
							}
						},
						"ready" : {
							"event2" : function() {
								event2++;
							}
						}
					},
					eventListeners: {
						"Deferred": [function() { deferredInvoked = true; }]
					}
				});
			xfsm.handle("event2");
			xfsm.handle("event1");
			xfsm.handle("event1");

			it("should fire the Deferred event", function(){
				assert(deferredInvoked).equals(true);
			});
			it("should have invoked the handler once", function(){
				assert(event2).equals(1);
			});
		});
	});
});