import _ from "lodash";
import "core-js/stable";
import "regenerator-runtime/runtime";
// import proxyFn from "proxyquire";
import chai from "chai";
import chaiSubset from "chai-subset";


chai.use( require( "dirty-chai" ) );
chai.use( require( "sinon-chai" ) );
chai.use( chaiSubset );
global.should = chai.should();
// global.proxyquire = proxyFn.noPreserveCache().noCallThru();
global.sinon = require( "sinon" );
global._ = _;
global.machina = require( "../../lib/machina" );
