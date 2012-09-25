(function(root, doc, factory) {
	if (typeof define === "function" && define.amd) {
		// AMD. Register as an anonymous module.
		define(["underscore"], function(_) {
			return factory(_, root, doc);
		});
	} else {
		// Browser globals
		factory(root._, root, doc);
	}
}(this, document, function(_, global, document, undefined) {

	//import("../machina.js");

	global.machina = machina;
	return machina;
}));