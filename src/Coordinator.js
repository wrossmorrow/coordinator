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
 * 									BEGIN tarjan-graph.js
 * 
 * tarjan-graph module (https://github.com/tmont/tarjan-graph)
 * 
 * Packaged in to simplify testing processing graphs for cycles
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

class Vertex {

	constructor(name, successors) {
		this.name = name;
		this.successors = successors;
		this.reset();
	}

	reset() {
		this.index = -1;
		this.lowLink = -1;
		this.onStack = false;
		this.visited = false;
	}

}

class Graph {

	constructor() {
		this.vertices = {};
	}

	add(key, descendants) {
		descendants = Array.isArray(descendants) ? descendants : [descendants];

		const successors = descendants.map((key) => {
			if (!this.vertices[key]) {
				this.vertices[key] = new Vertex(key, []);
			}
			return this.vertices[key];
		});

		if (!this.vertices[key]) {
			this.vertices[key] = new Vertex(key);
		}

		this.vertices[key].successors = successors.concat([]).reverse();
		return this;
	}

	reset() {
		Object.keys(this.vertices).forEach((key) => {
			this.vertices[key].reset();
		});
	}

	addAndVerify(key, descendants) {
		this.add(key, descendants);
		const cycles = this.getCycles();
		if (cycles.length) {
			let message = `Detected ${cycles.length} cycle${cycles.length === 1 ? '' : 's'}:`;
			message += '\n' + cycles.map((scc) => {
				const names = scc.map(v => v.name);
				return `  ${names.join(' -> ')} -> ${names[0]}`;
			}).join('\n');

			const err = new Error(message);
			err.cycles = cycles;
			throw err;
		}

		return this;
	}

	dfs(key, visitor) {
		this.reset();
		const stack = [this.vertices[key]];
		let v;
		while (v = stack.pop()) {
			if (v.visited) {
				continue;
			}

			//pre-order traversal
			visitor(v);
			v.visited = true;

			v.successors.forEach(w => stack.push(w));
		}
	}

	getDescendants(key) {
		const descendants = [];
		let ignore = true;
		this.dfs(key, (v) => {
			if (ignore) {
				//ignore the first node
				ignore = false;
				return;
			}
			descendants.push(v.name);
		});

		return descendants;
	}

	hasCycle() {
		return this.getCycles().length > 0;
	}

	getStronglyConnectedComponents() {
		const V = Object.keys(this.vertices).map((key) => {
			this.vertices[key].reset();
			return this.vertices[key];
		});

		let index = 0;
		const stack = [];
		const components = [];

		const stronglyConnect = (v) => {
			v.index = index;
			v.lowLink = index;
			index++;
			stack.push(v);
			v.onStack = true;

			v.successors.forEach((w) => {
				if (w.index < 0) {
					stronglyConnect(w);
					v.lowLink = Math.min(v.lowLink, w.lowLink);
				} else if (w.onStack) {
					v.lowLink = Math.min(v.lowLink, w.index);
				}
			});

			if (v.lowLink === v.index) {
				const scc = [];
				let w;
				do {
					w = stack.pop();
					w.onStack = false;
					scc.push(w);
				} while (w !== v);

				components.push(scc);
			}
		};

		V.forEach(function(v) {
			if (v.index < 0) {
				stronglyConnect(v);
			}
		});

		return components;
	}

	getCycles() {
		return this.getStronglyConnectedComponents().filter( (scc) => {
			if (scc.length > 1) {
				return true;
			}
			const startNode = scc[0];
			return startNode && startNode.successors.some(node => node === startNode);
		});
	}

	clone() {
		const graph = new Graph();

		Object.keys(this.vertices).forEach((key) => {
			const v = this.vertices[key];
			graph.add(v.name, v.successors.map((w) => {
				return w.name;
			}));
		});

		return graph;
	}

	toDot() {
		const V = this.vertices;
		const lines = [ 'digraph {' ];

		this.getCycles().forEach((scc, i) => {
			lines.push('  subgraph cluster' + i + ' {');
			lines.push('    color=red;');
			lines.push('    ' + scc.map(v => v.name).join('; ') + ';');
			lines.push('  }');
		});

		Object.keys(V).forEach((key) => {
			const v = V[key];
			if (v.successors.length) {
				v.successors.forEach((w) => {
					lines.push(`  ${v.name} -> ${w.name}`);
				});
			}
		});

		lines.push('}');
		return lines.join('\n') + '\n';
	}

}

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * 									END tarjan-graph.js
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * 
 * Actual Coordinator class
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
		this.planned  = false; 			// whether execution has been "planned"
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

	// success, failure, warning handlers
	_stageFailure( key , err )  	  { this.emitter.emit( 'failure' , key , err ); }
	_stageWarning( key , warn , res ) { this.emitter.emit( 'warning' , key , warn , res ); }
	_stageSuccess( key , res ) 		  { this.emitter.emit( 'success' , key , res ); }

	// handler to run a given stage
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
		// of those stages... this must be a synchronous call, if it is provided
		if( this.stages[key].prereqs.length > 0 && this.stages[key].prepare ) {
			runData = this.stages[key].prepare( runData , this.stages[key].prereqs , this.results );
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

	// a special handler for stages that have no (function) rollback passed to them
	_noRollback( data , failure , warning , success ) { success(); }

	// handler for doing a stage rollback
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
						this.stages[s].ready += 1;
						if( this.stages[s].ready >= this.stages[s].prereqs.length ) { this._runstage( s ); }
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
						this.stages[s].ready += 1;
						if( this.stages[s].ready >= this.stages[s].prereqs.length ) { this._runstage( s ); }
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
	addStage( key , execute , rollback , retries , prereqs , prepare , repair , data ) {

		// if there isn't at least one argument, return
		if( typeof key === "undefined" ) { return; }

		// if there is a single argument, interpret it as an object containing all the parameters
		if( arguments.length === 1 ) {
			data 	 = key.data;
			prepare  = key.prepare;
			repair   = key.repair;
			prereqs  = key.prereqs;
			retries  = key.retries;
			rollback = key.rollback;
			execute  = key.execute;
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
			prepare  : ( typeof prepare === "function" ? prepare : null ) , 
			data 	 : ( data === Object(data) ? Object.assign( {} , data ) : data ), 
			repair 	 : ( typeof repair === "function" ? repair : null ) , 
			next 	 : [] , // this will have to be filled in by plan()
			ready 	 : 1 , // may be overwritten by plan()
		};

		// increment the number of stages this coordinator is managing
		this.number += 1;
		
	}

	// Add _multiple_ stages, using a formatted object: 
	// 
	// 		{ key1 : {  execute  : ... , 
	//					rollback : ... , 
	//					retries  : ... , 
	//					prereqs  : ... , 
	//					prepare  : ... , 
	//					repair   : ... , 
	//					data     : ... } , 
	//		  key2 : ... 
	//		}
	//
	// or an array
	// 
	//		[ { key : ... , ... } , ... ]
	// 
	addStages( stages ) {
		if( Array.isArray( stages ) ) {
			stages.forEach( s => { this.addStage( s ); } );
		} else {
			Object.keys( stages ).forEach( s => { 
				this.addStage( { ...stages[s] , key : s } ); 
			} );
		}
	}

	// drop (delete) a stage by key
	dropStage( key ) {
		if( key in this.stages ) { delete this.stages[key]; }
		this.number -= 1;
		// clear the plan flag if we've added a stage
		if( this.planned ) { this.planned = false; }
	}

	// drop multiple stages by an array or object of keys
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
	 * Coordinator Forward and Reverse Execution Plan Generation
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	// create a "forward execution plan" from prerequisites... for each stage, 
	// if it has prereqs, add its key in each of its prereq's "next" field. 
	plan(  ) {

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

	// REVERSE plan... basically, "next" arrays become "prereqs", implicitly, 
	// which become a new "next" plan... BUT we can ignore anything that hasn't been
	// run yet... 
	nalp(  ) {

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
	 * Test Stages for DAG property (no cycles)
	 * 
	 * Tarjan algorithm, as implemented by the tarjan-graph module (included explicitly here)
	 * 
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
	 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

	isDAG() {
		if( ! this.planned ) { this.plan(); } 			// define the forward execution plan
		var G = new Graph();							// define a new graph
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

	// clear * everything * out of this coordinator
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

	run( failure , success , data ) {

		// make sure the forward execution plan is prepared (even though we would build it
		// to test the DAG below)
		if( ! this.planned ) { this.plan(); }

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
		Object.keys( this.stages ).map( s => {
			if( this.stages[s].ready >= this.stages[s].prereqs.length ) { this._runstage( s ); }
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
 * Copyright 2018, W. Ross Morrow and Stanford GSB Research Support Services
 * 
 * Except tarjan-graph.js, ostensibly copyright Tommy Montgomery (https://github.com/tmont)
 *  
 * Contact: 
 * 
 * 		W. Ross Morrow    wrossmorrow@stanford.edu
 *		Stanfor GSB RSS   gsb_circle_research@stanford.edu
 * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * 
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */