# Shared Tree Primer

## Fluid Framework

The Fluid Framework is a client/server tech stack designed to intuitively synchronize data between clients in real time.
The framework consists of 3 key parts: the Fluid Service, Fluid Runtime, and Distributed Data Structures (DDSes).
The Fluid Service handles sequencing and broadcasting changes (ops) to each client and persisting state to storage.
The Fluid Runtime handles sending local ops to the Fluid Service and handling incoming ops.
The DDSes are the data structures that create and consume the Ops that the Fluid Service and Fluid Runtime keep synchronized.

From the perspective of an application developer, using the Fluid Framework is largely an exercise in choosing the right DDSes and integrating them into the application.
For example, one of the simplest DDSes is a Shared Map that can be used in much the same way a developer would use a standard JavaScript map.
The key difference is that a Shared Map will reflect remote changes from other clients.

## Hierarchical Data

Shared Tree is a DDS designed to keep hierarchical data synchronized between clients.
Its development is being driven by significant feedback from developers looking for Fluid data structures that map more closely to document object models, inheritance trees, and other common use cases for hierarchical data.
There is no straightforward way to model such data structures using Fluid Framework today.

Fluid Framework’s public documentation currently offers one general purpose data structure: Shared Map.
This DDS is easy to understand and use, but trying to model hierarchical data in Shared Maps leads to complex and difficult to maintain plumbing.
Furthermore, it is very challenging to manage relationships between and reason over data in different DDSes.

Within Microsoft, many teams use the Shared Directory DDS.
It is, effectively, a data structure that makes it easier to create maps within maps to build a hierarchical data model.
The creation of Shared Directory was a direct response to internal demand for support for hierarchical data;
however, Shared Directory has most of the same limitations as a map of maps and doesn’t offer a particularly intuitive programming model.

Without robust support for a hierarchical data model, we’ve seen limited engagement from potential customers.
In cases where customers have engaged, they have either invested in building their own hierarchical DDS (Property DDS from Autodesk and Experimental Shared Tree from Whiteboard) or they have adopted one of those experimental DDSes.
In fact, except for Microsoft Loop, all partners currently tracked by the Fluid Framework team are using Property DDS or Experimental Shared Tree.

This reality led to investment in a new Shared Tree DDS that is a fully supported part of Fluid Framework.
The goal of this investment is to replace both Experimental Shared Tree and Property DDS by combining the best elements of each of them.

## Usability

Shared Tree will present customers with an intuitive and familiar programming interface for modeling data.
Defining schema will be no harder than defining a set of types and their relationships.
Adding data to the tree will be as simple as creating objects and collections of objects.
Updating that data will be much the same as updating any object.

As the data in the tree is changed by multiple clients concurrently, Shared Tree will include events that allow customers to track merged changes at the sub tree level.
This will make it easier to write clean, efficient, and easy to manage code.

## Data Model

While Shared Tree will be very approachable, it is also very powerful.
It is designed to support a broad range of data types and internal data structures.
And it is architected to support features like transactions, where a set of changes are bundled together and are merged (or not) atomically, and move, where a sub tree is moved to a different part of the tree while any concurrent changes to that data are still applied correctly.

Further, Shared Tree has been designed to support future investments in sophisticated features like History, Branching, Offline, and Very Large Data Sets.

At the heart of the Shared Tree design is the code responsible for merging changes: Rebaser.
Rebaser supports different merge semantics for different types of data.
Furthermore, rebaser can enforce schema and other custom constraints on a data set.
And Rebaser is able to reason over a set of changes and produce a merged result without requiring access to the entire tree.

## TODO

The current feature focus is on:

-   Semantics:
    -   High quality intention-preserving merges, including moves of parts of sequences.
    -   Schema enforced during merges to guarantee data consistency.
    -   Transactionality and atomicity.
    -   A flexible constraint system to preserve application invariants during concurrency.
    -   High-level commanding layer to capture deeper intent during editing.
-   Scalability:
    -   Efficient storage, including compact data encodings and virtualization/incrementality.
    -   Support for partial checkouts: allow efficiently viewing and editing parts of larger datasets without downloading the whole thing.
    -   Accelerated queries via synchronized, persisted indexes.
-   Expressiveness:
    -   Graph-like references between areas of the tree.
    -   Efficient support for moves, including moves of large sections of sequences and large subtrees.
    -   History operations (ex: undo and redo).
    -   Flexible schema system that has design patterns for making schema changes over time.
