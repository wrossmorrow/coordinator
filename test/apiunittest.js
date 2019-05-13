
const Coordinator = require( './../src/Coordinator.js' );

APIUrl = "https://your.url.com/v1/api"

const getIdFromResponseData = ( data ) => {
	return data[0];
}

var data = { 
	key1 : "value1" ,
	key2 : "value2" ,
};

// create coordinator object
C = new Coordinator();

// put the object in the database
C.addStage( { 
	key 	 : "put" , 
	execute  : ( data , failure , warning , success ) => {
		axios.put( APIUrl + "/object" , data ) 
			.then( res => { success( getIdFromResponseData( res.data ) ); } )
			.catch( err => { failure( err ); } )
	} , 
	rollback : ( data , failure , warning , success ) => {
		axios.delete( APIUrl + "/object/" + data.id )
			.then( res => { success( ); } )
			.catch( err => { failure( err ); } )
	} , 
	repair   : ( data , prereqs , results ) => ( { id : results["put"] } ) ,
	data 	 : data
} );

// does the object exist? 
C.addStage( { 
	key 	 : "check" , 
	execute  : ( data , failure , warning , success ) => {
		axios.head( APIUrl + "/object/" + data.id ) 
			.then( res => { success(  ); } )
			.catch( err => { failure( err ); } )
	} , 
	prereqs  : [ "put" ] , 
	prepare  : ( data , prereqs , results ) => ( { id : results["put"] } ) ,
} );

// get the object, compare values
C.addStage( { 
	key 	 : "get" , 
	execute  : ( data , failure , warning , success ) => {
		axios.get( APIUrl + "/object/" + data.id ) 
			.then( res => { success(  ); } )
			.catch( err => { failure( err ); } )
	} , 
	prereqs  : [ "put" ] , 
	prepare  : ( data , prereqs , results ) => ( { id : results["put"] } ) ,
} );

// delete the object
C.addStage( { 
	key 	 : "delete" , 
	execute  : ( data , failure , warning , success ) => {
		axios.delete( APIUrl + "/object/" + data.id ) 
			.then( res => { success(  ); } )
			.catch( err => { failure( err ); } )
	} , 
	prereqs  : [ "check" , "get" ] , 
	prepare  : ( data , prereqs , results ) => ( { id : results["put"] } ) ,
} );

// recheck after delete, object should be gone
C.addStage( { 
	key 	 : "recheck" , 
	execute  : ( data , failure , warning , success ) => {
		axios.head( APIUrl + "/object/" + data.id ) 
			.then( res => { failure(  ); } )
			.catch( err => { 
				if( err.response ) {
					if( err.response.status === 404 ) { success(  ); }
					else { failure(); }
				} else { failure(); }
			} )
	} , 
	prereqs  : [ "delete" ] , 
	prepare  : ( data , prereqs , results ) => ( { id : results["put"] } ) ,
} );

// success/failure callback
const success = ( r ) => { console.log( "success" ); };
const failure = ( e ) => { console.log( "failure" ); };

// ok, run the coordinator
C.run( failure , success );
