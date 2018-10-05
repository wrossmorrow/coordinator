
const Coordinator = require( './../src/Coordinator.js' );

function fakeFunction( s , data , failure , warning , success ) {
	var timer = setTimeout( () => {
		console.log( "ff: " + s , data );
		success( data );
	} , 3 * Math.random() * 1000 );
}

function noop( data , failure , warning , success ) { success(); }

function cSuccess( C , clear ) {
	console.log( C.getId() + ":: coordinated runs (" + C.getStages() + ") succeeded" );

	console.log( "Results: " , C.getResults() );

	if( clear && C.clear ) { C.clear(); }
}
function cFailure( C , clear ) {
	console.log( C.getId() + ":: coordinated runs (" + C.getStages() + ") failed" );
	if( clear && C.clear ) { C.clear(); }
}

const A = new Coordinator();

const B = new Coordinator();

console.log( "A: " + A.getId() );
console.log( "B: " + B.getId() );

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
		2
	);
	previous = [ s ]
} );
// A.quiet();

["5","6","7","8"].forEach( s => {
	B.addStage( 
		s , 
		fakeFunction.bind( this , s ) , 
		noop , 
		0 , 
		[] , 
		undefined , 
		0
	);
} );
B.quiet();

var Atimer = setInterval( () => {
	console.log( A.getId() + ":: coordinated runs (" + A.getStages() + ") starting" );
	A.run( 
		cFailure.bind( this , A , false ) , 
		cSuccess.bind( this , A , false ) , 
	);
} , 10 * 1000 );

/*
var Btimer = setInterval( () => {
	console.log( B.getId() + ":: coordinated runs (" + B.getStages() + ") starting" );
	B.run( cFailure.bind( this , B , false ) , cSuccess.bind( this , B , false ) );
} , 6 * 1000 );
*/
