/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";

// eslint-disable-next-line import/no-extraneous-dependencies
import ajvModuleOrClass from "ajv";
import {
	type TreeEdit,
	type ObjectTarget,
	type Selection,
	type Range,
	type ObjectPlace,
	objectIdKey,
	type ArrayPlace,
	type TreeEditObject,
	// eslint-disable-next-line import/no-internal-modules
} from "../agent-editing/agentEditTypes.js";
import {
	getJsonSchema,
	getOrCreateInnerNode,
	NodeKind,
	type ImplicitAllowedTypes,
	type TreeArrayNode,
	type TreeNode,
	type TreeNodeSchema,
	type TreeView,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { JsonValue } from "../json-handler/jsonParser.js";
// eslint-disable-next-line import/no-internal-modules
import type { SimpleNodeSchema } from "../simple-tree/api/simpleSchema.js";
import {
	FieldKind,
	FieldSchema,
	normalizeAllowedTypes,
	type ImplicitFieldSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../simple-tree/schemaTypes.js";
import { Tree } from "../shared-tree/index.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { toDecoratedJson } from "./promptGeneration.js";

export const typeField = "__fluid_type";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

/**
 * Creates a JSON Schema validator for the provided schema, using `ajv`.
 */
export function getJsonValidator<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
): (data: unknown) => data is TSchema {
	const jsonSchema = getJsonSchema(schema);
	const ajv = new Ajv({
		strict: false,
		allErrors: true,
	});
	return ajv.compile(jsonSchema);
}

export function assertValidContent<TSchema>(
	content: JsonValue,
	validator: (data: unknown) => data is TSchema,
): void {
	if (!validator(content)) {
		throw new UsageError("invalid data with schema");
	}
}

function populateDefaults(
	json: JsonValue,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
): void {
	if (typeof json === "object") {
		if (json === null) {
			return;
		}
		if (Array.isArray(json)) {
			for (const element of json) {
				populateDefaults(element, definitionMap);
			}
		} else {
			assert(typeof json[typeField] === "string", "missing or invalid type field");
			const nodeSchema = definitionMap.get(json[typeField]);
			assert(nodeSchema?.kind === NodeKind.Object, "Expected object schema");

			for (const [key, fieldSchema] of Object.entries(nodeSchema.fields)) {
				const defaulter = fieldSchema?.metadata?.llmDefault;
				if (defaulter !== undefined) {
					// TODO: Properly type. The input `json` is a JsonValue, but the output can contain nodes (from the defaulters) amidst the json.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					json[key] = defaulter() as any;
				}
			}

			for (const value of Object.values(json)) {
				populateDefaults(value, definitionMap);
			}
		}
	}
}

function contentWithIds(
	content: TreeNode,
	idCount: { current: number },
	idToNode: Map<number, TreeNode>,
	nodeToId: Map<TreeNode, number>,
): TreeEditObject {
	return JSON.parse(toDecoratedJson(idCount, idToNode, nodeToId, content)) as TreeEditObject;
}

export function applyAgentEdit<TSchema extends ImplicitFieldSchema>(
	tree: TreeView<TSchema>,
	log: TreeEdit[],
	treeEdit: TreeEdit,
	idCount: { current: number },
	idToNode: Map<number, TreeNode>,
	nodeToId: Map<TreeNode, number>,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
): void {
	const logLength = log.length;
	switch (treeEdit.type) {
		case "setRoot": {
			populateDefaults(treeEdit.content, definitionMap);

			const treeSchema = tree.schema;

			let insertedObject: TreeNode | undefined;
			// If it's a primitive, just validate the content and set
			if (isPrimitive(treeEdit.content)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(tree as any).root = treeEdit.content;
			} else if (treeSchema instanceof FieldSchema) {
				if (treeSchema.kind === FieldKind.Optional && treeEdit.content === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(tree as any).root = treeEdit.content;
				} else {
					for (const allowedType of treeSchema.allowedTypeSet.values()) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						if ((treeEdit.content as any)[typeField] === allowedType.identifier) {
							if (typeof allowedType === "function") {
								const simpleNodeSchema = allowedType as unknown as new (
									dummy: unknown,
								) => TreeNode;
								const rootNode = new simpleNodeSchema(treeEdit.content);
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(tree as any).root = rootNode;
								insertedObject = rootNode;
							} else {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(tree as any).root = treeEdit.content;
							}
						}
					}
				}
			} else if (Array.isArray(treeSchema)) {
				for (const allowedType of treeSchema) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					if ((treeEdit.content as any)[typeField] === allowedType.identifier) {
						if (typeof allowedType === "function") {
							const simpleNodeSchema = allowedType as unknown as new (
								dummy: unknown,
							) => TreeNode;
							const rootNode = new simpleNodeSchema(treeEdit.content);
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(tree as any).root = rootNode;
							insertedObject = rootNode;
						} else {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(tree as any).root = treeEdit.content;
						}
					}
				}
			}

			if (insertedObject !== undefined) {
				log.push({
					...treeEdit,
					content: contentWithIds(insertedObject, idCount, idToNode, nodeToId),
				});
			} else {
				log.push(treeEdit);
			}
			break;
		}
		case "insert": {
			const { array, index } = getObjectPlaceInfo(treeEdit.destination, idToNode);

			const parentNodeSchema = Tree.schema(array);
			populateDefaults(treeEdit.content, definitionMap);
			// We assume that the parentNode for inserts edits are guaranteed to be an arrayNode.
			const allowedTypes = Array.from(
				normalizeAllowedTypes(parentNodeSchema.info as ImplicitAllowedTypes),
			);

			const schemaIdentifier = treeEdit.content.__fluid_type;

			let applied = false;
			for (const allowedType of allowedTypes.values()) {
				if (allowedType.identifier === schemaIdentifier) {
					if (typeof allowedType === "function") {
						applied = true;
						const simpleNodeSchema = allowedType as unknown as new (
							dummy: unknown,
						) => TreeNode;
						const insertNode = new simpleNodeSchema(treeEdit.content);
						array.insertAt(index, insertNode);
						log.push({
							...treeEdit,
							content: contentWithIds(insertNode, idCount, idToNode, nodeToId),
						});
						break;
					}
				}
			}
			assert(applied, "inserted node must be of an allowed type");
			break;
		}
		case "remove": {
			const source = treeEdit.source;
			if (isObjectTarget(source)) {
				const { node, parentIndex } = getTargetInfo(source, idToNode);
				const parentNode = Tree.parent(node) as TreeArrayNode;
				parentNode.removeAt(parentIndex);
			} else if (isRange(source)) {
				const { startNode, startIndex, endNode, endIndex } = getRangeInfo(source, idToNode);
				const parentNode = Tree.parent(startNode) as TreeArrayNode;
				const endParentNode = Tree.parent(endNode) as TreeArrayNode;

				assert(
					parentNode === endParentNode,
					"the two nodes of the range must be from the same parent",
				);

				parentNode.removeRange(startIndex, endIndex);
			}
			log.push(treeEdit);
			break;
		}
		case "modify": {
			const { node } = getTargetInfo(treeEdit.target, idToNode);
			const { treeNodeSchema } = getSimpleNodeSchema(node);

			const fieldSchema =
				(treeNodeSchema.info as Record<string, ImplicitFieldSchema>)[treeEdit.field] ??
				fail("Expected field schema");

			const modification = treeEdit.modification;

			let insertedObject: TreeNode | undefined;
			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (isPrimitive(modification)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(node as any)[treeEdit.field] = modification;
			}
			// If the fieldSchema is a function we can grab the constructor and make an instance of that node.
			else if (typeof fieldSchema === "function") {
				const simpleSchema = fieldSchema as unknown as new (dummy: unknown) => TreeNode;
				populateDefaults(modification, definitionMap);
				const constructedModification = new simpleSchema(modification);
				insertedObject = constructedModification;

				if (Array.isArray(modification)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const field = (node as any)[treeEdit.field] as TreeArrayNode;
					assert(Array.isArray(field), "the field must be an array node");
					assert(
						Array.isArray(constructedModification),
						"the modification must be an array node",
					);
					field.removeRange(0);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = constructedModification;
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = constructedModification;
				}
			}
			// If the fieldSchema is of type FieldSchema, we can check its allowed types and set the field.
			else if (fieldSchema instanceof FieldSchema) {
				if (fieldSchema.kind === FieldKind.Optional && modification === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = undefined;
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const schemaIdentifier = (modification as any)[typeField];

					for (const allowedType of fieldSchema.allowedTypeSet.values()) {
						if (allowedType.identifier === schemaIdentifier) {
							if (typeof allowedType === "function") {
								const simpleSchema = allowedType as unknown as new (
									dummy: unknown,
								) => TreeNode;
								const constructedObject = new simpleSchema(modification);
								insertedObject = constructedObject;
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(node as any)[treeEdit.field] = constructedObject;
							} else {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(node as any)[treeEdit.field] = modification;
							}
						}
					}
				}
			}
			if (insertedObject !== undefined) {
				log.push({
					...treeEdit,
					modification: contentWithIds(insertedObject, idCount, idToNode, nodeToId),
				});
			} else {
				log.push(treeEdit);
			}
			break;
		}
		case "move": {
			// TODO: need to add schema check for valid moves
			const source = treeEdit.source;
			const destination = treeEdit.destination;
			const { array: destinationArrayNode, index: destinationIndex } = getObjectPlaceInfo(
				destination,
				idToNode,
			);

			if (isObjectTarget(source)) {
				const { node: sourceNode, parentIndex: sourceIndex } = getTargetInfo(source, idToNode);
				const sourceArrayNode = Tree.parent(sourceNode) as TreeArrayNode;
				// assert(Array.isArray(sourceArrayNode), "the source node must be within an arrayNode");
				const destinationArraySchema = Tree.schema(destinationArrayNode);
				const allowedTypes = Array.from(
					normalizeAllowedTypes(destinationArraySchema.info as ImplicitAllowedTypes),
				);
				const nodeToMove = sourceArrayNode.at(sourceIndex);
				assert(nodeToMove !== undefined, "node to move must exist");
				if (isNodeAllowedType(nodeToMove as TreeNode, allowedTypes)) {
					destinationArrayNode.moveRangeToIndex(
						destinationIndex,
						sourceIndex,
						sourceIndex + 1,
						sourceArrayNode,
					);
				} else {
					throw new UsageError("Illegal node type in destination array");
				}
			} else if (isRange(source)) {
				const {
					startNode: sourceStartNodeParent,
					startIndex: sourceStartIndex,
					endNode: sourceEndNodeParent,
					endIndex: sourceEndIndex,
				} = getRangeInfo(source, idToNode);
				assert(
					sourceStartNodeParent === sourceEndNodeParent,
					"the range must come from the same source node",
				);
				const destinationArraySchema = Tree.schema(destinationArrayNode);
				const allowedTypes = Array.from(
					normalizeAllowedTypes(destinationArraySchema.info as ImplicitAllowedTypes),
				);
				for (let i = sourceStartIndex; i < sourceEndIndex; i++) {
					const nodeToMove = (sourceStartNodeParent as TreeArrayNode).at(i);
					assert(nodeToMove !== undefined, "node to move must exist");
					if (!isNodeAllowedType(nodeToMove as TreeNode, allowedTypes)) {
						throw new UsageError("Illegal node type in destination array");
					}
				}
				destinationArrayNode.moveRangeToIndex(
					destinationIndex,
					sourceStartIndex,
					sourceEndIndex,
					sourceStartNodeParent as TreeArrayNode,
				);
			}
			log.push(treeEdit);
			break;
		}
		default:
			fail("invalid tree edit");
	}
	assert(log.length === logLength + 1, "log should have one more entry");
}

function isNodeAllowedType(node: TreeNode, allowedTypes: TreeNodeSchema[]): boolean {
	for (const allowedType of allowedTypes) {
		if (Tree.is(node, allowedType)) {
			return true;
		}
	}
	return false;
}

function isPrimitive(content: unknown): boolean {
	return (
		typeof content === "number" ||
		typeof content === "string" ||
		typeof content === "boolean" ||
		typeof content === "undefined" ||
		content === null
	);
}

function isObjectTarget(selection: Selection): selection is ObjectTarget {
	return Object.keys(selection).length === 1 && "__fluid_objectId" in selection;
}

function isRange(selection: Selection): selection is Range {
	return "from" in selection && "to" in selection;
}

interface RangeInfo {
	startNode: TreeNode;
	startIndex: number;
	endNode: TreeNode;
	endIndex: number;
}

function getRangeInfo(range: Range, nodeMap: Map<number, TreeNode>): RangeInfo {
	const { array: startNode, index: startIndex } = getObjectPlaceInfo(range.from, nodeMap);
	const { array: endNode, index: endIndex } = getObjectPlaceInfo(range.to, nodeMap);

	return { startNode, startIndex, endNode, endIndex };
}

function getObjectPlaceInfo(
	place: ObjectPlace | ArrayPlace,
	nodeMap: Map<number, TreeNode>,
): {
	array: TreeArrayNode;
	index: number;
} {
	if (place.type === "arrayPlace") {
		const parent = nodeMap.get(place.parentId) ?? fail("Expected parent node");
		const child = (parent as unknown as Record<string, unknown>)[place.field];
		assert(child !== undefined, `No child under field ${place.field}`);
		const schema = Tree.schema(child as TreeNode);
		assert(schema.kind === NodeKind.Array, "Expected child to be an array node");
		return {
			array: child as TreeArrayNode,
			index: place.location === "start" ? 0 : (child as TreeArrayNode).length,
		};
	} else {
		const { node, parentIndex } = getTargetInfo(place, nodeMap);
		const parent = Tree.parent(node);
		const schema = Tree.schema(parent as TreeNode);
		assert(schema.kind === NodeKind.Array, "Expected child to be an array node");
		return {
			array: parent as unknown as TreeArrayNode,
			index: place.place === "before" ? parentIndex : parentIndex + 1,
		};
	}
}

function getTargetInfo(
	target: ObjectTarget,
	nodeMap: Map<number, TreeNode>,
): {
	node: TreeNode;
	parentIndex: number;
} {
	const node = nodeMap.get(target[objectIdKey]);
	assert(node !== undefined, "objectId does not exist in nodeMap");

	const parentIndex = getOrCreateInnerNode(node).anchorNode.parentIndex;
	return { node, parentIndex };
}

interface SchemaInfo {
	treeNodeSchema: TreeNodeSchema;
	simpleNodeSchema: new (dummy: unknown) => TreeNode;
}

export function isValidContent(content: unknown, validator: (data: unknown) => void): boolean {
	try {
		validator(content);
	} catch (error) {
		return false;
	}
	return true;
}

function getSimpleNodeSchema(node: TreeNode): SchemaInfo {
	const treeNodeSchema = Tree.schema(node);
	const simpleNodeSchema = treeNodeSchema as unknown as new (dummy: unknown) => TreeNode;
	return { treeNodeSchema, simpleNodeSchema };
}