(function($, _, infuser, undefined){
	var infuserDefault = infuser.defaults;

	infuser.defaults = $.extend(true, infuserDefault, {
		templateUrl: "templates",
		bindingInstruction: function(template, model) {
			return _.template(template, model);
		},
		render: function(target, template) {
			$(target).html(template);
		},
		useLoadingTemplate: false
	});

})(jQuery, _, infuser);
