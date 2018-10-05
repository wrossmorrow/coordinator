# Coordinator

This is a `node.js` module for specifying asynchronous operations in a Directed Acyclic Graph (DAG) structure. That is sequences of tasks that must be completed, where some may depend on the results of others (without cycles). Everything you need is in the single file `coordinator.js`. 

The basic use case motivating this module was the following: We have a web app backend server that has to make several (async) database calls for a particular API route; but we want to reply to the calling client with "success" _only_ if *all* database updates were succesful, and with "failed" if *any* failed (also negating any partial updates). In this case it is possible to nest callbacks, but after 3 or 4 updates this starts to get confusing especially when including logic for rolling back successful updates. Nesting callbacks also imposes a logic order on the program flow that need not formally exist for properly concurrent operations. 

`coordinator.js` allows one to do this simple as follows: Say we write functions `op1ex`/`op1rb` to execute/rollback operation "1", `op2ex`/`op2rb` to execute/rollback operation "2", etc. Suppose also we have functions `onFailure` and `onSuccess` that we want to execute when *any* operation fails or *every* operation succeeds, respectively. Then the code
```
const Coordinator = require( 'coordinator.js' );
var C = new Coordinator();
C.addStage( "op1" , op1ex , op1rb )
C.addStage( "op2" , op2ex , op2rb )
C.run( onFailure , onSuccess )
```
will execute operations "1" and "2" concurrently, calling `onFailure` if *any* operation fails or `onSuccess` if *every* operation succeeds. Moreover, if `op1ex` fails but `op2ex` succeeds, `op2rb` will be called and vice versa. 

