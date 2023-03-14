# Shared Tree: Project Overview

This document serves as an up-to-date view of the Shared Tree project, including the delivery milestones, the status of the current work, and future plans.

For more information on Shared Tree, including code examples and a high level description, see the [readme](../README.md).

# Focus Areas

The project is separated into three primary focus areas: **functionality**, **performance**, and **stability**.
The next sections detail the high-level goals for each area.
The individual investments of the Shared Tree project are roughly bucketed into a set of workstreams that roll up to the focus area to which they accrue value.
While these can often be implemented in parallel, there are often dependencies across them. Those dependencies and the progress in each workstream are detailed in the [roadmap](#roadmap) section.

## Functionality

The Shared Tree is composed of a uniquely expressive feature set that allows developers to easily build collaborative experiences, whether they are starting from scratch or adapting to an existing data model.
This area focuses on the tree can do this while being ergonomic and extensible.
It is covered much more extensively in other documents.
For a full list of the major features (existing and planned) in Shared Tree, see the [feature list](feature%20list.md).
For a better understanding of the value proposition of Shared Tree, see the [primer](primer.md).

Workstreams that accrue to _functionality_:

-   **Core concept designs**
-   **Basic functionality**
-   **Move**
-   **Ergonomics**
-   **Schema**
-   **Collections**
-   **Advanced collaboration**

## Performance

Fast performance lies at the heart of the Fluid Framework vision.
It was designed from the ground up to minimize latency introduced by servers by shifting merge responsibilities to the client.
Upholding and taking full advantage of this architecture is the top priority for Shared Tree.
These are the near-term performance goals:

-   Equivalent or better performance as compared with the experimental Shared Tree DDS
-   Include granular performance benchmarks for each Shared Tree component including reading and writing of the in-memory tree and merging changes
-   Build a benchmarking stress test app to set baselines and measure improvements
-   Architect the tree such that the lowest layers provide the best performance at the cost of ergonomics; build more friendly (but potentially slower) APIs on top, enabling applications to choose their preferred layer

As the Shared Tree feature set grows, the performance goals will also evolve to include the following:

-   Tree reading will be a reasonable constant factor as compared with reading a JS object tree as the tree grows in size and complexity
-   Collections within the tree such as long sequences, maps, and sets will be optimized
-   Summarization performance will scale with the scale of the data being changed – currently summarization performance is determined by the size of the complete data set
-   Boot performance can be optimized by loading only the data required through virtualization

Workstreams that accrue to _performance_:

-   **Scale**
-   **Performance testing**

## Stability

Shared Tree is a complex DDS aimed at supporting a broad range of data types and merge semantics.
As such, it is critical that Shared Tree investments include significant focus on reliability.
The following are some of the investments that will ensure Shared Tree is reliable and remains stable as it evolves:

-   Roughly 80% unit test coverage
-   Fuzz testing of all major components
-   Two or more test apps built on Shared Tree that are used to validate every significant update
-   Code for types and persisting state is isolated and policies are in place to ensure stable migrations between versions
-   Forwards and backwards compatibility tests
-   API lifecycle tooling to ensure smooth version rollouts

Workstreams that accrue to _stability_:

-   **Stability testing**
-   **Publishing**

# Roadmap

## Milestones

The Shared Tree project has many milestones, each of which enable a set of application scenarios.
Many share dependencies and they are often worked on in parallel.
The current milestones are:

-   **Basic data synchronization [COMPLETE]**
    -   For developers eager to start using the Shared Tree DDS, this milestone represents the point where they can do so for scenarios involving transient data.
        That is, at this stage developers can create a Shared Tree from other data and use it to sync that data between all clients.
        Insert, delete, and modify operations will be functional; however, the storage formats will not be final at this stage.
        There will be no data migration strategy for the data stored in the Shared Tree DDS at this stage.
        The move operation is also not yet available.
-   **Parity with Legacy Shared Tree [IN PROGRESS]**
    -   This milestone enables developers who were previously using the [legacy (experimental) Shared Tree](https://github.com/microsoft/FluidFramework/tree/main/experimental/dds/tree) to migrate to the Shared Tree.
        At this point, Shared Tree has feature, performance, and stability parity with its legacy counterpart; developers should switch to the new tree as the legacy version will not be under active development.
-   **Parity with PropertyDDS [IN PROGRESS]**
    -   This milestone enables developers who were previously using the [PropertyDDS](https://github.com/microsoft/FluidFramework/tree/main/experimental/PropertyDDS) to migrate to the Shared Tree.
        At this point, Shared Tree has feature, performance, and stability parity with PropertyDDS; developers should switch to the new tree as PropertyDDS will not be under active development.
-   **Larger-than-memory documents**
    -   This milestone enables documents to scale to arbitrarily large sizes, including those beyond the limits of client memory (or even disk).
        Applications will be able to view a subset of a document and build real-time collaborative editing flows on that subset regardless of the number of connected clients of the total size of the document.
-   **Git-style workflows**
    -   This milestone enables developers to build collaborative experiences that leverage the power of a source-control model, including branching, merging, viewing the history and rewinding to arbitrary points in time, and high-quality merge resolutions after being offline.
-   **Data consistency**
    -   This milestone provides powerful tools to ensure that data within the tree remains consistent with an application's data model regardless of concurrenct editing;
        these tools include the guarantee of data adhering to schema, the ability to specify when edits should conflict, and a high-level command model to capture editing intention.
        These empower developers to explore more complex and semantic collaboration scenarios.

## Current status

The following diagram shows the project's current progression towards delivering different milestones.

Milestones are displayed as blue diamonds:

```mermaid
flowchart LR
m{Milestone}
classDef default fill:#5db7de,stroke:#000,stroke-width:2px,color:#000;

```

The status of items within workstreams are shown via colors:

```mermaid
flowchart LR
n[Not started]
p[In progress]
c[Complete]

classDef NotStarted fill:#8a8a8a,stroke:#000,stroke-width:1px,color:#ffffff;
class n NotStarted;

classDef InProgress fill:#f5e39d,stroke:#000,stroke-width:1px,color:#000;
class p InProgress;

classDef Complete fill:#a5f59d,stroke:#000,stroke-width:1px,color:#000;
class c Complete;

```

> Tip: learn more about each item by reading the [feature list](feature%20list.md).

```mermaid
---
title: Shared Tree Roadmap
---
flowchart LR
    subgraph Schema
        schema_enforcement[Schema - definition & enforcement]
        json[JSON roundtripping ???]
    end
    subgraph Basic[Basic functionality]
        undo_redo[Undo/redo]
        identifiers[Node identifiers + lookup index]
        sync_transactions[Synchronous transactions]
        local_branches[Local branches]
        async_transactions[Asynchronous transactions]
        sync_transactions-->async_transactions
        local_branches-->async_transactions
        stashed_ops[Stashed ops support]
        atomicity[Atomic transactions]
        imd[Insert/Modify/Delete]
    end
    subgraph Ergonomics
        js_api[JS object style API]
        schema_aware_api[Schema aware tree API]
        schema_enforcement-->json
        schema_enforcement-->schema_aware_api
    end
    subgraph Move
        move_range[Move - node range]
        move_slice[Move - slice range]
        move_range-->move_slice
    end
    subgraph Scale
        cursor[Cursor]
        storage[Incrementality/virtualization]
        partial_checkout[Partial checkout]
        indexes[Persisted indexes]
        cursor-->partial_checkout
        storage-->partial_checkout
        id_allocator[Short IDs - Allocator ]
        ids_in_runtime[Short IDs - Runtime integration ]
        id_allocator-->ids_in_runtime
        ids_in_runtime-->identifiers
        large_sequences[Large sequence support]
        id_allocator-->large_sequences
    end
    subgraph Design[Core concept designs]
        rebaser[Rebaser architecture design]
        data_model[Data model specification]
        modularity[Modularity]
    end
    subgraph Advanced[Advanced collaboration]
        retro_undo[Retroactive undo/redo]
        history[History]
        branch_merge[Branching and merging]
        storage-->indexes
        commands[High-level commands]
        constraints[Constraints]
    end
    subgraph Collections
        embedded[Embedded collections]
        map_set[Maps & sets]
        text[Collaborative text]
        embedded-->text
        embedded-->map_set
        extensible_collections[Extensible collections]
        embedded-->extensible_collections
        large_sequences-->text
    end
    subgraph Testing
        performance_validation[Performance benchmarking/validation]
        fuzz_testing[Fuzz testing]
        unit_testing[Unit testing]
        coverage[80%+ test coverage]
        perf_playground[Performance playground app]
        test_app[Test app]
    end
    subgraph Publishing
        public_api_finalization[Public API finalization]
        format_stability_policy[Format stability policy]
        format_finalization[Persisted format finalization]
        compatibility_testing[Forward/backward compatibility testing]
        api_lifecycle_tooling[API lifecycle tooling]
        docs_examples[Documentation & examples]
    end

    PDDS{Parity with PropertyDDS}
    LST{Parity with Legacy SharedTree}
    LTM{Larger than memory documents}
    GSW{Git style workflows}
    DC{Data consistency}

    Schema-->PDDS
    map_set-->PDDS
    js_api-->PDDS

    Basic-->Advanced
    Basic-->LST
    Basic-->PDDS
    Move-->LST
    Publishing-->LST
    Testing-->LST

    Design-->Move
    Design-->Basic
    Design-->Scale
    Design-->Collections
    Design-->Schema
    Design-->Ergonomics

    LST-->Advanced

    large_sequences-->LTM
    partial_checkout-->LTM

    history-->GSW
    branch_merge-->GSW

    constraints-->DC
    commands-->DC
    Schema-->DC

    classDef SubGraph stroke-width:2px, font-size:15px;
    class Design,Collections,Publishing,Testing,Move,Basic,Advanced,Scale,Schema,Ergonomics SubGraph;

    classDef default fill:#8a8a8a,stroke:#000,stroke-width:1px,color:#ffffff;

    classDef InProgress fill:#f5e39d,stroke:#000,stroke-width:1px,color:#000;
    class move_range,move_slice,async_transactions,undo_redo,identifiers,stashed_ops,constraints,imd,js_api,ids_in_runtime,format_stability_policy,performance_validation,fuzz_testing,unit_testing,coverage,local_branches,perf_playground,test_app InProgress;

    classDef Complete fill:#a5f59d,stroke:#000,stroke-width:1px,color:#000;
    class rebaser,data_model,modularity,sync_transactions,id_allocator,cursor Complete;

    classDef Milestone fill:#5db7de,stroke:#000,stroke-width:2px,color:#000;
    class LST,PDDS,LTM,GSW,DC Milestone;
```
