var MainView = function( target ) {
		var self = this;
		self.model = {
			title: "Contrived News Reader"
		};

		self.render = function() {
			var self = this;
			infuser.infuse("main", {
				target: target,
				model: self.model
			});
		};

		infuser.get("main", function(template) {
			postal.publish("application", "mainTemplate.retrieved", {});
			self.render();
		});
	},
	ErrorView = function( target ) {
		this.model = {};

		this.render = function(model) {
			var self = this;
			self.model = model || self.model;
			infuser.infuse("failure", {
				target: target,
				model: self.model
			});
		};

		infuser.get("failure", function(template) {
			postal.publish("application", "errorTemplate.retrieved", {});
		});
	},
	ItemView = function( target ) {
		var self = this,
			errorNotice = new ErrorView( target );
		self.model = {};

		self.render = function() {
			var self = this;
			infuser.infuse("headlines", {
				target: target,
				model: self.model
			});
		};

		postal.subscribe("application.events", "dataGetFail", function(data, env){
			errorNotice.render(data[0]);
		});

		postal.subscribe("application", "itemData.retrieved", function(data, env){
			self.model = data;
			self.render();
		});

		infuser.get("headlines", function(template) {
			postal.publish("application", "itemTemplate.retrieved", {});
		});
	};