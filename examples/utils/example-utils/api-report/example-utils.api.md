## API Report File for "@fluid-example/example-utils"

> Do not edit this file. It is a report generated by [API Extractor](https://api-extractor.com/).

```ts

import { BaseContainerRuntimeFactory } from '@fluidframework/aqueduct';
import { DataObject } from '@fluidframework/aqueduct';
import { DataObjectFactory } from '@fluidframework/aqueduct';
import { DataObjectTypes } from '@fluidframework/aqueduct';
import { ICodeDetailsLoader } from '@fluidframework/container-definitions';
import { IContainer } from '@fluidframework/container-definitions';
import { IContainerContext } from '@fluidframework/container-definitions';
import { IContainerRuntime } from '@fluidframework/container-runtime-definitions';
import { IContainerRuntimeOptions } from '@fluidframework/container-runtime';
import type { IEvent } from '@fluidframework/core-interfaces';
import type { IEventProvider } from '@fluidframework/core-interfaces';
import { IFluidCodeDetails } from '@fluidframework/container-definitions';
import { IFluidDataStoreFactory } from '@fluidframework/runtime-definitions';
import { IFluidModuleWithDetails } from '@fluidframework/container-definitions';
import { ILoaderProps } from '@fluidframework/container-loader';
import type { IRequest } from '@fluidframework/core-interfaces';
import type { IResponse } from '@fluidframework/core-interfaces';
import { IRuntime } from '@fluidframework/container-definitions';
import { IRuntimeFactory } from '@fluidframework/container-definitions';
import { ITelemetryBaseLogger } from '@fluidframework/core-interfaces';
import { NamedFluidDataStoreRegistryEntries } from '@fluidframework/runtime-definitions';
import { TypedEventEmitter } from '@fluid-internal/client-utils';

// @public
export class ContainerViewRuntimeFactory<T> extends BaseContainerRuntimeFactory {
    constructor(dataStoreFactory: IFluidDataStoreFactory, viewCallback: ViewCallback<T>);
    protected containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void>;
}

// @public
export type DataTransformationCallback = (exportedData: unknown, modelVersion: string) => Promise<unknown>;

// @public
export interface IDetachedModel<ModelType> {
    attach: () => Promise<string>;
    model: ModelType;
}

// @public (undocumented)
export interface IImportExportModel<ImportType, ExportType> {
    exportData: () => Promise<ExportType>;
    importData: (initialData: ImportType) => Promise<void>;
    supportsDataFormat: (initialData: unknown) => initialData is ImportType;
}

// @public (undocumented)
export interface IMigratableModel extends IVersionedModel, IImportExportModel<unknown, unknown>, IEventProvider<IMigratableModelEvents> {
    close(): void;
    connected(): boolean;
    readonly migrationTool: IMigrationTool;
}

// @public (undocumented)
export interface IMigratableModelEvents extends IEvent {
    // (undocumented)
    (event: "connected", listener: () => void): any;
}

// @public (undocumented)
export interface IMigrationTool extends IEventProvider<IMigrationToolEvents> {
    readonly acceptedVersion: string | undefined;
    completeMigrationTask(): void;
    finalizeMigration(id: string): Promise<void>;
    haveMigrationTask(): boolean;
    readonly migrationState: MigrationState;
    readonly newContainerId: string | undefined;
    readonly proposedVersion: string | undefined;
    proposeVersion: (newVersion: string) => void;
    volunteerForMigration(): Promise<boolean>;
}

// @public (undocumented)
export interface IMigrationToolEvents extends IEvent {
    // (undocumented)
    (event: "stopping" | "migrating" | "migrated", listener: () => void): any;
}

// @public (undocumented)
export interface IMigrator extends IEventProvider<IMigratorEvents> {
    readonly currentModel: IMigratableModel;
    readonly currentModelId: string;
    readonly migrationState: MigrationState;
}

// @public (undocumented)
export interface IMigratorEvents extends IEvent {
    // (undocumented)
    (event: "migrated" | "migrating", listener: () => void): any;
    // (undocumented)
    (event: "migrationNotSupported", listener: (version: string) => void): any;
}

// @public (undocumented)
export interface IModelLoader<ModelType> {
    createDetached(version: string): Promise<IDetachedModel<ModelType>>;
    loadExisting(id: string): Promise<ModelType>;
    loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType>;
    supportsVersion(version: string): Promise<boolean>;
}

// @public (undocumented)
export interface ISameContainerMigratableModel extends IVersionedModel, IImportExportModel<unknown, unknown>, IEventProvider<ISameContainerMigratableModelEvents> {
    close(): void;
    connected(): boolean;
    readonly container: IContainer;
    readonly migrationTool: ISameContainerMigrationTool;
}

// @public (undocumented)
export interface ISameContainerMigratableModelEvents extends IEvent {
    // (undocumented)
    (event: "connected", listener: () => void): any;
}

// @public (undocumented)
export interface ISameContainerMigrationTool extends IEventProvider<ISameContainerMigrationToolEvents> {
    get acceptedSeqNum(): number | undefined;
    readonly acceptedVersion: string | undefined;
    finalizeMigration(id: string): Promise<void>;
    readonly migrationState: SameContainerMigrationState;
    readonly proposedVersion: string | undefined;
    readonly proposeVersion: (newVersion: string) => void;
    readonly setContainerRef: (container: IContainer) => void;
}

// @public (undocumented)
export interface ISameContainerMigrationToolEvents extends IEvent {
    // (undocumented)
    (event: "proposingMigration" | "stoppingCollaboration" | "proposingV2Code" | "waitingForV2ProposalCompletion" | "readyForMigration" | "uploadingV2Summary" | "submittingV2Summary" | "migrated", listener: () => void): any;
}

// @public (undocumented)
export interface ISameContainerMigrator extends IEventProvider<ISameContainerMigratorEvents> {
    readonly currentModel: ISameContainerMigratableModel;
    readonly currentModelId: string;
    readonly migrationState: SameContainerMigrationState;
}

// @public (undocumented)
export interface ISameContainerMigratorEvents extends IEvent {
    // (undocumented)
    (event: "migrated" | "migrating", listener: () => void): any;
    // (undocumented)
    (event: "migrationNotSupported", listener: (version: string) => void): any;
}

// @public (undocumented)
export interface IVersionedModel {
    readonly version: string;
}

// @public @deprecated
export const makeModelRequestHandler: <ModelType>(modelMakerCallback: ModelMakerCallback<ModelType>) => (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>;

// @public
export type MigrationState = "collaborating" | "stopping" | "migrating" | "migrated";

// @public (undocumented)
export class MigrationTool extends DataObject implements IMigrationTool {
    // (undocumented)
    get acceptedVersion(): string | undefined;
    // (undocumented)
    completeMigrationTask(): void;
    // (undocumented)
    finalizeMigration(id: string): Promise<void>;
    // (undocumented)
    protected hasInitialized(): Promise<void>;
    // (undocumented)
    haveMigrationTask(): boolean;
    // (undocumented)
    protected initializingFirstTime(): Promise<void>;
    // (undocumented)
    get migrationState(): "collaborating" | "stopping" | "migrating" | "migrated";
    // (undocumented)
    get newContainerId(): string | undefined;
    // (undocumented)
    get proposedVersion(): string | undefined;
    // (undocumented)
    readonly proposeVersion: (newVersion: string) => void;
    // (undocumented)
    volunteerForMigration(): Promise<boolean>;
}

// @public
export const MigrationToolInstantiationFactory: DataObjectFactory<MigrationTool, DataObjectTypes>;

// @public (undocumented)
export class Migrator extends TypedEventEmitter<IMigratorEvents> implements IMigrator {
    constructor(modelLoader: IModelLoader<IMigratableModel>, initialMigratable: IMigratableModel, initialId: string, dataTransformationCallback?: DataTransformationCallback | undefined);
    // (undocumented)
    get connected(): boolean;
    // (undocumented)
    get currentModel(): IMigratableModel;
    // (undocumented)
    get currentModelId(): string;
    // (undocumented)
    get migrationState(): MigrationState;
}

// @public
export abstract class ModelContainerRuntimeFactory<ModelType> implements IRuntimeFactory {
    constructor(registryEntries: NamedFluidDataStoreRegistryEntries, runtimeOptions?: IContainerRuntimeOptions | undefined);
    protected containerHasInitialized(runtime: IContainerRuntime): Promise<void>;
    protected containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void>;
    protected abstract createModel(runtime: IContainerRuntime, container: IContainer): Promise<ModelType>;
    // (undocumented)
    instantiateRuntime(context: IContainerContext, existing: boolean): Promise<IRuntime>;
    // (undocumented)
    get IRuntimeFactory(): this;
}

// @public (undocumented)
export class ModelLoader<ModelType> implements IModelLoader<ModelType> {
    constructor(props: Pick<ILoaderProps, "urlResolver" | "documentServiceFactory" | "codeLoader" | "logger"> & {
        generateCreateNewRequest: () => IRequest;
    });
    // (undocumented)
    createDetached(version: string): Promise<IDetachedModel<ModelType>>;
    // (undocumented)
    loadExisting(id: string): Promise<ModelType>;
    // (undocumented)
    loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType>;
    // (undocumented)
    supportsVersion(version: string): Promise<boolean>;
}

// @public
export type ModelMakerCallback<ModelType> = (runtime: IContainerRuntime, container: IContainer) => Promise<ModelType>;

// @public
export type SameContainerMigrationState = "collaborating" | "proposingMigration" | "stoppingCollaboration" | "proposingV2Code" | "waitingForV2ProposalCompletion" | "readyForMigration" | "uploadingV2Summary" | "submittingV2Summary" | "migrated";

// @public (undocumented)
export class SameContainerMigrationTool extends DataObject implements ISameContainerMigrationTool {
    constructor(props: any);
    // (undocumented)
    get acceptedSeqNum(): number | undefined;
    // (undocumented)
    get acceptedVersion(): string | undefined;
    // (undocumented)
    finalizeMigration(v2Summary: string): Promise<void>;
    // (undocumented)
    protected hasInitialized(): Promise<void>;
    // (undocumented)
    protected initializingFirstTime(): Promise<void>;
    // (undocumented)
    get migrationState(): "collaborating" | "migrated" | "proposingMigration" | "stoppingCollaboration" | "proposingV2Code" | "waitingForV2ProposalCompletion" | "readyForMigration";
    // (undocumented)
    get proposedVersion(): string | undefined;
    // (undocumented)
    readonly proposeVersion: (newVersion: string) => void;
    // (undocumented)
    get setContainerRef(): (container: IContainer) => void;
}

// @public
export const SameContainerMigrationToolInstantiationFactory: DataObjectFactory<SameContainerMigrationTool, DataObjectTypes>;

// @public (undocumented)
export class SameContainerMigrator extends TypedEventEmitter<ISameContainerMigratorEvents> implements ISameContainerMigrator {
    constructor(modelLoader: IModelLoader<ISameContainerMigratableModel>, initialMigratable: ISameContainerMigratableModel, initialId: string, dataTransformationCallback?: DataTransformationCallback | undefined);
    // (undocumented)
    get connected(): boolean;
    // (undocumented)
    get currentModel(): ISameContainerMigratableModel;
    // (undocumented)
    get currentModelId(): string;
    // (undocumented)
    get migrationState(): SameContainerMigrationState;
}

// @public (undocumented)
export class SessionStorageModelLoader<ModelType> implements IModelLoader<ModelType> {
    constructor(codeLoader: ICodeDetailsLoader, logger?: ITelemetryBaseLogger | undefined);
    // (undocumented)
    createDetached(version: string): Promise<IDetachedModel<ModelType>>;
    // (undocumented)
    loadExisting(id: string): Promise<ModelType>;
    // (undocumented)
    loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType>;
    // (undocumented)
    supportsVersion(version: string): Promise<boolean>;
}

// @public
export class StaticCodeLoader implements ICodeDetailsLoader {
    constructor(runtimeFactory: IRuntimeFactory);
    // (undocumented)
    load(details: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}

// @public (undocumented)
export class TinyliciousModelLoader<ModelType> implements IModelLoader<ModelType> {
    constructor(codeLoader: ICodeDetailsLoader);
    // (undocumented)
    createDetached(version: string): Promise<IDetachedModel<ModelType>>;
    // (undocumented)
    loadExisting(id: string): Promise<ModelType>;
    // (undocumented)
    loadExistingPaused(id: string, sequenceNumber: number): Promise<ModelType>;
    // (undocumented)
    supportsVersion(version: string): Promise<boolean>;
}

// @public (undocumented)
export type ViewCallback<T> = (fluidModel: T) => any;

// (No @packageDocumentation comment for this package)

```