var webpackConfig = require( "./webpack.config.test.js" );
var _ = require( "lodash" );

_.extend( webpackConfig, {
	cache: true,
	watch: false,
	debug: true,
	devtool: "inline-source-map"
} );

var reporters = [ "spec", "progress", "coverage" ];

delete webpackConfig.output;
delete webpackConfig.entry;

module.exports = function( config ) {
	config.set( {

		// base path that will be used to resolve all patterns (eg. files, exclude)
		basePath: "",

		// frameworks to use
		// available frameworks: https://npmjs.org/browse/keyword/karma-adapter
		frameworks: [ "mocha" ],

		// list of files / patterns to load in the browser
		files: [
		"spec/helpers/phantomjs-shims.js",
		"spec/helpers/karma-setup.js",
		"spec/**/*.spec.*"
		],

		// list of files to exclude
		exclude: [
		],

		// preprocess matching files before serving them to the browser
		// available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
		preprocessors: {
			"spec/**/*.js": [ "webpack", "sourcemap" ]
		},

		webpack: webpackConfig,

		// test results reporter to use
		// possible values: "dots", "progress"
		// available reporters: https://npmjs.org/browse/keyword/karma-reporter
		reporters: reporters,

		// web server port
		port: 9876,

		// enable / disable colors in the output (reporters and logs)
		colors: true,

		// level of logging
		// possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
		logLevel: config.LOG_INFO,

		// enable / disable watching file and executing tests whenever any file changes
		autoWatch: true,

		// start these browsers
		// available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
		browsers: [ "Chrome" /*, "Safari", "Firefox" */ ],

		webpackServer: {
			quiet: true,
			stats: {
				colors: true
			}
		},

		// Continuous Integration mode
		// if true, Karma captures browsers, runs the tests and exits
		singleRun: false
	} );
};
