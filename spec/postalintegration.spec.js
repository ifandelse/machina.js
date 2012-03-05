var testCapture = {
	"fsm.event.NoHandler": false,
	"fsm.event.Transitioned": false,
	"fsm.event.Handling": false,
	"fsm.event.Handled": false,
	"fsm.event.InvalidState": false,
	"fsm.event.CustomEvent": false,
	"fsm.event.Deferred": false,
	"fsm.event.OnEnter": false
};

QUnit.specify("machina.js integration with postal.js", function(){
	var fsm;
	describe("With custom FSM", function(){
		fsm = new machina.Fsm({
			initialState: "uninitialized",
			messaging: {
				eventNamespace: "myFsm.events",
				handlerNamespace: "myFsm"
			},
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
					_onEnter: function() {
						this.fireEvent("OnEnter");
					},
					"event2" : function() {
						this.fireEvent("CustomEvent");
					},
					"event3" : function() {

					}
				}
			}
		});
		postal.subscribe("myFsm", "*", function(data, envelope) {
			testCapture[envelope.topic] = true;
		});
		postal.subscribe("myFsm.events", "*", function(data, envelope) {
			testCapture[envelope.topic] = true;
		});

		postal.publish("myFsm", "event21", {});
		postal.publish("myFsm", "event2", {});
		postal.publish("myFsm", "event1", {});
		fsm.transition("NoSuchThing");

		it("should fire the Transitioned event", function(){
			assert(testCapture["Transitioned"]).equals(true);
		});
		it("should fire the NoHandler event", function(){
			assert(testCapture["NoHandler"]).equals(true);
		});
		it("should fire the Handling event", function(){
			assert(testCapture["Handling"]).equals(true);
		});
		it("should fire the Handled event", function(){
			assert(testCapture["Handled"]).equals(true);
		});
		it("should fire the CustomEvent event", function(){
			assert(testCapture["CustomEvent"]).equals(true);
		});
		it("should fire the OnEnter handler", function(){
			assert(testCapture["OnEnter"]).equals(true);
		});
		it("should fire the InvalidState handler", function(){
			assert(testCapture["InvalidState"]).equals(true);
		});
		it("should fire the Deferred handler", function(){
			assert(testCapture["Deferred"]).equals(true);
		});
	});
});