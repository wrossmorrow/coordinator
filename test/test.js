
const Coordinator = require( './../src/Coordinator.js' );

function fakeFunction( s , data , failure , warning , success ) {
	var time = 3 * Math.random() * 1000
	var timer = setTimeout( () => {
		console.log( "fakeFunction(" + s + "," + (parseFloat(time)/1000.0).toFixed(2) + "): " + data );
		success( data );
	} , time );
}

function noop( data , failure , warning , success ) { success(); }

function success( C , clear ) {
	console.log( C.getId() + ":: coordinated runs (" + C.getStages() + ") succeeded" );

	console.log( "Results: " , C.getResults() );

	if( clear && C.clear ) { C.clear(); }
}
function failure( C , clear ) {
	console.log( C.getId() + ":: coordinated runs (" + C.getStages() + ") failed" );
	if( clear && C.clear ) { C.clear(); }
}

const A = new Coordinator();
console.log( "A: " + A.getId() );

var previous = [];
["1","2","3"].forEach( s => {
	A.addStage( 
		s , 
		fakeFunction.bind( this , s ) , 
		noop , 
		0 , 
		previous , 
		( data , prereqs , results ) => { 
			prereqs.forEach( p => {
				data *= results[p];
			} )
			return data;
		} , 
		null , 
		2
	);
	previous = [ s ]
} );
// A.quiet();

console.log( A.isDAG() );

var Atimer = setInterval( () => {
	console.log( A.getId() + ":: coordinated runs (" + A.getStages() + ") starting" );
	A.run( 
		failure.bind( this , A , false ) , 
		success.bind( this , A , false ) , 
	);
} , 10 * 1000 );


const B = new Coordinator();
console.log( "B: " + B.getId() );

var prereq = ["8"];
["5","6","7","8"].forEach( s => {
	B.addStage( 
		s , 
		fakeFunction.bind( this , s ) , 
		noop , 
		0 , 
		prereq , 
		undefined , 
		null , 
		0
	);
	prereq = [s];
} );
B.quiet();

console.log( B.isDAG() );

/*
var Btimer = setInterval( () => {
	console.log( B.getId() + ":: coordinated runs (" + B.getStages() + ") starting" );
	B.run( cFailure.bind( this , B , false ) , cSuccess.bind( this , B , false ) );
} , 6 * 1000 );
*/
