/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureOpenAI, OpenAI } from "openai";
import type {
	ChatCompletionCreateParams,
	// eslint-disable-next-line import/no-internal-modules
} from "openai/resources/index.mjs";
// eslint-disable-next-line import/no-internal-modules
import { zodResponseFormat } from "openai/helpers/zod";

// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";

import {
	getSimpleSchema,
	normalizeFieldSchema,
	type ImplicitFieldSchema,
	type SimpleTreeSchema,
	type TreeNode,
	type TreeView,
} from "../simple-tree/index.js";
import {
	getEditingSystemPrompt,
	getPlanningSystemPrompt,
	getReviewSystemPrompt,
	toDecoratedJson,
	type EditLog,
} from "./promptGeneration.js";
import type { EditWrapper, TreeEdit } from "./agentEditTypes.js";
import { IdGenerator } from "./idGenerator.js";
import { applyAgentEdit } from "./agentEditReducer.js";
import { generateGenericEditTypes } from "./typeGeneration.js";
import { z } from "zod";

const DEBUG_LOG: string[] = [];

/**
 * {@link generateTreeEdits} options.
 *
 * @internal
 */
export interface GenerateTreeEditsOptions<TSchema extends ImplicitFieldSchema> {
	openAIClient: OpenAI;
	treeView: TreeView<TSchema>;
	prompt: string;
	maxModelCalls: number;
	finalReviewStep?: boolean;
	appGuidance?: string;
	abortController?: AbortController;
	maxSequentialErrors?: number;
	validator?: (newContent: TreeNode) => void;
	dumpDebugLog?: boolean;
	plan?: boolean;
}

/**
 * Prompts the provided LLM client to generate valid tree edits.
 * Applies those edits to the provided tree branch before returning.
 *
 * @internal
 */
export async function generateTreeEdits(
	options: GenerateTreeEditsOptions<ImplicitFieldSchema>,
): Promise<"success" | "tooManyErrors" | "tooManyModelCalls" | "aborted"> {
	const idGenerator = new IdGenerator();
	const editLog: EditLog = [];
	let editCount = 0;
	let sequentialErrorCount = 0;
	const simpleSchema = getSimpleSchema(
		normalizeFieldSchema(options.treeView.schema).allowedTypes,
	);

	for await (const edit of generateEdits(options, simpleSchema, idGenerator, editLog)) {
		try {
			const result = applyAgentEdit(
				options.treeView,
				edit,
				idGenerator,
				simpleSchema.definitions,
				options.validator,
			);
			const explanation = result.explanation; // TODO: describeEdit(result, idGenerator);
			editLog.push({ edit: { ...result, explanation } });
			sequentialErrorCount = 0;
		} catch (error: unknown) {
			if (error instanceof Error) {
				const { message } = error;
				sequentialErrorCount += 1;
				editLog.push({ edit, error: message });
				DEBUG_LOG?.push(`Error: ${message}`);
			} else {
				throw error;
			}
		}

		if (options.abortController?.signal.aborted === true) {
			return "aborted";
		}

		if (sequentialErrorCount > (options.maxSequentialErrors ?? Infinity)) {
			return "tooManyErrors";
		}

		if (++editCount >= options.maxModelCalls) {
			return "tooManyModelCalls";
		}
	}

	if (options.dumpDebugLog ?? false) {
		console.log(DEBUG_LOG.join("\n\n"));
		DEBUG_LOG.length = 0;
	}

	return "success";
}

interface ReviewResult {
	goalAccomplished: "yes" | "no";
}

async function* generateEdits<TSchema extends ImplicitFieldSchema>(
	options: GenerateTreeEditsOptions<TSchema>,
	simpleSchema: SimpleTreeSchema,
	idGenerator: IdGenerator,
	editLog: EditLog,
): AsyncGenerator<TreeEdit> {
	const [types, rootTypeName] = generateGenericEditTypes(simpleSchema, true);

	let plan: string | undefined;
	if (options.plan !== undefined) {
		plan = await getStringFromLlm(
			getPlanningSystemPrompt(options.prompt, options.treeView, options.appGuidance),
			options.openAIClient,
		);
	}

	const originalDecoratedJson =
		options.finalReviewStep ?? false
			? toDecoratedJson(idGenerator, options.treeView.root)
			: undefined;
	// reviewed is implicitly true if finalReviewStep is false
	let hasReviewed = options.finalReviewStep ?? false ? false : true;
	async function getNextEdit(): Promise<TreeEdit | undefined> {
		const systemPrompt = getEditingSystemPrompt(
			options.prompt,
			idGenerator,
			options.treeView,
			editLog,
			options.appGuidance,
			plan,
		);

		DEBUG_LOG?.push(systemPrompt);

		const schema = types[rootTypeName] ?? fail("Root type not found.");
		const wrapper = await getFromLlm<EditWrapper>(
			systemPrompt,
			options.openAIClient,
			schema,
			"A JSON object that represents an edit to a JSON tree.",
		);

		DEBUG_LOG?.push(JSON.stringify(wrapper, null, 2));
		if (wrapper === undefined) {
			DEBUG_LOG?.push("Failed to get response");
			return undefined;
		}

		if (wrapper.edit === null) {
			DEBUG_LOG?.push("No more edits.");
			if ((options.finalReviewStep ?? false) && !hasReviewed) {
				const reviewResult = await reviewGoal();
				if (reviewResult === undefined) {
					DEBUG_LOG?.push("Failed to get review response");
					return undefined;
				}
				hasReviewed = true;
				if (reviewResult.goalAccomplished === "yes") {
					return undefined;
				} else {
					editLog.length = 0;
					return getNextEdit();
				}
			}
		} else {
			return wrapper.edit;
		}
	}

	async function reviewGoal(): Promise<ReviewResult | undefined> {
		const systemPrompt = getReviewSystemPrompt(
			options.prompt,
			idGenerator,
			options.treeView,
			originalDecoratedJson ?? fail("Original decorated tree not provided."),
			options.appGuidance,
		);

		DEBUG_LOG?.push(systemPrompt);

		const schema = z.object({
			goalAccomplished: z
				.enum(["yes", "no"])
				.describe('Whether the user\'s goal was met in the "after" tree.'),
		});
		return getFromLlm<ReviewResult>(systemPrompt, options.openAIClient, schema);
	}

	let edit = await getNextEdit();
	while (edit !== undefined) {
		yield edit;
		edit = await getNextEdit();
	}
}

async function getFromLlm<T>(
	prompt: string,
	openAIClient: OpenAI,
	structuredOutputSchema: Zod.ZodTypeAny,
	description?: string,
): Promise<T | undefined> {
	const response_format = zodResponseFormat(structuredOutputSchema, "SharedTreeAI", {
		description,
	});

	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: clientModel.get(openAIClient) ?? "gpt-4o",
		response_format,
		max_tokens: 4096,
	};

	const result = await openAIClient.beta.chat.completions.parse(body);
	// TODO: fix types so this isn't null and doesn't need a cast
	// The type should be derived from the zod schema
	return result.choices[0]?.message.parsed as T | undefined;
}

async function getStringFromLlm(
	prompt: string,
	openAIClient: OpenAI,
): Promise<string | undefined> {
	const body: ChatCompletionCreateParams = {
		messages: [{ role: "system", content: prompt }],
		model: clientModel.get(openAIClient) ?? "gpt-4o",
		max_tokens: 4096,
	};

	const result = await openAIClient.chat.completions.create(body);
	return result.choices[0]?.message.content ?? undefined;
}

/**
 * Creates an OpenAI Client session.
 * Depends on the following environment variables:
 *
 * If using the OpenAI API:
 * - OPENAI_API_KEY
 *
 * If using the Azure OpenAI API:
 * - AZURE_OPENAI_API_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_DEPLOYMENT
 *
 * @internal
 */
export function initializeOpenAIClient(service: "openai" | "azure"): OpenAI {
	if (service === "azure") {
		const apiKey = process.env.AZURE_OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("AZURE_OPENAI_API_KEY environment variable not set");
		}

		const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
		if (endpoint === null || endpoint === undefined) {
			throw new Error("AZURE_OPENAI_ENDPOINT environment variable not set");
		}

		const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
		if (deployment === null || deployment === undefined) {
			throw new Error("AZURE_OPENAI_DEPLOYMENT environment variable not set");
		}

		const client = new AzureOpenAI({
			endpoint,
			deployment,
			apiKey,
			apiVersion: "2024-08-01-preview",
			timeout: 2500000,
		});
		clientModel.set(client, "gpt-4o");
		return client;
	} else {
		const apiKey = process.env.OPENAI_API_KEY;
		if (apiKey === null || apiKey === undefined) {
			throw new Error("OPENAI_API_KEY environment variable not set");
		}

		const client = new OpenAI({ apiKey });
		clientModel.set(client, "gpt-4o-2024-08-06");
		return client;
	}
}

const clientModel = new WeakMap<OpenAI, string>();
