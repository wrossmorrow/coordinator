# Coordinator

This is a `node.js` module for specifying asynchronous operations in a Directed Acyclic Graph (DAG) structure. That is sequences of tasks that must be completed, where some may depend on the results of others (without cycles). Everything you need is in the single file `coordinator.js`. 

### A Simple, Motivating Example

The basic use case motivating this module was the following: We have a web app backend server that has to make several (async) database calls for a particular API route; but we want to reply to the calling client with "success" _only_ if *all* database updates were succesful, and with "failed" if *any* failed (also negating any partial updates). In this case it is possible to nest callbacks, but after 3 or 4 updates this starts to get confusing especially when including logic for rolling back successful updates. Nesting callbacks also imposes a logic order on the program flow that need not formally exist for properly concurrent operations. Basically, we don't care which happens (or finishes) first, just that they both finish (and if they both succeeded). 

### Concurrent Operations with Coordinator

`coordinator.js` allows one to do this as follows: Say we write functions `op1ex`/`op1rb` to execute/rollback operation "1", `op2ex`/`op2rb` to execute/rollback operation "2", etc. Suppose also we have functions `onFailure` and `onSuccess` that we want to execute when *any* operation fails or *every* operation succeeds, respectively. Then the code
```
const Coordinator = require( 'coordinator.js' );
var C = new Coordinator();
C.addStage( "op1" , op1ex , op1rb )
C.addStage( "op2" , op2ex , op2rb )
C.run( onFailure , onSuccess )
```
will execute operations "1" and "2" concurrently, calling `onFailure` if *any* operation fails or `onSuccess` if *every* operation succeeds. Moreover, if `op1ex` fails but `op2ex` succeeds, `op2rb` will be called and vice versa. Besides being a bit simpler than (many) nested callbacks, the explicit separation between operations "1" and "2" can also make it easier to program and debug them. 

### Other Features

Some other features: 

* **Retries:** `C.addStage( "op1" , op1ex , op1rb , 2 )` will retry this operation twice before declaring "failure"
* **Prerequisites:** `C.addStage( "op2" , op2ex , op2rb , 0 , ["op1"] )` declares that operation "2" has to follow operation "1"'s success
* **Intermediate results:** `C.addStage( "op2" , op2ex , op2rb , 0 , ["op1"] , op2prep )` will run `op2prep` on results of operation 1 and pass those to `op2ex`
* **Initial data:** `C.addStage( "op2" , op2ex , op2rb , 0 , ["op1"] , op2prep , op2data )` will pass `op2data` to `op2ex` when it executes 
* **Intermediate Data Transformation:** Actually, `op2prep` acts on _both_ `op2data` and the results of prior operations to result in a single data object to pass to `op2ex`
* **Warnings:** You can declare success in your execution routines even if you want to "throw" a warning, and the `Coordinator` object (`C`) will keep track of these warnings
* **Results:** Your `Coordinator` object (`C`) will store all the results from each operation, if there are any, and you can access these after processing is complete (i.e., in the `onSuccess` callback you pass to `C.run`)

### Execution/Rollback Routine Prototype

We haven't mentioned how tasks can "fail" or "succeed". Really, this is up to you in your execution (and rollback) routines. `Coordinator` _learns_ about this through callbacks passed to the execution and rollback routines, which must both have the prototype
```
( data , failure , warning , success ) => { ... }
```
`Coordinator` expects these routines to call `failure(err)` (with an error argument) when there is an error, `warning(warn,res)` when there is a conditional success (with a warning and result objects), and `success(res)` when there is success (with a result object). 



