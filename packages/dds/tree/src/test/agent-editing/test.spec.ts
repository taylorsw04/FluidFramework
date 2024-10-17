/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { getView } from "../utils.js";
import { SchemaFactory, TreeViewConfiguration } from "../../index.js";
import { generateTreeEdits, initializeOpenAIClient } from "../../agent-editing/index.js";
import path from "node:path";

const sf = new SchemaFactory("Task-GPT");
const appGuidance = `You are an agent editing the data of a task management application. A user will ask you to create or update tasks according to some criteria. Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`;

class Task extends sf.object("Task", {
	description: sf.required(sf.string, {
		metadata: { description: "A description of the task to be completed" },
	}),
	completed: sf.required(sf.boolean, {
		metadata: { description: "Whether or not the task has been completed" },
	}),
}) {}

class Day extends sf.object("Day", {
	year: sf.required(sf.number, {
		metadata: { description: "The year that this day occurs in (e.g. '1999')" },
	}),
	month: sf.required(sf.number, {
		metadata: { description: "The month that this day occurs in (e.g. '9' for September)" },
	}),
	day: sf.required(sf.number, {
		metadata: {
			description:
				"The day of the month that this day occurs in (e.g. '14' for February 14th)",
		},
	}),
	tasks: sf.array(Task, {
		metadata: { description: "All the tasks to be completed on this day" },
	}),
}) {}

class TaskCalendar extends sf.object("TaskCalendar", {
	days: sf.array(Day, {
		metadata: { description: "A unsorted list of days with tasks to be completed." },
	}),
}) {}

function d(daysAfterToday: number): { year: number; month: number; day: number } {
	const date = new Date();
	date.setDate(date.getDate() + daysAfterToday);
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate(),
	};
}

describe("Task-GPT", () => {
	let prompt: string;
	beforeEach(function () {
		prompt = this.currentTest?.title ?? fail("Test case must have a title");
	});

	let resultsFilePath: string;
	const results: { prompt: string; result: string }[] = [];
	before(() => {
		const now = new Date().toISOString();
		resultsFilePath = path.resolve(
			path.join("C:/Users/noencke/Desktop/", `task-gpt-${now}.txt`),
		);
		// writeFileSync(resultsFilePath, `Test started at ${now}}\n`);
	});

	it("Make a week's worth of workout routines for me. Each day I'd like to have a mix of strength and cardio exercises, but two of the days should be rest days.", async () => {
		const view = getView(new TreeViewConfiguration({ schema: TaskCalendar }));
		view.initialize({ days: [] });
		const openAIClient = initializeOpenAIClient("openai");
		const result = await generateTreeEdits({
			openAIClient,
			treeView: view,
			prompt,
			abortController: new AbortController(),
			maxModelCalls: 10,
			appGuidance,
			finalReviewStep: true,
		});
		assert.equal(result, "success");
		assert.equal(view.root.days.length >= 5, true);
		assert.equal(view.root.days.length <= 7, true);

		results.push({ prompt, result: JSON.stringify(view.root, undefined, 2) });
	});

	it("I was going to celebrate my birthday tomorrow but I'm feeling sick. Please move my birthday to next week. Also if there's anything else I need to do for the next few days, move that too.", async () => {
		const view = getView(new TreeViewConfiguration({ schema: TaskCalendar }));
		view.initialize({
			days: [
				{
					...d(1),
					tasks: [
						{
							description: "Celebrate birthday",
							completed: false,
						},
					],
				},
				{
					...d(2),
					tasks: [
						{
							description: "Get fish food from the pet store",
							completed: false,
						},
					],
				},
			],
		});
		const openAIClient = initializeOpenAIClient("openai");
		const result = await generateTreeEdits({
			openAIClient,
			treeView: view,
			prompt,
			abortController: new AbortController(),
			maxModelCalls: 10,
			appGuidance,
			finalReviewStep: true,
		});
		assert.equal(result, "success");

		results.push({ prompt, result: JSON.stringify(view.root, undefined, 2) });
	});

	after(() => {
		results.sort((a, b) => a.prompt.localeCompare(b.prompt));
		let currentPrompt = "";
		for (const result of results) {
			if (currentPrompt !== result.prompt) {
				currentPrompt = result.prompt;
				// appendFileSync(resultsFilePath, `${result.prompt}\n\n`);
			}
			// appendFileSync(resultsFilePath, `${result.prompt}\n${result.result}\n\n`);
		}
	});
});
