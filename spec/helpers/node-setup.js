// Setup for running Mocha via Node
require( "should/should" );

global._ = require( "lodash" );

global.machina = require( "../../lib/machina.js" );

global.specFactory = require( "./fsmFactory.js" )( global.machina );

global.hierarchical = require( "./hierarchicalFsm.js" )( global.machina );

global.sinon = require( "sinon" );
