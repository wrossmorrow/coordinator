
'use strict';

const EventEmitter = require( 'events' );

const getTime = () => ( new Date( Date.now() ).toISOString() );

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
		
		/*
		this._success  = this._success.bind(this);
		this._warning  = this._warning.bind(this);
		this._failure  = this._failure.bind(this);
		this._rollback = this._rollback.bind(this);
		this._finished = this._finished.bind(this);

		this.clear = this.clear.bind(this);
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
	 * Coordinator Stage Run Handler... 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	_runstage( key ) {

		if( this.verbose ) { console.log( getTime() + " Coordinator:: Running stage \"" 
											+ key + "\" " 
											+ JSON.stringify( this.stages[key].prereqs ) ); }

		this.running += 1;
		this.started[key] = Date.now();

		// if there are prerequisites, we may need to prepare data based on the results
		// of those stages... this must be a synchronous call, if it is provided
		if( this.stages[key].prereqs.length > 0 && this.stages[key].prepare ) {
			this.stages[key].data = this.stages[key].prepare( 	this.stages[key].data , 
																this.stages[key].prereqs , // this can be useful if we don't use explicit keys
																this.results );
		}

		// execute stage
		this.stages[key].execute( this.stages[key].data , 
									( err ) => this.emitter.emit( 'failure' , key , err ) ,
									( warn , res ) => this.emitter.emit( 'warning' , key , warn , res ) ,
									( res ) => this.emitter.emit( 'success' , key , res ) );
		
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
			stage.rollback( stage.data , 
							( err ) => this.emitter.emit( 'failure' , key , err ) ,
							( warn , res ) => this.emitter.emit( 'warning' , key , warn , res ) ,
							( res ) => this.emitter.emit( 'success' , key , res ) );
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

				if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" succeeded, but now needs to rollback." ); }
				
				// for consistency, we have to do this stuff
				if( this.partials ) { this.results[key] = res; } // do we need to copy? 
				this.state[key]    = 1; // set state for this stage
				this.progress     += 1; // increment progress counter (even though we take this away)

				// now actually rollback this stage
				this.emitter.emit( 'rollback' , key );

			} else { // "proper" rollback, as in we actually executed rollback to get here

				if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" rollback succeeded." ); }
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

			if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" succeeded." ); }

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

				if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" succeeded (with a warning), but now needs to rollback." ); }
				
				// for consistency, we have to do this stuff
				if( this.partials ) { this.results[key] = res; } // do we need to copy? 
				this.state[key]    = 1; // set state for this stage
				this.progress     += 1; // increment progress counter (even though we take this away)
				this.warnings[key] = warn;

				// now actually rollback this stage
				this.emitter.emit( 'rollback' , key );

			} else { // "proper" rollback, as in we actually executed rollback to get here

				if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" rollback succeeded with a warning: " + warn.toString() ); }
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

			if( this.verbose ) { console.log( getTime() + " Coordinator:: Stage \"" + key + "\" succeeded with a warning: " + warn.toString() ); }
			
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
					console.log( " ".repeat( time.length + 12 )  + ":: Retry skipped because we are already in a rollback state." ); 
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
				console.log( getTime() + " Coordinator:: Stage \"" + key + "\" failed: " );
				console.log( err.toString() ); 
			}

			var stage = this.stages[key];
			if( stage.retries + this.state[ key ] <= 0 ) { // we have failed, and have to initiate rollback/return process

				if( this.verbose ) { console.log( getTime() + " Coordinator:: -- This run attempt will have to be aborted. --" ); }

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
				if( this.verbose ) { console.log( getTime() + " Coordinator:: Re-trying stage \"" + key + "\"" ); }
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

		if( this.verbose ) { console.log( getTime() + " Coordinator:: All stages finished." ); }

		if( this.rollback ) {
			this.callback.failure( "failed because of stage \"" + this.failed + "\"" );
		} else {
			this.callback.success( this.results ); 
		}
		
	}

	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Setup Routines
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

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
		if( key in this.stages ) { return; }
		this.stages[key] = { 	execute  : execute , 
								rollback : rollback , 
								retries  : retries , 
								prereqs  : Object.assign( [] , prereqs ) , 
								prepare  : prepare , 
								data 	 : Object.assign( {} , data ) , 
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
		Object.keys( stages ).map( (k,i) => {
			this.addStage = ( k , 
							  stages[k].execute , 
							  stages[k].rollback , 
							  stages[k].retries , 
							  stages[k].prereqs ,
							  stages[k].data );
		} );
	}

	// drop (delete) a stage by key
	dropStage( key ) {
		if( Array.isArray(key) ) {
			key.map( (k,i) => { if( key in this.stages ) { delete this.stages[key]; } } );
		} else {
			if( key in this.stages ) { delete this.stages[key]; }
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

		Object.keys( this.stages ).map( (k,i) => {
			if( this.stages[k].prereqs.length > 0 ) {
				this.stages[k].prereqs.map( (p,j) => {
					this.stages[p].next.push( k );
				} );
				this.stages[k].ready = 0;
				this.stages[k].nincr = 1.0 / parseFloat( this.stages[k].prereqs.length );
			}
		} );

	}

	// reverse plan... basically, "next" arrays become "prereqs", implicitly, 
	// which become a new "next" plan... BUT we can ignore anything that hasn't been
	// run yet... 
	nalp(  ) {

		// create an empty, new reverse execution plan
		var new_next = {};
		Object.keys( this.stages ).map( (k,i) => { new_next[k] = []; } );

		// actually populate this new plan
		Object.keys( this.stages ).map( (k,i) => {
			if( this.stages[k].next.length > 0 ) {
				this.stages[k].nincr = 1.0 / parseFloat( this.stages[k].next.length );
				this.stages[k].ready = 0;
				this.stages[k].next.map( (n,j) => {
					// for each "next" element p in stage k, make k a "next" element
					// of p... but we can't overwrite p.next until we are done...
					new_next[n].next.push( k ); 
				} );
			} else {
				this.stages[k].nincr = 0.0;
				this.stages[k].ready = 1;
			}
		} );

		// replace each stage's next map with this reverse plan
		Object.keys( this.stages ).map( (k,i) => { 
			this.stages[k].next = new_next[k];
		} );

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
	}
		
	/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * 
	 * Coordinator Run, given callbacks to invoke upon ultimate failure or success 
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	run( failure , success ) {

		console.log( "Coordinator here..." )
		
		this.callback = { failure : failure , success : success };

		// initialize "stage state" object
		Object.keys( this.stages ).map( (k,i) => { this.state[k] = 0; } );

		// make sure the forward execution plan is prepared
		this.plan();

		// attempt to execute all the stages that have * no * prerequisites
		Object.keys( this.stages ).map( (key,i) => {
			var stage = this.stages[key];
			if( stage.ready >= 1 ) {
				this._runstage( key );
			}
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
 * 
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */