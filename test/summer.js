
const X = {
	"bob" : 2 , 
	"sue" : 3 , 
	"joe" : 4 ,
}

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
	C.addStage( key , sumr , () => {} , 0 , p , prep , X[key] );
	p = [ key ];
}

C.run( 
	() => { console.log( "failed" ) } , 
	() => { 
		console.log( "success: " + C.getResults()[keys[keys.length-1]] );
	}
);