
/**
 * @module coordinator
 * @description This module defines the `Coordinator` class for directed, acyclic asynchronous 
 * 			task processing. See [here](https://code.stanford.edu/wrossmorrow/coordinator) for more
 *			details. Also includes the full content of [tarjan-graph](https://github.com/tmont/tarjan-graph) 
 *			(with permission) to test graphs defined for cycles. 
 * 
 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
 */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * coordinator.js
 * 
 * DAG-like processing of asynchronous tasks with possible rollbacks
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */


/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * IMPORTS
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

const TG = require('./src/tarjan-graph.js')

const EventEmitter = require( 'events' );
const _crypto = require( 'crypto' );

// uniform time
const getTime = () => ( new Date( Date.now() ).toISOString() );

// get a random hash
const getHash = () => {
    var current_date = ( new Date() ).valueOf().toString();
    var random = Math.random().toString();
    return String( _crypto.createHash('sha1').update( current_date + random ).digest('hex') );
}

const log = ( s ) => { console.log( getTime() + ": " + s ); }

const protect = ( a , d ) => ( typeof a === "undefined" ? d : a );

class Coordinator {

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Create a Coordinator
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	
	/** 
	 * @function
	 * @constructor
	 * @description Create a `Coordinator` object
	 * 
	 * @returns {object} A newly instantiated `Coordinator` object
	 * 
	 * @example var C = new Coordinator();
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	constructor( ) {

		this._id = getHash();			// some random digits

		this.verbose  = true; 
		this.rollbackInOrder = false;	// placeholder for flag to rollback in order
		this.stages   = {}; 			// object for storage of stages to execute
		this.state    = {}; 			// "stage state" object
		this.callback = {}; 			// callbacks (set in run routine)
		this.number   = 0;				// number of stages that need to run
		this.planned  = false; 			// whether execution has been "planned"
		this.started  = {};				// started timestamps
		this.running  = 0;				// running count
		this.progress = 0;				// progress of run (successes)
		this.rollback = undefined; 		// are we rolling back? 
		this.failed   = undefined; 		// which stage failed? 
		this.warnings = {}; 			// warnings object
		this.results  = {};				// results object
		this.partials = false; 			// do we store and return partial results? 

		/** 
		 * @member
		 * @private
		 * @description An `EventEmitter` to handle asynchronous success/failure in the defined stages
		 * 
		 */
		this.emitter = new EventEmitter();
		this.emitter.on( 'success'  , this._success.bind(this) );
		this.emitter.on( 'warning'  , this._warning.bind(this) );
		this.emitter.on( 'failure'  , this._failure.bind(this) );
		this.emitter.on( 'rollback' , this._rollback.bind(this) );
		this.emitter.on( 'finished' , this._finished.bind(this) );

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Forward and Reverse Execution Plan Generation
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @private
	 * @description Create a "forward execution plan" for this `Coordinator` from stages and 
	 *			prerequisites. For each stage, if it has prereqs, add its `key` in each of its 
	 *			prereq's `next` field. 
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_plan(  ) {

		// initialize, or we will have problems planning multiple times
		Object.keys( this.stages ).forEach( s => { this.stages[s].next = []; } );

		// build out "plan". note we are pushing onto the * prereq's * next array
		Object.keys( this.stages ).forEach( s => {
			if( this.stages[s].prereqs.length > 0 ) {
				this.stages[s].prereqs.forEach( (p,j) => { this.stages[p].next.push( s ); } );
			}
		} );

		// set flag, if it isn't already set
		if( ! this.planned ) { this.planned = true; }

		// note we still have to set this.stages[s].ready for stages with prereqs 
		// before we can run again

	}

	/** 
	 * @function
	 * @private
	 * @description Reverse execution plan for this `Coordinator`. basically, `next` arrays 
	 *			become `prereqs`, implicitly, which become a new `next` plan. But we also can 
	 *			ignore anything that hasn't been run yet as this is executed in rollbacks. 
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_nalp(  ) {

		// create an empty, new * reverse * execution plan
		var new_next = {};
		Object.keys( this.stages ).forEach( s => { new_next[s] = []; } );

		// actually populate this new plan
		Object.keys( this.stages ).forEach( (k,i) => {
			if( this.stages[k].next.length > 0 ) {
				this.stages[k].next.forEach( (n,j) => {
					// for each "next" element p in stage k, make k a "next" element
					// of p... but we can't overwrite p.next until we are done...
					new_next[n].next.push( k ); 
				} );
			}
		} );

		// replace each stage's "next" map with this reverse plan
		Object.keys( this.stages ).forEach( s => { 
			this.stages[s].next = new_next[s];
		} );

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Stage Run Handler(s)... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description Event emitter for when a stage fails. This is bound to a particular `key` 
	 *			and passed as the `failure` method in a stage's `execute`/`rollback` arguments. 
	 * 
	 * @param {string} key `key` of the stage that failed
	 * @param {object} key Error object describing why it failed as passed to `failure` by the 
	 * 			stage's `execute` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_stageFailure( key , err ) { this.emitter.emit( 'failure' , key , err ); }

	/**
	 * @function
	 * @private
	 * @description Event emitter for when a stage succeeds but with a warning. This is bound 
	 *			to a particular `key` and passed as the `warning` method in a stage's `execute`
	 *			/`rollback` arguments. 
	 * 
	 * @param {string} key Stage key to rollback
	 * @param {object} warn Object with information about the warning
	 * @param {object} res Results object passed to `warning` by the stage's `execute` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_stageWarning( key , warn , res ) { this.emitter.emit( 'warning' , key , warn , res ); }

	/**
	 * @function
	 * @private
	 * @description Event emitter for when a stage succeeds.  This is bound to a particular `key` 
	 *			and passed as the `success` method in a stage's `execute`/`rollback` arguments. 
	 * 
	 * @param {string} key `key` of the stage that succeeded
	 * @param {object} res Results object passed to `success` by the stage's `execute` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_stageSuccess( key , res ) { this.emitter.emit( 'success' , key , res ); }

	/**
	 * @function
	 * @private
	 * @description Event handler for running a given stage
	 * 
	 * @param {string} key `key` of the stage to run
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_runstage( key ) {

		// get a convenience object for this stage
		var stage = this.stages[key];

		// printout if desired
		if( this.verbose ) { 
			this.log( "Executing stage \"" + key + "\" " + JSON.stringify( stage.prereqs ) ); 
		}

		// keep track of how many are running
		this.running += 1;

		// keep track of when this stage started
		this.started[key] = Date.now();

		// initialize data to pass to the stage
		var runData = ( typeof stage.data !== "undefined" 
						? ( stage.data === Object( stage.data ) 
							? Object.assign( {} , stage.data )
							: stage.data )
						: {} );

		// if there are prerequisites, we may need to prepare data based on the results
		// of those stages... this must be a __synchronous__ call, if it is provided
		if( this.stages[key].prereqs.length > 0 ) { 
			if( typeof this.stages[key].prepare === "function" ) { // special prepare function
				runData = this.stages[key].prepare( runData , this.stages[key].prereqs , this.results );
			} else if( ! this.stages[key].prepare ) { // default: just copy in current result data for each prereq stage
				this.stages[key].prereqs.forEach( s => { runData[s] = this.results[s]; } );
			} else { // hybrid: just copy in current result data for each prereq stage, as long as we don't have it otherwise specified
				this.stages[key].prereqs.forEach( s => { 
					if( s in this.stages[key].prepare ) { runData[ this.stages[key].prepare[s] ] = this.results[s]; }
					else { runData[s] = this.results[s]; }
				} );
			}
		}

		// execute stage
		stage.execute( 
			runData , 
			this._stageFailure.bind( this , key ) , // ( err ) => this.emitter.emit( 'failure' , key , err ) ,
			this._stageWarning.bind( this , key ) , // ( warn , res ) => this.emitter.emit( 'warning' , key , warn , res ) ,
			this._stageSuccess.bind( this , key ) , // ( res ) => this.emitter.emit( 'success' , key , res ) 
		);
		
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Rollback Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description A special handler for stages that have _no_ (function) rollback passed when defining them
	 * 
	 * @param {object} data Data required to run
	 * @param {function} failure Callback for failure
	 * @param {function} warning Callback for success with a warning
	 * @param {function} success Callback for success
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_noRollback( data , failure , warning , success ) { success(); }

	/**
	 * @function
	 * @private
	 * @description Event handler for doing a stage rollback
	 * 
	 * @param {string} key `key` of the stage to rollback
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_rollback( key ) {

		// get a convenience object for this stage
		var stage = this.stages[key];

		// quick response if we don't need to rollback
		if( typeof stage.rollback !== "function" ) { this.emitter.emit( 'success' , key ); return; }

		// printout if desired
		if( this.verbose ) {
			this.log( "Rollback stage \"" + key + "\" " + JSON.stringify( stage.prereqs ) ); 
		}

		// initialize data to pass to the stage
		var runData = ( typeof stage.data !== "undefined" 
						? ( stage.data === Object( stage.data ) 
							? Object.assign( {} , stage.data )
							: stage.data )
						: {} );

		// ** always ** add this stage's previous results to runData
		runData[key] = this.results[key];

		// we may need to prepare ("repair") data for rollback based on the results
		// of this and earlier stages... this must be a synchronous call, if it is provided
		if( stage.prereqs.length > 0 && stage.repair ) {
			runData = stage.repair( runData , stage.prereqs , this.results );
		}

		// keep track of how many are running
		this.running += 1;

		// keep track of when this stage started (although is it useful here like in execute?)
		this.started[key] = Date.now();

		// actually do the rollback
		stage.rollback( 
			runData ,
			this._stageFailure.bind( this , key ) , // ( err ) => this.emitter.emit( 'failure' , key , err ) ,
			this._stageWarning.bind( this , key ) , // ( warn , res ) => this.emitter.emit( 'warning' , key , warn , res ) ,
			this._stageSuccess.bind( this , key ) , // ( res ) => this.emitter.emit( 'success' , key , res ) 
		);

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Success Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description Event handler for stage success
	 * 
	 * @param {string} key `key` of the stage that succeeded
	 * @param {object} res Results passed to `success` by the stage's `execute` or `rollback` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_success( key , res ) {

		// console.log( "Success" , key , Object.keys( this.stages ) );

		this.running -= 1;

		if( this.rollback ) {

			if( this.started[key] < this.rollback ) { // rollback initiated while this stage was executing... 

				if( this.verbose ) { this.log( "Stage \"" + key + "\" succeeded, but now needs to rollback." ); }
				
				// for consistency, we have to do this stuff
				if( this.partials ) { this.results[key] = res; } // do we need to copy? 
				this.state[key]    = 1; // set state for this stage
				this.progress     += 1; // increment progress counter (even though we take this away)

				// now actually rollback this stage
				this.emitter.emit( 'rollback' , key );

			} else { // "proper" rollback, as in we actually executed rollback to get here

				if( this.verbose ) { this.log( "Stage \"" + key + "\" rollback succeeded." ); }
				if( ! this.partials ) { delete this.results[key]; } // if we do not store partial results, delete results
				this.state[key]    = 0; // rollback state for this stage
				this.progress     -= 1; // keep track of rollbacks that have succeeded
				this.stages[key].ready = 0; // clear out the "ready" flag in this stage

				if( this.running == 0 && this.progress <= 0 ) { this.emitter.emit( 'finished' ); }
				else { // rollback prerequisites of this stage
					if( this.rollbackInOrder ) {
						if( this.stages[key].prereqs.length > 0 ) {
							this.stages[key].prereqs.forEach( (s,i) => {
								this.emitter.emit( 'rollback' , s );
							} );
						}
					}
				}

			}

		} else {

			if( this.verbose ) { this.log( "Stage \"" + key + "\" succeeded." ); }
			
			this.results[key]  = res; // do we need to copy? 
			this.state[key]    = 1; // set state for this stage
			this.progress     += 1; // increment progress counter

			// are we finished? 
			if( this.running == 0 && this.progress == this.number ) { this.emitter.emit( 'finished' ); }
			else { // run any "next" stages
				this.stages[key].next.forEach( (s,i) => {
					this.stages[s].ready += 1;
					if( this.stages[s].ready >= this.stages[s].prereqs.length ) { this._runstage( s ); }
				} );
			}

		}

		delete this.started[key]; // delete stage started time, which serves as a flag. but we need it above. 

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Warning Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description Event handler for stage success with a warning
	 * 
	 * @param {string} key `key` of the stage that succeeded with a warning
	 * @param {object} warn Object describing warning as passed to `warning` by the stage's `execute` or `rollback` function
	 * @param {object} res Results passed to `warning` by the stage's `execute` or `rollback` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_warning( key , warn , res ) {

		// console.log( "Warning" , key , Object.keys( this.stages ) );

		this.running -= 1;

		if( this.rollback ) {

			if( this.started[key] < this.rollback ) { // rollback initiated * while * this stage was executing

				if( this.verbose ) { this.log( "Stage \"" + key + "\" succeeded (with a warning), but now needs to rollback." ); }
				
				// for consistency, we have to do this stuff
				if( this.partials ) { this.results[key] = res; } // do we need to copy? 
				this.state[key]    = 1; // set state for this stage
				this.progress     += 1; // increment progress counter (even though we take this away)
				this.warnings[key] = warn;

				// now actually rollback this stage
				this.emitter.emit( 'rollback' , key );

			} else { // "proper" rollback, as in we actually executed rollback to get here

				if( this.verbose ) { this.log( "Stage \"" + key + "\" rollback succeeded with a warning: " + warn.toString() ); }
				if( ! this.partials ) { delete this.results[key]; } // if we do not store partial results, delete results
				
				this.state[key]    = 0; // rollback state for this stage
				this.progress     -= 1; // keep track of rollbacks that have succeeded
				this.stages[key].ready = 0; // clear out the "ready" flag in this stage
				this.warnings[key] = warn;

				if( this.running == 0 && this.progress <= 0 ) { this.emitter.emit( 'finished' ); }
				else { // rollback prerequisites of this stage
					if( this.rollbackInOrder ) {
						if( this.stages[key].prereqs.length > 0 ) {
							this.stages[key].prereqs.forEach( (s,i) => {
								this.emitter.emit( 'rollback' , s );
							} );
						}
					}
				}

			}

		} else {

			if( this.verbose ) { this.log( "Stage \"" + key + "\" succeeded with a warning: " + warn.toString() ); }
			
			this.results[key]  = res; // do we need to copy? 
			this.state[key]    = 1; // set state for this stage
			this.progress     += 1; // increment progress counter
			this.warnings[key] = warn;

			// are we finished? 
			if( this.running == 0 && this.progress == this.number ) { this.emitter.emit( 'finished' ); }
			else {

				// console.log( "Warning" , key , Object.keys( this.stages ) );

				// if we aren't finished, we can look for more stages to run... 
				// if any depend on this stage, that is
				this.stages[key].next.forEach( (s,i) => {
					this.stages[s].ready += 1;
					if( this.stages[s].ready >= this.stages[s].prereqs.length ) { this._runstage( s ); }
				} );

			}

		}

		delete this.started[key]; // delete started time, which serves as a flag. but we need it above. 
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Failure Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description Event handler for stage failure
	 * 
	 * @param {string} key `key` of the stage that succeeded with a warning
	 * @param {object} err Error object passed to `failure` by the stage's `execute` or `rollback` function
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_failure( key , err ) {

		// console.log( "Failure" , key , Object.keys( this.stages ) );

		this.running -= 1;  // a process stopped

		if( this.rollback ) {

			// original execution, or a rollback execution? 
			if( this.started[key] < this.rollback ) { // rollback initiated * while * this stage was executing

				if( this.verbose ) { 
					var time = getTime();
					console.log( time + " Coordinator:: Stage \"" + key + "\" failed: " + err.toString() ); 
					log( " ".repeat( time.length + 12 )  + ":: Retry skipped because we are already in a rollback state." ); 
				}

				// we don't need to rollback, because... 

			} else { // WHAT DO WE DO WITH ROLLBACK EXECUTION FAILURES??? WHATEVER WE DO, DO IT * HERE * 

				if( this.verbose ) { 
					var time = getTime();
					console.log( time + " Coordinator:: Stage \"" + key + "\" rollback failed: " + err.toString() ); 
					console.log( " ".repeat( time.length + 12 )  + ":: Retry skipped because we are already in a rollback state." ); 
				}

				// keep track of rollbacks... in the absence of anything better, I guess we ignore failures.  

			}

			// if we are in a rollback state, we don't need to re-try failed stages

			// if there are no more running processes, stop
			if( this.running == 0 ) { this.emitter.emit( 'finished' ); }

		} else {

			delete this.started[key]; // delete started time, which serves as a flag

			if( this.verbose ) { 
				this.log( "Stage \"" + key + "\" failed: " + err.toString() ); 
			}

			var stage = this.stages[key];
			if( stage.retries + this.state[ key ] <= 0 ) { // we have failed, and have to initiate rollback/return process

				if( this.verbose ) { this.log( "-- This run attempt will have to be aborted. --" ); }

				// flag that we are rolling back changes starting ... now
				this.rollback = Date.now();
				this.failed = key;

				// initiate rollback any changes made associated with stages that succeeded... 
				// 
				// if ANY of these are running, we have to WAIT until they complete to 
				// actually execute the rollback... This is handled by the event loop, as when 
				// these routines complete they will get their rollbacks started automatically
				// 
				if( this.rollbackInOrder ) {

					// if we DO care about staging order, we can ONLY rollback THIS stage and have 
					// to search through the stages for finished stages with empty "next" sets to 
					// rollback as well...

					// TBD

				} else {

					// if we don't care about staging order in rollbacks, we can just rollback everything
					Object.keys( this.state ).map( (key,i) => {
						if( this.state[key] > 0 && ! this.running[key] ) {
							this.emitter.emit( 'rollback' , key ); 
						}
					} );

				}

			} else {

				this.state[key] -= 1;
				if( this.verbose ) { this.log( "Re-trying stage \"" + key + "\"" ); }
				this._runstage( key ); 

			}

		}

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Finished (successfully or not) Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/**
	 * @function
	 * @private
	 * @description Event handler for when this `Coordinator` has completed all stage executions 
	 *			or rollbacks. This function is what ultimately calls the `success` and `failure` 
	 *			routines passed to `Coordinator.run`. 
	 * 		
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	_finished(  ) { 

		if( this.verbose ) { this.log( "All stages finished." ); }

		if( this.rollback ) {
			if( this.verbose ) { this.log( "Processing failed." ); }
			this.callback.failure( "failed because of stage \"" + this.failed + "\"" );
		} else {
			if( this.verbose ) { this.log( "Processing succeeded." ); }
			this.callback.success( this.results ); 
		}
		
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator log Routine
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @public
	 * @description Internal `Coordinator` log function
	 * 
	 * @param {string} s text to log
	 * 
	 * @example C.log( "some text" );
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	log( s ) { log( "Coordinator(" + this._id + "):: " + s ); }

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator "Getter" Routines
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @public
	 * @description Get the unique `id` of this `Coordinator`, in case objects need to be compared. 
	 * 		The unique `id` is generated on instantiation and not changed. 
	 * 
	 * @returns {string} The unique `id` of this `Coordinator`
	 * 
	 * @example console.log( "Coordinator C has id: " + C.getId() );
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	getId() { return this._id; }

	/** 
	 * @function
	 * @public
	 * @description Get the `results` object for this `Coordinator`, as filled in by a (successful) 
	 *			`run`. 
	 * 
	 * @returns {object} The `results` object for this `Coordinator`. This object will have each 
	 * 			stage as a field whose value is the data passed to `success` by that stage. 
	 * 
	 * @example var results = C.getResults();
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	getResults() { return this.results; }

	/** 
	 * @function
	 * @public
	 * @description Get the stages currently defined for this `Coordinator` as an `array`
	 * 
	 * @returns {array} An `array` containing the stages (`key`s) in this `Coordinator`
	 * 
	 * @example var stages = C.getStages();
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	getStages() { return Object.keys( this.stages ); }

	/** 
	 * @function
	 * @public
	 * @description Get the stages currently defined for this `Coordinator`, as a CSV string
	 * 
	 * @returns {string} A CSV string listing the stages in this `Coordinator`
	 * 
	 * @example console.log( C.printStages() );
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	printStages() { return Object.keys( this.stages ).join(", "); }

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Setup Routines
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	
	quiet() { this.verbose = false; }
	loud() { this.verbose = true; }


	/** 
	 * @function
	 * @description Add a single stage to this `Coordinator`
	 *
	 *	"execute" and "rollback" should each be functions that take: 
	 *	
	 *		an object of arguments for itself (the data passed in here)
	 *		a "failure" callback (accepting a single argument, an "error" object)
	 *		a "warning" callback (accepting two arguments, "warning" and "result" objects)
	 *		a "success" callback (accepting a single argument, a "result" object)
	 *
	 *  and in that order. 
	 *
	 *  "retries" should be a non-negative integer, giving the number of 
	 *	allowable retries for the stage
	 *
	 *  "prereqs" should be an array of keys that must execute before this stage
	 *  can execute
	 *
	 *  "prepare" should be a function that takes in the dictionary of previous results
	 *	and the data object for this stage and returns a modified data object for this 
	 *  stage
	 *
	 *	"data" is any object that should be passed to an evalution of 
	 *	"execute" and "rollback" (as the first argument)
	 *
	 */ 
	addStage( key , execute , rollback , retries , prereqs , prepare , repair , data ) {

		// if there isn't at least one argument, return
		if( typeof key === "undefined" ) { return; }

		// if there is a single argument, interpret it as an object containing all the parameters
		if( arguments.length === 1 ) {
			execute  = key.execute;
			rollback = protect( key.rollback , null ); // no rollback by default
			data 	 = protect( key.data     , {}   ); // data by default is an empty object
			prepare  = protect( key.prepare  , null ); // no "prep" needed, by default
			repair   = protect( key.repair   , null ); // no "repair" (rollback prep) needed, by default
			prereqs  = protect( key.prereqs  , []   ); // no prereqs by default
			retries  = protect( key.retries  , 0    ); // no retries by default
			key 	 = key.key;
		}

		// don't add stages more than once (add unique keys only)
		if( key in this.stages ) { return; }

		// if execute isn't a function, bail
		if( typeof execute !== "function" ) { return; }

		// clear the plan flag if we're adding a stage... which we'll be doing now
		if( this.planned ) { this.planned = false; }

		// retries as passed in should be a (base-10) integer
		var retriesInt = parseInt( retries , 10 );

		// prereqs has to be an empty array not "undefined"
		if( typeof prereqs === "undefined" ) { prereqs = []; }

		// now, actually define the stage object
		this.stages[key] = { 	
			execute  : execute , 
			rollback : ( typeof rollback === "function" ? rollback : this._noRollback ) , 
			retries  : ( isNaN(retriesInt) ? 0 : retriesInt ) , 
			prereqs  : ( Array.isArray( prereqs ) ? Object.assign( [] , prereqs ) : [ prereqs ] ) , 
			prepare  : prepare , // ( typeof prepare === "function" ? prepare : null ) , 
			data 	 : ( data === Object(data) ? Object.assign( {} , data ) : data ), 
			repair 	 : ( typeof repair === "function" ? repair : null ) , 
			next 	 : [] , // this will have to be filled in by _plan()
			ready 	 : 1 , // may be overwritten by _plan()
		};

		// increment the number of stages this coordinator is managing
		this.number += 1;
		
	}

	/** 
	 * @function
	 * @public
	 * @description Add multiple stages
	 * 
	 * @param {array|object} stages Stages to add, either as an `array` of `object`s to 
	 * 			add (@see addStage) or as an `object` whose fields are the `key`s and 
	 *			corresponding values are the stage specifications. 
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	addStages( stages ) {
		if( Array.isArray( stages ) ) {
			stages.forEach( s => { this.addStage( s ); } );
		} else {
			Object.keys( stages ).forEach( s => { 
				this.addStage( { ...stages[s] , key : s } ); 
			} );
		}
	}

	/** 
	 * @function
	 * @public
	 * @description Drop (delete) a single stage by `key`. Does nothing if the stage is not defined. 
	 * 
	 * @param {string} key `key` of the stage to be dropped
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	dropStage( key ) {
		if( key in this.stages ) { 
			delete this.stages[key]; 
			this.number -= 1;
			// clear the plan flag if we've deleted a stage
			if( this.planned ) { this.planned = false; }
		}
	}

	/** 
	 * @function
	 * @public
	 * @description Drop (delete) multiple stages
	 * 
	 * @param {array|object|string} keys Attempt to drop the stages specified with an `array` of 
	 *			`key`s, `object` whose fields are the `key`s, or a single string `key`
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	dropStages( keys ) {
		if( Array.isArray( keys ) ) {
			keys.forEach( k => { dropStage(k); } );
		} else if( keys === Object(keys) ) {
			Object.keys( keys ).forEach( k => { dropStage(k); } );
		} else {
			dropStage( keys );
		}
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Test Stages for DAG property (no cycles)
	 * 
	 * Tarjan algorithm, as implemented by the tarjan-graph module (included explicitly here)
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @public
	 * @description Test `Coordinator` Stages for [DAG](https://en.wikipedia.org/wiki/Directed_acyclic_graph) 
	 *			property (no cycles). This is done using the Tarjan algorithm, as implemented in 
	 *			the `tarjan-graph` module (included explicitly here with permission). 
	 * 
	 * @returns {bool} `True` if stages form a DAG, `False` if not (there is a cycle). `Coordinator`
	 *			can only be `run` if there are no cyclces. 
	 * 
	 * @example if( C.isDAG() ) { 
	 *     C.log( "No cycles" ); 
	 * } else { 
	 *     C.log( "There is a cycle" ); 
	 * }
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	isDAG() {
		if( ! this.planned ) { this._plan(); } 			// define the forward execution plan
		var G = new TG.Graph();							// define a new graph
		Object.keys( this.stages ).forEach( s => {		// for each stage (vertex)... 
			G.add( s , this.stages[s].next );			// 	 add each stage as a vertex with 
		} );											//   its outgoing edges (successors)
		return ( ! G.hasCycle() );						// if there is no cycle, this is a DAG
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Clear 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @publics
	 * @description Clear **everything** out of this `Coordinator` instance. Deletes all stage data. 
	 * 
	 * @example C.clear();
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	clear() {
		if( this.verbose ) { this.log( "clearing..." ); }
		this.rollbackInOrder = false;	// placeholder for flag to rollback in order
		this.stages   = {}; 			// object for storage of stages to execute
		this.state    = {}; 			// "stage state" object
		this.callback = {}; 			// callbacks (set in run routine)
		this.number   = 0;				// number of stages that need to run
		this.planned  = false; 			// whether execution has been "planned"
		this.started  = {};				// started timestamps
		this.running  = 0;				// running count
		this.progress = 0;				// progress of run (successes)
		this.rollback = undefined; 		// are we rolling back? 
		this.failed   = undefined; 		// which stage failed? 
		this.warnings = {}; 			// warnings object
		this.results  = {};				// results object
		this.partials = false; 			// do we store and return partial results? 
	}
		
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Run, given callbacks to invoke upon ultimate failure or success 
	 * and (optional) data object to replace data for keyed stages
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	/** 
	 * @function
	 * @public
	 * @description `Coordinator` "run" method. Issue this call with callbacks for success and 
	 *			failure and, optionally, initial stage data to use to "run" the actions specified
	 *			by the stages. 
	 * 
	 * @param {function} failure Callback to execute on failure with an `error` object. Prototype 
	 *			is `( error ) => { ... }`
	 * @param {function} success Callback to execute on success (with or without warning). Prototype 
	 *			is `( results ) => { ... }` 
	 * @param {object} data (optional) Stage `data` to use for this run, supercedes any data provided
	 * 			when stage was defined. 
	 * 
	 * @example C.run( (e)=>{ C.log(e.toString()); } , (r)=>{C.log("success!");} );
	 * 
	 * @author [W. Ross Morrow](mailto:wrossmorrow@stanford.edu)
	 */ 
	run( failure , success , data ) {

		// make sure the forward execution plan is prepared (even though we would build it
		// to test the DAG below)
		if( ! this.planned ) { this._plan(); }

		// make sure this run won't go on forever, at least because of repeated execution
		if( this.isDAG() ) {
			if( this.verbose ) {
				this.log( "Stages appear to form a DAG (no cycles), can proceed with run." );
			}
		} else {
			var message = "Sorry, these stages do not appear to form a DAG (they have a cycle).";
			if( this.verbose ) { this.log( message ); }
			if( failure ) { failure( message ); }
			return;
		}
		
		// define callbacks for run routine
		this.callback = { failure : failure , success : success };

		// redefine data if some passed in
		if( typeof data !== "undefined" ) {
			Object.keys( data ).forEach( s => { 
				if( s in this.stages ) {
					this.stages[s].data = data[s]; 
				}
			} );
		}
		
		// initialize "stage state" object and the ready value
		Object.keys( this.stages ).forEach( s => { 
			this.state[s] = 0; 
			this.stages[s].ready = 0; // ( this.stages[s].prereqs.length > 0 ? 0 : 1 );
		} );

		// other initializations
		this.started  = {}; 			// started timestamps
		this.running  = 0;				// initialize running count to zero
		this.progress = 0;				// initialize progress count to zero
		this.rollback = undefined; 		// are we rolling back? 
		this.failed   = undefined; 		// which stage failed? 
		this.warnings = {}; 			// warnings object
		this.results  = {};				// results object

		// print if desired
		if( this.verbose ) { this.log( "running..." ); }

		// attempt to execute all the stages that have * no * prerequisites
		Object.keys( this.stages ).forEach( s => {
			if( this.stages[s].prereqs.length == 0 ) { this._runstage( s ); }
		} );

	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * MODULE EXPORTS
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

module.exports = Coordinator;

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * Copyright 2018, W. Ross Morrow and Stanford GSB Research Support Services
 * 
 * Except tarjan-graph.js, copyright Tommy Montgomery (https://github.com/tmont)
 *  
 * Contact: 
 * 
 * 		W. Ross Morrow    wrossmorrow@stanford.edu
 *		Stanfor GSB RSS   gsb_circle_research@stanford.edu
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */