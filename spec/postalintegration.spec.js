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
				exchange: "machina.test",
				topic: "fsm"
			},
			events: ["CustomEvent", "OnEnter"],
			states: {
				"uninitialized" : {
					"event1" : function() {
						this.transition("initialized");
					},
					"event2" : function() {
						this.deferUntilTransition();
						console.log("HAI!")
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
		postal.subscribe("machina.test", "fsm.*", function(data, envelope) {
			testCapture[envelope.topic] = true;
		});

		postal.publish("machina.test", "fsm.handle.event21", {});
		postal.publish("machina.test", "fsm.handle.event2", {});
		postal.publish("machina.test", "fsm.handle.event1", {});
		fsm.transition("NoSuchThing");

		it("should fire the Transitioned event", function(){
			assert(testCapture["fsm.event.Transitioned"]).equals(true);
		});
		it("should fire the NoHandler event", function(){
			assert(testCapture["fsm.event.NoHandler"]).equals(true);
		});
		it("should fire the Handling event", function(){
			assert(testCapture["fsm.event.Handling"]).equals(true);
		});
		it("should fire the Handled event", function(){
			assert(testCapture["fsm.event.Handled"]).equals(true);
		});
		it("should fire the CustomEvent event", function(){
			assert(testCapture["fsm.event.CustomEvent"]).equals(true);
		});
		it("should fire the OnEnter handler", function(){
			assert(testCapture["fsm.event.OnEnter"]).equals(true);
		});
		it("should fire the InvalidState handler", function(){
			assert(testCapture["fsm.event.InvalidState"]).equals(true);
		});
		it("should fire the Deferred handler", function(){
			assert(testCapture["fsm.event.Deferred"]).equals(true);
		});
	});
});