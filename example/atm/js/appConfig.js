(function ( $, _, infuser, undefined ) {
	var infuserDefault = infuser.defaults;

	infuser.defaults = $.extend( true, infuserDefault, {
		templateUrl : "/example/atm/templates",
		bindingInstruction : function ( template, model ) {
			return template( model );
		},
		render : function ( target, template ) {
			$( target ).html( template );
		},
		useLoadingTemplate : false,
		templatePreProcessor : function ( template ) {
			return _.template( template );
		}
	} );

})( jQuery, _, infuser );
