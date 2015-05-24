var gulp = require( "gulp" );
var fileImports = require( "gulp-imports" );
var header = require( "gulp-header" );
var beautify = require( "gulp-beautify" );
var hintNot = require( "gulp-hint-not" );
var uglify = require( "gulp-uglify" );
var rename = require( "gulp-rename" );
var plato = require( "gulp-plato" );
var gutil = require( "gulp-util" );
var pkg = require( "./package.json" );
var express = require( "express" );
var path = require( "path" );
var open = require( "open" );
var port = 3080;
var allSrcFiles = "./src/**/*.js";

var banner = [ "/**",
    " * <%= pkg.name %> - <%= pkg.description %>",
    " * Author: <%= pkg.author %>",
    " * Version: v<%= pkg.version %>",
    " * Url: <%= pkg.homepage %>",
    " * License(s): <% pkg.licenses.forEach(function( license, idx ){ %><%= license.type %><% if(idx !== pkg.licenses.length-1) { %>, <% } %><% }); %>",
    " */",
    "" ].join( "\n" );

gulp.task( "combine", function() {
	gulp.src( [ "./src/machina.js" ] )
		.pipe( header( banner, {
			pkg: pkg
		} ) )
		.pipe( fileImports() )
		.pipe( hintNot() )
		.pipe( beautify( {
			indentSize: 4
		} ) )
		.pipe( gulp.dest( "./lib/" ) )
		.pipe( gulp.dest( "./lib/" ) )
		.pipe( uglify( {
			compress: {
				negate_iife: false
			}
		} ) )
		.pipe( header( banner, {
			pkg: pkg
		} ) )
		.pipe( rename( "machina.min.js" ) )
		.pipe( gulp.dest( "./lib/" ) );
} );

gulp.task( "default", function() {
	gulp.run( "combine" );
} );

gulp.task( "report", function() {
	gulp.src( "./lib/machina.js" )
		.pipe( plato( "report" ) );
} );

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

gulp.task( "server", [ "combine", "report" ], function() {
	if ( !servers ) {
		servers = createServers( port );
	}

	open( "http://localhost:" + port + "/index.html" );
} );

var mocha = require( "gulp-spawn-mocha" );
gulp.task( "mocha", function() {
	return gulp.src( [ "spec/**/*.spec.js" ], { read: false } )
		.pipe( mocha( {
			require: [ "spec/helpers/node-setup.js" ],
			reporter: "spec",
			colors: true,
			inlineDiffs: true,
			debug: false
		} ) )
		.on( "error", console.warn.bind( console ) );
} );

gulp.task( "watch", [ "default", "mocha" ], function() {
	gulp.watch( "src/**/*", [ "default" ] );
	gulp.watch( "{lib,spec}/**/*", [ "mocha" ] );
} );

var jscs = require( "gulp-jscs" );
var gulpChanged = require( "gulp-changed" );

gulp.task( "format", [ "jshint" ], function() {
	return gulp.src( [ "**/*.js", "!node_modules/**" ] )
		.pipe( jscs( {
			configPath: ".jscsrc",
			fix: true
		} ) )
		.pipe( gulpChanged( ".", { hasChanged: gulpChanged.compareSha1Digest } ) )
		.pipe( gulp.dest( "." ) );
} );

var jshint = require( "gulp-jshint" );
var stylish = require( "jshint-stylish" );

gulp.task( "jshint", function() {
	return gulp.src( allSrcFiles )
		.on( "error", function( error ) {
			gutil.log( gutil.colors.red( error.message + " in " + error.fileName ) );
			this.end();
		} )
		.pipe( jshint() )
		.pipe( jshint.reporter( stylish ) )
		.pipe( jshint.reporter( "fail" ) );
} );

gulp.task( "coverage", [ "format" ], function( cb ) {
	gulp.src( [ allSrcFiles ] )
		.pipe( istanbul() ) // Covering files
		.pipe( istanbul.hookRequire() ) // Force `require` to return covered files
		.on( "finish", function() {
			gulp.src( [ "./spec/helpers/node-setup.js", allTestFiles ] )
				.pipe( mocha() )
				.pipe( istanbul.writeReports() ) // Creating the reports after tests runned
				.on( "end", function() {
					process.exit();
				} );
		} );
} );

gulp.task( "show-coverage", function() {
	open( "./coverage/lcov-report/index.html" );
} );
