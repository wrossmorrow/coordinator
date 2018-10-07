
const X = { "bob" : 2 , "sue" : 3 , "joe" : 4 };

const Coordinator = require( '../src/coordinator.js' );

const sumr  = ( d , f , w , s ) => { 
	setTimeout( () => {
		if( d === Object(d) ) { s( d.sum + d.value ); } else { s( d ); };
	} , 0 )
};

const prep = ( d , p , r ) => ( { sum : r[p[0]] , value : d } );

var C = new Coordinator() , p = [];

var keys = Object.keys( X );
for( var i = 0 ; i < keys.length ; i++ ) {
	var key = keys[i];
	C.addStage( key , sumr , null , 0 , p , prep , null , X[key] );
	p = [ key ];
}

const failed  = ( e ) => { console.log( "failed: " + e.toString() ); };
const success = ( r ) => { console.log( "success: " + r[keys[keys.length-1]] ); };

C.run( failed , success );