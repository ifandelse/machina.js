var MainView = function( target ) {
	this.model = {
		title: "Contrived News Reader"
	};

	this.render = function() {
		var self = this;
		infuser.infuse("main", {
			target: target,
			model: self.model,
			postRender: function() {

			}
		});
	};
};

var ItemView = function( target ) {
	this.model = {};

	this.render = function() {
		var self = this;
		infuser.infuse("main", {
			target: target,
			model: self.model,
			postRender: function() {

			}
		});
	}
};