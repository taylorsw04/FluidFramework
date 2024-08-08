/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import { strict as assert, fail } from "assert";

import {
	type Anchor,
	type AnchorNode,
	EmptyKey,
	type FieldAnchor,
	type FieldKey,
	type ITreeSubscriptionCursor,
	type MapTree,
	TreeNavigationResult,
	rootFieldKey,
} from "../../../core/index.js";
import {
	SchemaBuilder,
	leaf as leafDomain,
	singleJsonCursor,
	typedJsonCursor,
} from "../../../domains/index.js";
import { type Context, getTreeContext } from "../../../feature-libraries/flex-tree/context.js";
import {
	LazyFieldNode,
	LazyLeaf,
	LazyMap,
	LazyTreeNode,
	buildLazyObjectNode,
} from "../../../feature-libraries/flex-tree/lazyNode.js";
import {
	Any,
	DefaultChangeFamily,
	type DefaultChangeset,
	DefaultEditBuilder,
	type FlexAllowedTypes,
	type FlexFieldKind,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeNodeSchema,
} from "../../../feature-libraries/index.js";
import type { TreeContent, ITreeCheckout } from "../../../shared-tree/index.js";
import { brand } from "../../../util/index.js";
import {
	failCodecFamily,
	flexTreeViewWithContent,
	forestWithContent,
	getField,
} from "../../utils.js";

import { contextWithContentReadonly } from "./utils.js";
import { MockNodeKeyManager } from "../../../feature-libraries/node-key/mockNodeKeyManager.js";

function collectPropertyNames(obj: object): Set<string> {
	if (obj == null) {
		return new Set();
	}
	return new Set([
		...Object.getOwnPropertyNames(obj),
		...collectPropertyNames(Object.getPrototypeOf(obj)),
	]);
}

const rootFieldAnchor: FieldAnchor = { parent: undefined, fieldKey: rootFieldKey };

/**
 * Creates a cursor from the provided `context` and moves it to the provided `anchor`.
 */
function initializeCursor(context: Context, anchor: FieldAnchor): ITreeSubscriptionCursor {
	const cursor = context.checkout.forest.allocateCursor();

	assert.equal(
		context.checkout.forest.tryMoveCursorToField(anchor, cursor),
		TreeNavigationResult.Ok,
	);
	return cursor;
}

/**
 * Initializes a test tree, context, and cursor, and moves the cursor to the tree's root.
 *
 * @returns The initialized context and cursor.
 */
function initializeTreeWithContent<Kind extends FlexFieldKind, Types extends FlexAllowedTypes>(
	treeContent: TreeContent,
): {
	context: Context;
	cursor: ITreeSubscriptionCursor;
} {
	const context = contextWithContentReadonly(treeContent);
	const cursor = initializeCursor(context, rootFieldAnchor);

	return {
		context,
		cursor,
	};
}

/**
 * Test {@link LazyTreeNode} implementation.
 */
class TestLazyTree<TSchema extends FlexTreeNodeSchema> extends LazyTreeNode<TSchema> {}

/**
 * Creates an {@link Anchor} and an {@link AnchorNode} for the provided cursor's location.
 */
function createAnchors(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): { anchor: Anchor; anchorNode: AnchorNode } {
	const anchor = context.checkout.forest.anchors.track(cursor.getPath() ?? fail());
	const anchorNode = context.checkout.forest.anchors.locate(anchor) ?? fail();

	return { anchor, anchorNode };
}

describe("LazyNode", () => {
	describe("LazyNode", () => {
		it("is", () => {
			// #region Create schemas

			const schemaBuilder = new SchemaBuilder({
				scope: "testShared",
			});

			const fieldNodeOptionalAnySchema = schemaBuilder.fieldNode(
				"optionalAny",
				SchemaBuilder.optional(Any),
			);
			const fieldNodeOptionalStringSchema = schemaBuilder.fieldNode(
				"optionalString",
				SchemaBuilder.optional(leafDomain.string),
			);
			const fieldNodeRequiredAnySchema = schemaBuilder.fieldNode("requiredAny", Any);
			const fieldNodeRequiredStringSchema = schemaBuilder.fieldNode(
				"valueString",
				leafDomain.string,
			);
			const structNodeSchema = schemaBuilder.object("object", {});
			const mapNodeAnySchema = schemaBuilder.map("mapAny", SchemaBuilder.optional(Any));
			const mapNodeStringSchema = schemaBuilder.map(
				"mapString",
				SchemaBuilder.optional(leafDomain.string),
			);

			const schema = schemaBuilder.intoSchema(fieldNodeOptionalAnySchema);

			// #endregion

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: singleJsonCursor({}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(
				context,
				fieldNodeOptionalAnySchema,
				cursor,
				anchorNode,
				anchor,
			);

			assert(node.is(fieldNodeOptionalAnySchema));

			assert(!node.is(fieldNodeOptionalStringSchema));
			assert(!node.is(fieldNodeRequiredAnySchema));
			assert(!node.is(fieldNodeRequiredStringSchema));
			assert(!node.is(mapNodeAnySchema));
			assert(!node.is(mapNodeStringSchema));
			assert(!node.is(leafDomain.string));
			assert(!node.is(structNodeSchema));
		});

		it("parent", () => {
			const schemaBuilder = new SchemaBuilder({
				scope: "test",
				libraries: [leafDomain.library],
			});
			const fieldNodeSchema = schemaBuilder.fieldNode(
				"field",
				SchemaBuilder.optional(leafDomain.string),
			);
			const schema = schemaBuilder.intoSchema(fieldNodeSchema);

			const { context, cursor } = initializeTreeWithContent({
				schema,
				initialTree: typedJsonCursor({
					[typedJsonCursor.type]: fieldNodeSchema,
					[EmptyKey]: "Hello world",
				}),
			});
			cursor.enterNode(0);

			const { anchor, anchorNode } = createAnchors(context, cursor);

			const node = new TestLazyTree(context, fieldNodeSchema, cursor, anchorNode, anchor);
			const { index, parent } = node.parentField;
			assert.equal(index, 0);
			assert.equal(parent.key, rootFieldKey);
		});
	});

	describe("LazyFieldNode", () => {
		const schemaBuilder = new SchemaBuilder({
			scope: "test",
			libraries: [leafDomain.library],
		});
		const fieldNodeSchema = schemaBuilder.fieldNode(
			"field",
			SchemaBuilder.optional(leafDomain.string),
		);
		const schema = schemaBuilder.intoSchema(fieldNodeSchema);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: fieldNodeSchema,
				[EmptyKey]: "Hello world",
			}),
		});
		cursor.enterNode(0);
		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = new LazyFieldNode(context, fieldNodeSchema, cursor, anchorNode, anchor);

		it("value", () => {
			assert.equal(node.value, undefined); // FieldNode_s do not have a value
		});

		it("tryGetField", () => {
			const field = node.tryGetField(EmptyKey);
			assert(field !== undefined);
			assert(field.is(SchemaBuilder.optional(leafDomain.string)));
		});
	});

	describe("LazyLeaf", () => {
		const schemaBuilder = new SchemaBuilder({
			scope: "test",
			libraries: [leafDomain.library],
		});
		const schema = schemaBuilder.intoSchema(leafDomain.string);

		const { context, cursor } = initializeTreeWithContent({
			schema,
			initialTree: singleJsonCursor("Hello world"),
		});
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = new LazyLeaf(context, leafDomain.string, cursor, anchorNode, anchor);

		it("value", () => {
			assert.equal(node.value, "Hello world");
		});
	});

	describe("LazyMap", () => {
		const schemaBuilder = new SchemaBuilder({
			scope: "test",
			libraries: [leafDomain.library],
		});
		const mapNodeSchema = schemaBuilder.map(
			"mapString",
			SchemaBuilder.optional(leafDomain.string),
		);
		const schema = schemaBuilder.intoSchema(mapNodeSchema);

		// Count the number of times edits have been generated.
		let editCallCount = 0;
		beforeEach(() => {
			editCallCount = 0;
		});

		const editBuilder = new DefaultEditBuilder(
			new DefaultChangeFamily(failCodecFamily),
			(change: DefaultChangeset) => {
				editCallCount++;
			},
		);
		const forest = forestWithContent({
			schema,
			initialTree: typedJsonCursor({
				[typedJsonCursor.type]: mapNodeSchema,
				foo: "Hello",
				bar: "world",
			}),
		});
		const context = getTreeContext(
			schema,
			{ forest, editor: editBuilder } as unknown as ITreeCheckout,
			new MockNodeKeyManager(),
		);

		const cursor = initializeCursor(context, rootFieldAnchor);
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = new LazyMap(context, mapNodeSchema, cursor, anchorNode, anchor);

		it("value", () => {
			assert.equal(node.value, undefined); // Map nodes do not have a value
		});

		it("tryGetField", () => {
			assert.notEqual(node.tryGetField(brand("foo")), undefined);
			assert.notEqual(node.tryGetField(brand("bar")), undefined);
			assert.equal(node.tryGetField(brand("baz")), undefined);
		});

		it("set", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: typedJsonCursor({ [typedJsonCursor.type]: mapNodeSchema }),
			});
			const mapNode = view.flexTree.content;
			assert(mapNode.is(mapNodeSchema));

			mapNode.set("baz", singleJsonCursor("First edit"));
			mapNode.set("foo", singleJsonCursor("Second edit"));
			assert.equal(mapNode.get("baz"), "First edit");
			assert.equal(mapNode.get("foo"), "Second edit");

			mapNode.set("foo", singleJsonCursor("X"));
			assert.equal(mapNode.get("foo"), "X");
			mapNode.set("foo", undefined);
			assert.equal(mapNode.get("foo"), undefined);
			assert.equal(mapNode.has("foo"), false);
		});

		it("getBoxed empty", () => {
			const view = flexTreeViewWithContent({
				schema,
				initialTree: typedJsonCursor({ [typedJsonCursor.type]: mapNodeSchema }),
			});
			const mapNode = view.flexTree.content;
			assert(mapNode.is(mapNodeSchema));

			const empty = mapNode.getBoxed("foo");
			assert.equal(empty.parent, mapNode);
			assert.equal(empty.key, "foo");
		});

		it("delete", () => {
			assert.equal(editCallCount, 0);

			// Even though there is no value currently associated with "baz", we still need to
			// emit a delete op, so this should generate an edit.
			node.delete(brand("baz"));
			assert.equal(editCallCount, 1);

			node.delete(brand("foo"));
			assert.equal(editCallCount, 2);
		});
	});

	describe("LazyObjectNode", () => {
		const schemaBuilder = new SchemaBuilder({
			scope: "test",
			libraries: [leafDomain.library],
		});
		const structNodeSchema = schemaBuilder.object("object", {
			foo: SchemaBuilder.optional(leafDomain.string),
			bar: SchemaBuilder.sequence(leafDomain.number),
		});
		const schema = schemaBuilder.intoSchema(SchemaBuilder.optional(Any));

		// Count the number of times edits have been generated.
		let editCallCount = 0;
		beforeEach(() => {
			editCallCount = 0;
		});

		const editBuilder = new DefaultEditBuilder(
			new DefaultChangeFamily(failCodecFamily),
			(change: DefaultChangeset) => {
				editCallCount++;
			},
		);
		const initialTree = typedJsonCursor({
			[typedJsonCursor.type]: structNodeSchema,
			foo: "Hello world", // Will unbox
			bar: [], // Won't unbox
		});
		const forest = forestWithContent({ schema, initialTree });
		const context = getTreeContext(
			schema,
			{ forest, editor: editBuilder } as unknown as ITreeCheckout,
			new MockNodeKeyManager(),
		);

		const cursor = initializeCursor(context, rootFieldAnchor);
		cursor.enterNode(0);

		const { anchor, anchorNode } = createAnchors(context, cursor);

		const node = buildLazyObjectNode(context, structNodeSchema, cursor, anchorNode, anchor);

		it("value", () => {
			assert.equal(node.value, undefined); // object nodes do not have a value
		});

		it("tryGetField", () => {
			assert.notEqual(node.tryGetField(brand("foo")), undefined);
			assert.equal(node.tryGetField(brand("bar")), undefined); // TODO: this is presumably wrong - empty array shouldn't yield undefined
			assert.equal(node.tryGetField(brand("baz")), undefined);
		});

		it("Value assignment generates edits", () => {
			assert.equal(editCallCount, 0);

			getField(node, "foo").content = singleJsonCursor("First edit");
			assert.equal(editCallCount, 1);

			getField(node, "foo").content = singleJsonCursor("Second edit");
			assert.equal(editCallCount, 2);
		});
	});
});

function fieldToMapTree(field: FlexTreeField): MapTree[] {
	const results: MapTree[] = [];
	for (const child of field.boxedIterator()) {
		results.push(nodeToMapTree(child));
	}
	return results;
}

function nodeToMapTree(node: FlexTreeNode): MapTree {
	const fields: Map<FieldKey, MapTree[]> = new Map();
	for (const field of node.boxedIterator()) {
		fields.set(field.key, fieldToMapTree(field));
	}

	return { fields, type: node.schema.name, value: node.value };
}
