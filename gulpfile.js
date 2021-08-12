var gulp = require( "gulp" );
var gutil = require( "gulp-util" );
var path = require( "path" );
var express = require( "express" );
var open = require( "open" );
var port = 3080;

gulp.task( "default", [ "serve" ] );

var createServers = function( port ) {
	var p = path.resolve( "./" );
	var app = express();
	app.use( express.static( p ) );
	app.listen( port, function() {
		gutil.log( "Listening on", port );
	} );

	return {
		app: app
	};
};

var servers;

gulp.task( "server", function() {
	if ( !servers ) {
		servers = createServers( port );
	}

	open( "http://localhost:" + port + "/index.html" );
} );
