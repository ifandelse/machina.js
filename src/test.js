var task = new DistributedTask({
	timeout: 4000,
	trigger: "resources.load",
	topics: ["resource1.loaded","resource2.loaded","resource3.loaded","resource4.loaded"],
	onStart: function() {
		_.each([1,2,3,4], function(key) {
			utils.publish("get.resource" + key);
		});
	},
	onComplete: function(resource1,resource2,resource3,resource4) {
		// do stuff with the resources
	},
	onError: function(resource1,resource2,resource3,resource4) {
		this.start(); // retry
	}
});