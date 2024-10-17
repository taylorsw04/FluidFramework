/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	NodeKind,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeView,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { TreeNode } from "../simple-tree/core/index.js";
import {
	getJsonSchema,
	getSimpleSchema,
	type JsonFieldSchema,
	type JsonNodeSchema,
	type JsonSchemaRef,
	type JsonTreeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../simple-tree/api/index.js";
// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";
import {
	objectIdKey,
	type ObjectTarget,
	type TreeEdit,
	type TreeEditValue,
	type Range,
} from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { generateGenericEditTypes } from "./typeGeneration.js";
// eslint-disable-next-line import/no-internal-modules
import { createZodJsonValidator } from "typechat/zod";
import { Tree } from "../shared-tree/index.js";

export type EditLog = {
	edit: TreeEdit;
	error?: string;
}[];

export function toDecoratedJson(
	idGenerator: IdGenerator,
	root: TreeFieldFromImplicitField<ImplicitFieldSchema>,
): string {
	idGenerator.assignIds(root);
	const stringified: string = JSON.stringify(root, (_, value) => {
		if (typeof value === "object" && !Array.isArray(value) && value !== null) {
			assert(value instanceof TreeNode, "Non-TreeNode value in tree.");
			const objId =
				idGenerator.getId(value) ?? fail("ID of new node should have been assigned.");
			assert(!{}.hasOwnProperty.call(value, objectIdKey), `Collision of object id property.`);
			return {
				[objectIdKey]: objId,
				...value,
			} as unknown;
		}
		return value as unknown;
	});
	return stringified;
}

export function getSuggestingSystemPrompt(
	view: TreeView<ImplicitFieldSchema>,
	suggestionCount: number,
	userGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(new IdGenerator(), view.root);
	const guidance =
		userGuidance !== undefined
			? `Additionally, the user has provided some guidance to help you refine your suggestions. Here is that guidance: ${userGuidance}`
			: "";

	// TODO: security: user prompt in system prompt
	return `
	You are a collaborative agent who suggests possible changes to a JSON tree that follows a specific schema.
	For example, for a schema of a digital whiteboard application, you might suggest things like "Change the color of all sticky notes to blue" or "Align all the handwritten text vertically".
	Or, for a schema of a calendar application, you might suggest things like "Move the meeting with Alice to 3pm" or "Add a new event called 'Lunch with Bob' on Friday".
	The tree that you are suggesting for is a JSON object with the following schema: ${promptFriendlySchema}
	The current state of the tree is: ${decoratedTreeJson}.
	${guidance}
	Please generate exactly ${suggestionCount} suggestions for changes to the tree that you think would be useful.`;
}

export function getEditingSystemPrompt(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<ImplicitFieldSchema>,
	log: EditLog,
	appGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, view.root);

	function createEditList(edits: EditLog): string {
		return edits
			.map((edit, index) => {
				const error =
					edit.error !== undefined
						? ` This edit produced an error, and was discarded. The error message was: "${edit.error}"`
						: "";
				return `${index + 1}. ${JSON.stringify(edit.edit)}${error}`;
			})
			.join("\n");
	}

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `
			The application that owns the JSON tree has the following guidance about your role: ${appGuidance}`
	}`;

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}
	Edits are JSON objects that conform to the following schema.
	The top level object you produce is an "EditWrapper" object which contains one of "SetRoot", "Insert", "Modify", "Remove", "Move", or null.
	${createZodJsonValidator(...generateGenericEditTypes(getSimpleSchema(schema), false)).getSchemaText()}
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	${
		log.length === 0
			? ""
			: `You have already performed the following edits:
			${createEditList(log)}
			This means that the current state of the tree reflects these changes.`
	}
	The current state of the tree is: ${decoratedTreeJson}.
	${log.length > 0 ? "Before you made the above edits t" : "T"}he user requested you accomplish the following goal:
	"${userPrompt}"
	If the goal is now completed or is impossible, you should return null.
	Otherwise, you should create an edit that makes progress towards the goal. It should have an English description ("explanation") of which edit to perform (specifying one of the allowed edit types).`;
	return systemPrompt;
}

export function getReviewSystemPrompt(
	userPrompt: string,
	idGenerator: IdGenerator,
	view: TreeView<ImplicitFieldSchema>,
	originalDecoratedJson: string,
	appGuidance?: string,
): string {
	const schema = normalizeFieldSchema(view.schema);
	const promptFriendlySchema = getPromptFriendlyTreeSchema(getJsonSchema(schema.allowedTypes));
	const decoratedTreeJson = toDecoratedJson(idGenerator, view.root);

	const role = `You are a collaborative agent who interacts with a JSON tree by performing edits to achieve a user-specified goal.${
		appGuidance === undefined
			? ""
			: `
			The application that owns the JSON tree has the following guidance: ${appGuidance}`
	}`;

	// TODO: security: user prompt in system prompt
	const systemPrompt = `
	${role}
	You have performed a number of actions already to accomplish a user request.
	You must review the resulting state to determine if the actions you performed successfully accomplished the user's goal.
	The tree is a JSON object with the following schema: ${promptFriendlySchema}
	The state of the tree BEFORE changes was: ${originalDecoratedJson}.
	The state of the tree AFTER changes is: ${decoratedTreeJson}.
	The user requested that the following goal should be accomplished:
	${userPrompt}
	Was the goal accomplished?`;
	return systemPrompt;
}

export function getPromptFriendlyTreeSchema(jsonSchema: JsonTreeSchema): string {
	let stringifiedSchema = "";
	Object.entries(jsonSchema.$defs).forEach(([name, def]) => {
		if (def.type !== "object" || def._treeNodeSchemaKind === NodeKind.Map) {
			return;
		}

		let stringifiedEntry = `interface ${getFriendlySchemaName(name)} {`;

		Object.entries(def.properties).forEach(([fieldName, fieldSchema]) => {
			let typeString: string;
			if (isJsonSchemaRef(fieldSchema)) {
				const nextFieldName = fieldSchema.$ref;
				const nextDef = getDef(jsonSchema.$defs, nextFieldName);
				typeString = `${getTypeString(jsonSchema.$defs, [nextFieldName, nextDef])}`;
			} else {
				typeString = `${getAnyOfTypeString(jsonSchema.$defs, fieldSchema.anyOf, true)}`;
			}
			if (def.required && !def.required.includes(fieldName)) {
				typeString = `${typeString} | undefined`;
			}
			stringifiedEntry += ` ${fieldName}: ${typeString};`;
		});

		stringifiedEntry += " }";

		stringifiedSchema += (stringifiedSchema === "" ? "" : " ") + stringifiedEntry;
	});
	return stringifiedSchema;
}

function printContent(content: TreeEditValue, idGenerator: IdGenerator): string {
	switch (typeof content) {
		case "boolean":
			return content ? "true" : "false";
		case "number":
			return content.toString();
		case "string":
			return `"${truncateString(content, 32)}"`;
		case "object": {
			if (Array.isArray(content)) {
				// TODO: Describe the types of the array contents
				return "a new array";
			}
			if (content === null) {
				return "null";
			}
			const id = content[objectIdKey];
			assert(typeof id === "string", "Object content has no id.");
			const node = idGenerator.getNode(id) ?? fail("Node not found.");
			const schema = Tree.schema(node);
			return `a new ${getFriendlySchemaName(schema.identifier)}`;
		}
		default:
			fail("Unexpected content type.");
	}
}

export function describeEdit(edit: TreeEdit, idGenerator: IdGenerator): string {
	switch (edit.type) {
		case "setRoot":
			return `Set the root of the tree to ${printContent(edit.content, idGenerator)}.`;
		case "insert": {
			if (edit.destination.type === "arrayPlace") {
				return `Insert ${printContent(edit.content, idGenerator)} at the ${edit.destination.location} of the array that is under the "${edit.destination.field}" property of ${edit.destination.parentId}.`;
			} else {
				const target =
					idGenerator.getNode(edit.destination.target) ?? fail("Target node not found.");
				const array = Tree.parent(target) ?? fail("Target node has no parent.");
				const container = Tree.parent(array);
				if (container === undefined) {
					return `Insert ${printContent(edit.content, idGenerator)} into the array at the root of the tree. Insert it ${edit.destination.place} ${edit.destination.target}.`;
				}
				return `Insert ${printContent(edit.content, idGenerator)} into the array that is under the "${Tree.key(array)}" property of ${idGenerator.getId(container)}. Insert it ${edit.destination.place} ${edit.destination.target}.`;
			}
		}
		case "modify":
			return `Set the "${edit.field}" field of ${edit.target.target} to ${printContent(edit.modification, idGenerator)}.`;
		case "remove":
			return isObjectTarget(edit.source)
				? `Remove "${edit.source.target}" from the containing array.`
				: `Remove all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} in their containing array.`;
		case "move":
			if (edit.destination.type === "arrayPlace") {
				const suffix = `to the ${edit.destination.location} of the array that is under the "${edit.destination.field}" property of ${edit.destination.parentId}`;
				return isObjectTarget(edit.source)
					? `Move ${edit.source.target} ${suffix}.`
					: `Move all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} ${suffix}.`;
			} else {
				const suffix = `to ${edit.destination.place} ${edit.destination.target}`;
				return isObjectTarget(edit.source)
					? `Move ${edit.source.target} ${suffix}.`
					: `Move all elements from ${edit.source.from.place} ${edit.source.from.target} to ${edit.source.to.place} ${edit.source.to.target} ${suffix}.`;
			}
		default:
			return "Unknown edit type.";
	}
}

function isObjectTarget(value: ObjectTarget | Range): value is ObjectTarget {
	return (value as Partial<ObjectTarget>).target !== undefined;
}

function getTypeString(
	defs: Record<string, JsonNodeSchema>,
	[name, currentDef]: [string, JsonNodeSchema],
): string {
	const { _treeNodeSchemaKind } = currentDef;
	if (_treeNodeSchemaKind === NodeKind.Leaf) {
		return currentDef.type;
	}
	if (_treeNodeSchemaKind === NodeKind.Object) {
		return getFriendlySchemaName(name);
	}
	if (_treeNodeSchemaKind === NodeKind.Array) {
		const items = currentDef.items;
		const innerType = !isJsonSchemaRef(items)
			? getAnyOfTypeString(defs, items.anyOf)
			: getTypeString(defs, [items.$ref, getDef(defs, items.$ref)]);
		return `${innerType}[]`;
	}
	fail("Non-object, non-leaf, non-array schema type.");
}

function getAnyOfTypeString(
	defs: Record<string, JsonNodeSchema>,
	refList: JsonSchemaRef[],
	topLevel = false,
): string {
	const typeNames: string[] = [];
	refList.forEach((ref) => {
		typeNames.push(getTypeString(defs, [ref.$ref, getDef(defs, ref.$ref)]));
	});
	const typeString = typeNames.join(" | ");
	return topLevel ? typeString : `(${typeString})`;
}

function isJsonSchemaRef(field: JsonFieldSchema): field is JsonSchemaRef {
	return (field as JsonSchemaRef).$ref !== undefined;
}

function getDef(defs: Record<string, JsonNodeSchema>, ref: string): JsonNodeSchema {
	// strip the "#/$defs/" prefix
	const strippedRef = ref.slice(8);
	const nextDef = defs[strippedRef];
	assert(nextDef !== undefined, "Ref not found.");
	return nextDef;
}

export function getFriendlySchemaName(schemaName: string): string {
	const matches = schemaName.match(/[^.]+$/);
	if (matches === null) {
		// empty scope
		return schemaName;
	}
	return matches[0];
}

function truncateString(str: string, maxLength: number): string {
	if (str.length > maxLength) {
		return `${str.substring(0, maxLength - 3)}...`;
	}
	return str;
}
