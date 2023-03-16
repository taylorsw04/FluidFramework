# Shared Tree: Feature List

This document lists and describes the major completed, in-progress, and planned functionality/features that comprise the Shared Tree project.
This is not an exhaustive catalog of all features or future-facing work; it focuses primarily on those that enable key scenarios. Shared Tree is an evolving project, and everyone interested in Fluid should feel empowered to bring their own voice to the conversation.

See the [Shared Tree primer](./primer.md) for a non-technical overview. See the [project overview](docs/project%20overview.md) to gain an understanding of the project and its status.

# Features

## Rebaser core architecture

> Complete

In Shared Tree, the core algorithms for processing edits should preserve the intention of concurrent edits as it rebases them.
It needs to do this while also supporting very large documents—potentially larger than client memory.
The scaling requirement means that these algorithms should be able to operate without reifying (loading/reading) the tree data and should be a function only of the operations themselves.
The intention preservation requirement dictates that all editing operations should have an intuitive effect on the tree even during concurrency.

This work falls into four areas:

-   (`Rebaser`): A library for handling branches and rebasing of edits between them which is independent of the specific types of edits
-   (`modular-change-family`): Implementations of the actual edits to apply in the above library
-   (`EditManager`): Integration of the branching model with Fluid Framework
-   Future source control-style features, like branching/merging/offline.

This feature specifically refers to the first bullet here.

## Distributed Short Identifier Allocator

> Complete

Supporting larger-than-memory data sets in the tree requires efficiently handling trees that contain large numbers of strong identifiers (UUIDs).
To meet this requirement, Shared Tree leverages a novel distributed compression scheme that reduces the average storage cost of the identifiers to that of a small integer.
This enables better scaling in scenarios where large numbers of these compressed IDs are needed (e.g., graph-like references).
The documentation for this scheme can be found [here](../src/id-compressor/idCompressor.ts#L272).

[Strong node identifiers and lookup index](#strong-node-identifiers-and-lookup-index) uses unique identifiers on nodes.
These need to be allocated in a distributed way while avoiding collisions.
A trivial implementation of this is to randomly generate [Version 4 UUIDs](<https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)>).

To reduce the space these consume, and improve performance when using them, it is desirable to have a system which can allocate compressible (for example sequential) smaller identifiers that can fit in JavaScript's number type.
The implementation of the compression scheme that accomplishes this can be found [here](../src/id-compressor/idCompressor.ts#L272).

## Data model specification

> Complete

Shared Tree has a number of requirements that have a direct impact on the tree data model.
These include schema annotations on nodes, strong identifiers, references in the tree, and JSON interoperability.
The team designed a low-level data model that accommodates them; it is JSON-like, but with a few key divergences.
The specification can be found [here](../docs/data-model/README.md).

## Insert/modify/delete

> Complete

This feature enables developers to use Shared Tree for scenarios involving simple data manipulation.
Insert, delete, and modify operations will be functional; however, advanced editing features such as the [move](#move) operation and [constraints](#constraints) are not yet available.

## Tree reading and writing without reification

> Complete

In most scenarios, the Shared Tree will construct an in-memory JavaScript representation of the tree.
This feature makes it possible to read and write data to the Shared Tree without creating (reifying) that in-memory JavaScript representation.
This is particularly useful in scenarios where the client has memory constraints or wants to maintains a copy of the data on the other side of an interop boundary (e.g., WASM, C++).
It also allows clients/microservices to check permissions without loading the document and inspect changes without caring about the entire tree.

To accomplish this, the underlying Shared Tree layer is built on a [cursor API](../src/core/tree/cursor.ts) that allows navigation of the tree by moving from node to node via explicit directional calls.
Layers built on cursors are also able to remain agnostic to the structure of the tree it is navigating, allowing for flexible/multiple implementations.
This cursor API is intended to be an expert API as working with it is more cumbersome compared with the more ergonomic APIs exposed in other feature milestones.

While this is an important architectural component to build in early, the benefits around reification will not be fully realized until the [Storage performance: incrementality and virtualization](#storage-performance-incrementality-and-virtualization) feature is complete, as downloading the entire tree on load is currently required.

## Isolation of synchronous non-overlapping transaction

> Complete

Developers often want to group changes to the Shared Tree into logical units.
Reasons for doing so include:

-   Atomicity: a set of changes should be applied without any other changes (local or remote) being interleaved with them.
-   App semantics: a set of changes represents a logical edit in the application model that must be applied atomically, and tree-level operations (such as undo/redo or history) should never result in an intermediate state being exposed.
-   Dependencies between changes: changes within a grouping depend on some invariant (e.g., an insert should be applied only if none of the other changes in its group fail to apply due to concurrent edits).

This feature enables the creation of a single synchronous transaction per Shared Tree and guarantees the changes bundled in the transaction will be applied without interleaving of other changes.
This is true for transactions made locally, as well as transaction received from peers.

This feature does not include support for atomicity of transactions (see [constraints](#constraints)) or [multiple concurrent transactions](#asynchronous-transactions-and-snapshot-isolation).
See also [undo/redo](#undoredo).

## Tree reading and writing with JS object style API

> In progress

A key objective of Shared Tree is that it be intuitive and easy for developers to use.
To enable this, Shared Tree will include a high-level API that presents the tree as if it were composed of JavaScript objects.
This is ideally suited for developers who prioritize familiarity and speed of development over low-level performance.
Note that this API does not include any [strong typing](#type-safe-schema-api) from the [schema](#schema-and-schema-enforcement).

This API is called the Editable Tree API and is [here](../src/feature-libraries/editable-tree/README.md).

## Eventing

> In progress

The fluid framework has a robust event system in place for reacting to changes to distributed data structures.
The Shared Tree should integrate into this system and provide developers an ergonomic way to register for events corresponding to tree changes.

This feature exposes the ability to register for change events on the EditableTree interface.
The new events, which are registered on specific nodes, include node value changes and changes to a specific subtree.

## Undo/redo

> In progress

The ability to undo and redo changes is table stakes for a collaborative editing system.
However, there are a variety of possible specifications with varying levels of complexity.

For this feature, Shared Tree offers an [undo/redo mechanism](./undo/README.md#v1-undo) that generates the inverse of a given edit (most frequently the most recent local change group but not necessarily) and applies it to the document.
This simple implementation is easy to reason about but can lead to cases where concurrent changes can render the inverse edit inconsistent with the user's intent (e.g., conflicted or unapplied).
In a future feature, alternative designs are explored that better handle these cases.

## Move

> In progress

Conceptually, a move is simply a delete and an insert of the same data.
However, without proper semantics (and thus rebasing), concurrent changes can result in missing or duplicated data.
The move operation preserves the identity of the nodes being moved and ensures that the outcome matches the developer's expectations.

Shared Tree will support two types of move operation.
One is a **node range** move where the nodes in the range when the edit is first issued are the only nodes that move.
The other is a **slice range** move where the nodes in the range when the edit is applied are the nodes that move.

## Strong node identifiers and lookup index

> In progress

This feature allows all nodes to optionally include a unique identifier that allows that node to be referenced without specifying the path to that node within the tree.
This is critical in cases where nodes need durable references pointing to them (both within the tree—graph-like references—and in external cases such as URLs), as changes to the tree can invalidate path-based references.
These identifiers are stored as compressed integers for storage and performance reasons but can be translated into UUIDs when requested.

The Shared Tree will maintain an index of all nodes with identifiers to provide fast look-ups.

## Asynchronous transactions and snapshot isolation

> In progress

In applications with complex editing flows, particularly in asynchronous programming models, it can be unergonomic or insufficient to use synchronous and non-overlapping transactions.
In such cases, it is desirable to allow multiple transactions to exist concurrently on the same local instance of the Shared Tree while still guaranteeing isolation from other changes, both local and remote, during their lifetime (i.e., snapshot isolation).
They should also be able to operate asynchronously, allowing transactions to span multiple JS frames.
This feature will enable the construction of such transactions, each of which operates on an isolated view of the tree determined by start of the transaction.

As an example, consider a flow in which a developer initiates a call to some external service.
It may be desirable to immediately show some temporary value (e.g., a placeholder value) in the tree and add the results of the async external call to it when it completes.
However, the edit to the tree should only finish and be sent to other clients if/when the service call finishes.
Additionally, the developer may want to prevent incoming changes from taking effect until after this flow completes, as it may be confusing or even inconsistent during the intermediate state.
Implementing this correctly requires both asynchrony and snapshot isolation in the transaction layer.

## Embedded collections (e.g., sets, maps)

> Pending

While the Shared Tree data model is very flexible, developers may find themselves requiring that a subset of their data model has a more specific or performant representation.
One such example would be modeling an associative relationship using a key/value store.
In these cases, however, it is still required that their data receive the same benefits (e.g., identity, schema, move semantics) as when it is stored as nodes in the rest of the tree.
This feature accommodates these needs by allowing embedded collections that are managed by the Shared Tree and its rebasing mechanisms.
Initially, only sets and maps will be offered;
however, the architecture allows easy extension in the future to include more domain-specific options.

## Constraints

> In progress

By default, edits (i.e., transactions) in Shared Tree will always succeed (never conflict) due to the high-quality automatic merge resolution.
Transactions always guarantee atomicity (no interleaved changes from other transactions), but some changes may not have an effect due to concurrent edits that are applied first
(e.g., a transaction that changes two nodes may only apply a subset of the changes due to one of the nodes being concurrently deleted).
While convenient and usually sufficient, this behavior may not appropriately uphold application invariants.

This feature enables a developer to declaratively specify what sorts of concurrent edits should cause a transaction to fail and be marked as conflicted.
These declarations are known as constraints and are evaluated as the edit (transaction) is applied.
The constraints delivered initially include specifying that a given node still exists and specifying that a given node's value has not been edited.

## Schema and schema enforcement

> In progress

Schema determines how the data in the Shared Tree is structured and modified based on user-defined rules.
Nodes in the tree include a _type_ field;
these types are associated with rules that govern the shape of the data (e.g., which types are allowed in which fields).
This metadata is stored in the tree ([schema specification](../src/core/schema-stored/README.md)) and the Shared Tree uses it to guarantee that data conforms to the schema even in the face of concurrent editing.
This feature exposes the ability to author a schema, create schematized data, and guarantees that edits will never violate that schema.
It does not provide a type-safe way to view the data—that is enabled by the [type-safe schema API](#type-safe-schema-api) feature.

## Lossless JSON roundtripping

> In-progress

Many customer scenarios include the need to migrate existing data into the Shared Tree and export that data.
Due to its ubiquity, JSON data is the focus of this feature.
The Shared Tree provides two mechanisms to import and export JSON data losslessly:

-   A [JSON domain](../src/domains/json/jsonDomainSchema.ts) (schema) that defines the mapping between the Shared Tree data model and JSON.
    This includes a [low-level cursor](../src/domains/json/jsonCursor.ts) to navigate the data as though it were native JSON.
-   APIs to ingest JSON data into a subtree typed as JSON as well as export a JSON-typed tree to raw JSON.

These APIs are as lossless as JavaScript's own JSON API, so the same [caveats](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON) apply.

## Large sequence & collaborative text support

> Pending

Based on feedback from developers already building apps with Fluid, there is a clear need to include support for collaborative text within the Shared Tree.
This will require support for larger sequences of nodes than is otherwise typical.
This feature will include investments to make large sequences performant and scalable while still handling efficient collaboration.
Of course, large sequences will not be limited to text, as text nodes all have the same characteristics as any other node in the tree.
For example, they can be moved, they have identity, changes can be easily reverted, etc.

## Storage performance: incrementality and virtualization

> Pending

Applications built on Shared Tree should be able to handle large datasets without paying hidden performance costs in load time or summarization.

Incrementality breaks the tree up into discrete chunks of nodes that are the unit of invalidation (re-upload) for changes to the tree.
This allows DDS summarization performance to scale with the scope of the content that has changed rather than the amount of total content in the DDS.
This drastically reduces latency and network bandwidth and is a precursor to supporting larger than memory datasets.

Virtualization allows the client to download portions of the tree on demand rather than downloading the entire tree on boot.
This will dramatically improve load performance and is another precursor to supporting larger than memory datasets.

This feature enables both for the tree.
A long-form design proposal for these features exists [here](../docs/storage/treeStorage.md).

## Type-safe schema API

> Pending

While schema definition and enforcement provide important data consistency guarantees, it does not prevent developers from writing bugs related to mismatched data types.
For example, an attempt to interpret a nodes data in a way that is incompatible with its type (e.g., assuming a node contains a string when the schema dictates that it is a number) will result in a runtime failure.
Developers must have an ergonomic way to work with the tree that prevents these bugs at compile-time.

In this feature, Shared Tree provides automatically created TypeScript types that map to the names and concepts defined in the schema.
Using these types allows users to read and write to the tree at a higher and more comfortable level of abstraction.
For example, a _Point_ type would allow reading of the numeric _Point.x_ and _Point.y_ fields in a way that is agnostic to the underlying tree representation.
This feature results in a much better integration with tooling, including autocomplete and intellisense.

## Retroactive undo/redo

> Pending

This feature enables a more complex and semantic form of undo/redo.
Under this design, undo modifies the document in a way which both inverts the effect of a given change and adjusts the effect of that change on changes which came after it.
For example, retroactively undoing a deletion would also apply edits to the deleted content which had previously failed due to their target being deleted.
Retroactively undoing an edit might also cause the undoing of later transactions which would not have been valid if the original edit had not been made.
One potential retroactive undo policy would be to set the document to the state it would have been in if the undone change had never been made.

## History

> Pending

There are many scenarios where developers need the ability to present data as it appeared at some point in the past.
This is particularly valuable in cases where that data is being changed by multiple users, often concurrently.
Developers need to be able to answer the question: what happened here?

This feature introduces the History feature which will provide a way for developers to access an immutable view of the tree as it appeared in the past.
The feature will be scoped to the entire tree initially but will eventually be refined so that developers can show history for specific areas of the tree.

## Branching and Merging

> Pending

In some cases, it is desirable that users be able to operate on data in isolation.
Maybe they are going to be working offline or making changes to data where concurrent changes would be disruptive.
Whatever the scenario, the requirement is for Shared Tree to support branching and merging parts of the tree in much the same way that source control such as Git.
This feature introduces the ability for developers to create branches from parts of the tree, rebase those branches, and merge the changes back to the main branch.

## Indexes

> Pending

Developers often need to make complex queries about the tree that may not align with the hierarchy/structure of their data model.
Some examples of this type of query include:

-   Searching for all entities within a 2D plane that intersect some bounding box
-   Searching for all graph-like references that point to nodes of a particular type
-   Finding all nodes holding an integer with an odd value
-   Finding the best cached image for a sub-plane (i.e. tiling)

With small documents, it may be reasonable to compute an answer by navigating the tree directly (and perhaps exhaustively).
As datasets scale, developers will likely need to accelerate these read operations in order to keep them performant.
It is convenient to do this by storing an index that is specialized to answer these queries.
In the 2D plane example above, this index could be implemented via a [spatial search tree](https://en.wikipedia.org/wiki/Spatial_database#Spatial_index) that stores the positions of nodes in the tree.

It is also desirable to store these indexes alongside the Shared Tree data itself, rather than keeping it in a secondary store or recomputing it on each document load—which itself may be infeasible with larger-than-memory documents.
However, it would be burdensome to expect a developer to handle all the complexity of index maintenance, which includes serialization and integration with branching and async transactions.

In this feature, Shared Tree exposes an extension point that allows developers to create their own persisted indexes while providing built-in solutions for much of the complexity of the integration.

## High-level commands

> Pending

While [constraints](#constraints) and [schema](#schema-and-schema-enforcement) offer powerful ways to ensure an application's data model is never violated, they enable such guarantees by explicitly creating conflicts when their invariants are violated.
These conflicts, if the application does not react to them, can be a form of data loss if the rejected change contained data a client cares about.
Attempting to repair the outcome of a merge of conflicting edits “after the fact” is a challenging problem, one whose difficulty will grow non-linearly as the number and complexity of edits increases.

An approach that places far less burden on application developers is to let them structure their edits in a manner that captures end users’ intent as precisely as possible.
This model requires that edits are structured as _commands_ whose parameters are organized into tree references that the system understands and opaque parameters understood only by the command author.
When a local edit is rebased against a conflicting edit by another user, the local edit can simply be rolled back, the conflicting edit applied first, and the command that produced the local edit then re-executed, as if the user had applied it under these new circumstances in the first place.
The Shared Tree can use heuristics to adjust the tree reference parameters as necessary before the command is executed, meaning the handles passed to the command may be a best approximation of those originally supplied when the user first ran the command.
Even if the command author does nothing else, many merge scenarios will yield better outcomes with this model than one that attempts to modify primitive operations applied to the tree.

As an example, if User A adds a row to a table and User B concurrently adds a column, the table will be well-formed regardless of the eventual order of these edits, as would be the case if they were executed in either order on a single client.

This feature explores this command model, how it interplays with other features such as constraints, and how it handles edge-cases such as code availability and versioning.

## Partial checkout

> Pending

Shared Tree document scaling must not be limited by client memory (or even client disk size).
It must be feasible to load and collaborate on documents of any size and still enjoy the low-latency, intention-preserving editing experience provided by the tree.
For exceptionally large documents it is likely that the number of concurrently editing clients vastly exceeds the number of clients editing the same region of the tree.
This means that each client would receive, process, and ignore most edits—resulting in computational waste and bottlenecks.

The [storage performance: incrementality and virtualization](#storage-performance-incrementality-and-virtualization) feature ensures that document load times and summarization performance (both bandwidth and CPU time) are not limiting factors in these cases.
This feature introduces a _partial checkout_: a partial view of the tree registered with the server during document load.
The view (a subset of the tree) is dynamic and can be expanded by navigating the tree.
The server provides op filtering to ensure that a client only receives the edits that apply to the region of the tree that they are viewing.
