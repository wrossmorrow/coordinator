
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
	C.addStage( key , sumr , () => {} , 0 , p , prep , null , X[key] );
	p = [ key ];
}

C.quiet();

const failed  = ( f , e ) => { console.log( "failed" ); if( f ) { f( e ); } };
const success = ( s , r ) => { console.log( "success: " + r[keys[keys.length-1]] ); if( s ) { s( r ); } };
const execute = ( d , f , w , s ) => { C.run( failed.bind(this,f) , success.bind(this,s) , d ); };

var D = new Coordinator();

D.addStage( { key : "run1" , execute : execute , data : X } );

X.bob = 3;
D.addStage( { key : "run2" , execute : execute , prereqs : ["run1"] , data : X } );

X.sue = 10;
D.addStage( { key : "run3" , execute : execute , prereqs : ["run2"] , data : X } );

D.run( () => { console.log( "failed" ); } , () => { console.log( "success" ); } );