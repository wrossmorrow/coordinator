/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * 
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

'use strict';

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

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * 
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

// Coordinator: a class to manage "concurrent" updates or processes
module.exports = class Coordinator {

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Create a Coordinator
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */
	
	constructor( ) {

		this._id = getHash();			// some random digits

		this.verbose  = true; 
		this.rollbackInOrder = false;	// placeholder for flag to rollback in order
		this.stages   = {}; 			// object for storage of stages to execute
		this.state    = {}; 			// "stage state" object
		this.callback = {}; 			// callbacks (set in run routine)
		this.number   = 0;				// number of stages that need to run
		this.started  = {};				// started timestamps
		this.running  = 0;				// running count
		this.progress = 0;				// progress of run (successes)
		this.rollback = undefined; 		// are we rolling back? 
		this.failed   = undefined; 		// which stage failed? 
		this.warnings = {}; 			// warnings object
		this.results  = {};				// results object
		this.partials = false; 			// do we store and return partial results? 

		this.emitter = new EventEmitter();
		this.emitter.on( 'success'  , this._success.bind(this) );
		this.emitter.on( 'warning'  , this._warning.bind(this) );
		this.emitter.on( 'failure'  , this._failure.bind(this) );
		this.emitter.on( 'rollback' , this._rollback.bind(this) );
		this.emitter.on( 'finished' , this._finished.bind(this) );

	}

	log( s ) { log( "Coordinator(" + this._id + "):: " + s ); }

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Stage Run Handler(s)... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	_stageFailure( key , err )  	  { this.emitter.emit( 'failure' , key , err ); }
	_stageWarning( key , warn , res ) { this.emitter.emit( 'warning' , key , warn , res ); }
	_stageSuccess( key , res ) 		  { this.emitter.emit( 'success' , key , res ); }

	_runstage( key ) {

		if( this.verbose ) { this.log( "Running stage \"" 
									+ key + "\" " 
									+ JSON.stringify( this.stages[key].prereqs ) ); }

		this.running += 1;
		this.started[key] = Date.now();

		var runData = ( this.stages[key].data === Object( this.stages[key].data ) 
							? Object.assign( {} , this.stages[key].data )
							: this.stages[key].data );

		// if there are prerequisites, we may need to prepare data based on the results
		// of those stages... this must be a synchronous call, if it is provided
		if( this.stages[key].prereqs.length > 0 && this.stages[key].prepare ) {

			runData 
				= this.stages[key].prepare( 	
					runData , 
					this.stages[key].prereqs , // this can be useful if we don't use explicit keys
					this.results 
				);
		}

		// execute stage
		this.stages[key].execute( 
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

	_rollback( key ) {

		var stage = this.stages[key];
		if( stage.rollback ) {
			this.running += 1;
			this.started[key] = Date.now();
			stage.rollback( 
				stage.data ,
				( err ) => this.emitter.emit( 'failure' , key , err ) ,
				( warn , res ) => this.emitter.emit( 'warning' , key , warn , res ) ,
				( res ) => this.emitter.emit( 'success' , key , res ) 
			);
		} else { this.emitter.emit( 'success' , key ); }

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
							this.stages[key].prereqs.map( (s,i) => {
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

				if( this.stages[key].next.length > 0 ) {
					this.stages[key].next.map( (s,i) => {
						this.stages[s].ready += this.stages[s].nincr;
						if( this.stages[s].ready >= 1 ) { this._runstage( s ); }
					} );
				}
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
							this.stages[key].prereqs.map( (s,i) => {
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
				if( this.stages[key].next.length > 0 ) {
					this.stages[key].next.map( (s,i) => {
						this.stages[s].ready += this.stages[s].nincr;
						if( this.stages[s].ready >= 1 ) { this._runstage( s ); }
					} );
				}

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
					// rollback as well. We would also need to 

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
	 * Coordinator "Getter" Routines
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	getId() { return this._id; }

	getResults() { return this.results; }

	getStages() { return Object.keys( this.stages ).join(", "); }

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

	// Add a single stage... 
	//
	//	"execute" and "rollback" should each be functions that take: 
	//	
	//		an object of arguments for itself (the data passed in here)
	//		a "failure" callback (accepting a single argument, an "error" object)
	//		a "warning" callback (accepting two arguments, "warning" and "result" objects)
	//		a "success" callback (accepting a single argument, a "result" object)
	//
	//  and in that order. 
	//
	//  "retries" should be a non-negative integer, giving the number of 
	//	allowable retries for the stage
	//
	//  "prereqs" should be an array of keys that must execute before this stage
	//  can execute
	//
	//  "prepare" should be a function that takes in the dictionary of previous results
	//	and the data object for this stage and returns a modified data object for this 
	//  stage
	//
	//	"data" is any object that should be passed to an evalution of 
	//	"execute" and "rollback" (as the first argument)
	//
	addStage( key , execute , rollback , retries , prereqs , prepare , data ) {

		if( ! key ) { return; }

		if( arguments.length === 1 ) {
			data 	 = key.data;
			prepare  = key.prepare;
			prereqs  = key.prereqs;
			retries  = key.retries;
			rollback = key.rollback;
			execute  = key.execute;
			key 	 = key.key;
		}

		if( key in this.stages ) { return; }

		this.stages[key] = { 	
			execute  : execute , 
			rollback : rollback , 
			retries  : retries , 
			prereqs  : ( Array.isArray( prereqs ) ? Object.assign( [] , prereqs ) : [ prereqs ] ) , 
			prepare  : prepare , 
			data 	 : ( data === Object(data) ? Object.assign( {} , data ) : data ), 
			next 	 : [] , // this will have to be filled in by plan()
			ready 	 : 1 , // may be overwritten by plan()
			nincr    : 0.0 // may be overwritten by plan()
		};
		this.number += 1;
		
	}

	// Add _multiple_ stages, using a formatted object: 
	// 
	// 		{ key1 : {  execute  : ... , 
	//					rollback : ... , 
	//					retries  : ... , 
	//					prereqs  : ... , 
	//					data     : ... } , 
	//		  key2 : ... 
	//		}
	// 
	addStages( stages ) {
		Object.keys( stages ).forEach( (k,i) => {
			this.addStage = ( 
				k , 
				stages[k].execute , 
				stages[k].rollback , 
				stages[k].retries , 
				stages[k].prereqs ,
				stages[k].data 
			);
		} );
	}

	// drop (delete) a stage by key
	dropStage( key ) {
		if( Array.isArray(key) ) {
			key.map( (k,i) => { if( key in this.stages ) { delete this.stages[key]; } } );
			this.number -= key.length;
		} else {
			if( key in this.stages ) { delete this.stages[key]; }
			this.number -= 1;
		}
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

	// create a "forward execution plan" from prerequisites... for each stage, 
	// if it has prereqs, add its key in each of its prereq's "next" field. 
	// also set the "ready" field for any stage with prereqs to zero, and the
	// "next increment" (nincr) field to 1/#prereqs. This way, when a stage A 
	// finishes, it can for each of its "next" stages, say B, increment stage 
	// B's "ready" field by B's increment and, if the ready field is >= 1, 
	// then stage B can be run. 
	plan(  ) {

		// initialize, or we will have problems planning multiple times
		Object.keys( this.stages ).forEach( s => { this.stages[s].next = []; } );

		Object.keys( this.stages ).forEach( s => {
			if( this.stages[s].prereqs.length > 0 ) {
				this.stages[s].prereqs.map( (p,j) => { // note we are pushing onto the * prereqs * next array
					this.stages[p].next.push( s );
				} );
				this.stages[s].ready = 0;
				this.stages[s].nincr = 1.0 / parseFloat( this.stages[s].prereqs.length );
			}
		} );

	}

	// reverse plan... basically, "next" arrays become "prereqs", implicitly, 
	// which become a new "next" plan... BUT we can ignore anything that hasn't been
	// run yet... 
	nalp(  ) {

		// create an empty, new * reverse * execution plan
		var new_next = {};
		Object.keys( this.stages ).forEach( s => { new_next[s] = []; } );

		// actually populate this new plan
		Object.keys( this.stages ).forEach( (k,i) => {
			if( this.stages[k].next.length > 0 ) {
				this.stages[k].nincr = 1.0 / parseFloat( this.stages[k].next.length );
				this.stages[k].ready = 0;
				this.stages[k].next.forEach( (n,j) => {
					// for each "next" element p in stage k, make k a "next" element
					// of p... but we can't overwrite p.next until we are done...
					new_next[n].next.push( k ); 
				} );
			} else {
				this.stages[k].nincr = 0.0;
				this.stages[k].ready = 1;
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
	 * Test Stages for DAG property (no cycles)
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	test() {

		

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

	// clear * everything * out of this coordinator
	clear() {
		if( this.verbose ) { this.log( "clearing..." ); }
		this.rollbackInOrder = false;	// placeholder for flag to rollback in order
		this.stages   = {}; 			// object for storage of stages to execute
		this.state    = {}; 			// "stage state" object
		this.callback = {}; 			// callbacks (set in run routine)
		this.number   = 0;				// number of stages that need to run
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

	run( failure , success , data ) {

		if( this.verbose ) { this.log( "running..." ); }
		
		this.callback = { failure : failure , success : success };

		if( typeof data !== "undefined" ) {
			Object.keys( data ).forEach( s => { 
				if( s in this.stages ) {
					this.stages[s].data = data[s]; 
				}
			} );
		}

		// initialize "stage state" object (done on run, so we don't have to "reset")
		Object.keys( this.stages ).forEach( s => { this.state[s] = 0; } );

		this.started  = {}; 			// started timestamps
		this.running  = 0;				// initialize running count to zero
		this.progress = 0;				// initialize progress count to zero
		this.rollback = undefined; 		// are we rolling back? 
		this.failed   = undefined; 		// which stage failed? 
		this.warnings = {}; 			// warnings object
		this.results  = {};				// results object

		// make sure the forward execution plan is prepared
		this.plan();

		// attempt to execute all the stages that have * no * prerequisites
		Object.keys( this.stages ).map( (key,i) => {
			if( this.stages[key].ready >= 1 ) { this._runstage( key ); }
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
 * Copyright 2018, W. Ross Morrow and Stanford GSB Research Support Services.
 *  
 * 		wrossmorrow@stanford.edu
 *		gsb_circle_research@stanford.edu
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */