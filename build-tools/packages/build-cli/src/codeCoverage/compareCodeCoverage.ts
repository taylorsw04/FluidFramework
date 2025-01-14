/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CommandLogger } from "../logging.js";
import type { CoverageMetric } from "./getCoverageMetrics.js";

// List of packages to be ignored from code coverage analysis. These are just prefixes. Reason is that when the package src code contains different
// folders, coverage report calculates coverage of sub folders separately. Also, for example we want to ignore all packages inside examples. So, checking
// prefix helps. If we want to ignore a specific package, we can add the package name directly. Also, the coverage report generates paths using dots as a
// separator for the path.
const codeCoverageComparisonIgnoreList: string[] = [
	"packages.common.core-interfaces",
	"packages.common.core-utils",
	"packages.common.driver-definitions",
	"packages.common.container-definitions",
	"packages.common.client-utils",
	"packages.drivers.debugger",
	"packages.drivers.file-driver",
	"packages.drivers.odsp-driver-definitions",
	"packages.drivers.replay-driver",
	"packages.loader.test-loader-utils",
	"packages.runtime.container-runtime-definitions",
	"packages.runtime.datastore-definitions",
	"packages.runtime.runtime-definitions",
	"packages.runtime.test-runtime-utils",
	"packages.test",
	"packages.tools.changelog-generator-wrapper",
	"packages.tools.devtools",
	"packages.tools.fetch-tool",
	"packages.tools.fluid-runner",
	"packages.tools.replay-tool",
];

/**
 * Type for the code coverage report generated by comparing the baseline and pr code coverage. We are noting both line and branch coverage
 * here but as part of the code coverage comparison check, we are only using branch coverage.
 */
export interface CodeCoverageComparison {
	/**
	 * Path of the package
	 */
	packagePath: string;
	/**
	 * Line coverage in baseline build (as a percent)
	 */
	lineCoverageInBaseline: number;
	/**
	 * Line coverage in pr build (as a percent)
	 */
	lineCoverageInPr: number;
	/**
	 * difference between line coverage in pr build and baseline build (percentage points)
	 */
	lineCoverageDiff: number;
	/**
	 * branch coverage in baseline build (as a percent)
	 */
	branchCoverageInBaseline: number;
	/**
	 * branch coverage in pr build (as a percent)
	 */
	branchCoverageInPr: number;
	/**
	 * difference between branch coverage in pr build and baseline build (percentage points)
	 */
	branchCoverageDiff: number;
	/**
	 * Flag to indicate if the package is new
	 */
	isNewPackage: boolean;
}

export interface CodeCoverageChangeForPackages {
	codeCoverageComparisonForNewPackages: CodeCoverageComparison[];
	codeCoverageComparisonForExistingPackages: CodeCoverageComparison[];
}

/**
 * Compares the code coverage for pr and baseline build and returns an array of objects with comparison results,
 * one per package.
 */
export function compareCodeCoverage(
	baselineCoverageReport: Map<string, CoverageMetric>,
	prCoverageReport: Map<string, CoverageMetric>,
	changedFiles: string[],
): CodeCoverageComparison[] {
	const results: CodeCoverageComparison[] = [];

	const changedPackagesList = changedFiles.map((fileName) => {
		const packagePath = fileName.split("/").slice(0, -1).join(".");
		return packagePath;
	});
	const changedPackages = new Set(changedPackagesList);
	for (const changedPackage of changedPackages) {
		let skip = false;
		// Return if the package being updated in the PR is in the list of packages to be ignored.
		// Also, ignore for now if the package is not in the packages folder.
		for (const ignorePackageName of codeCoverageComparisonIgnoreList) {
			if (
				changedPackage.startsWith(ignorePackageName) ||
				!changedPackage.startsWith("packages.")
			) {
				skip = true;
				break;
			}
		}

		if (skip) {
			continue;
		}

		const prCoverageMetrics = prCoverageReport.get(changedPackage);
		const baselineCoverageMetrics = baselineCoverageReport.get(changedPackage);
		const isNewPackage = baselineCoverageMetrics === undefined;
		if (prCoverageMetrics === undefined) {
			continue;
		}

		let lineCoverageInBaseline = 0;
		let branchCoverageInBaseline = 0;
		const lineCoverageInPr = prCoverageMetrics.lineCoverage;
		const branchCoverageInPr = prCoverageMetrics.branchCoverage;

		if (baselineCoverageMetrics) {
			lineCoverageInBaseline = baselineCoverageMetrics.lineCoverage;
			branchCoverageInBaseline = baselineCoverageMetrics.branchCoverage;
		}

		results.push({
			packagePath: changedPackage,
			lineCoverageInBaseline,
			lineCoverageInPr,
			lineCoverageDiff: lineCoverageInPr - lineCoverageInBaseline,
			branchCoverageInBaseline,
			branchCoverageInPr,
			branchCoverageDiff: branchCoverageInPr - branchCoverageInBaseline,
			isNewPackage,
		});
	}

	return results;
}

/**
 * Method that returns list of packages with code coverage changes.
 * @param codeCoverageComparisonData - The comparison data between baseline and pr test coverage
 * @param logger - The logger to log messages.
 */
export function getPackagesWithCodeCoverageChanges(
	codeCoverageComparisonData: CodeCoverageComparison[],
	logger?: CommandLogger,
): CodeCoverageChangeForPackages {
	// Find new packages that do not have test setup and are being impacted by changes in the PR
	const newPackagesIdentifiedByCodeCoverage = codeCoverageComparisonData.filter(
		(codeCoverageReport) => codeCoverageReport.isNewPackage,
	);
	logger?.verbose(`Found ${newPackagesIdentifiedByCodeCoverage.length} new packages`);

	// Find existing packages that have reported a change in coverage for the current PR
	const existingPackagesWithCoverageChange = codeCoverageComparisonData.filter(
		(codeCoverageReport) => codeCoverageReport.branchCoverageDiff !== 0,
	);
	logger?.verbose(
		`Found ${existingPackagesWithCoverageChange.length} packages with code coverage changes`,
	);

	return {
		codeCoverageComparisonForNewPackages: newPackagesIdentifiedByCodeCoverage,
		codeCoverageComparisonForExistingPackages: existingPackagesWithCoverageChange,
	};
}

/**
 * Method that returns whether the code coverage comparison check passed or not.
 * @param codeCoverageChangeForPackages - The comparison data for packages with code coverage changes.
 * @param logger - The logger to log messages.
 */
export function isCodeCoverageCriteriaPassed(
	codeCoverageChangeForPackages: CodeCoverageChangeForPackages,
	logger?: CommandLogger,
): boolean {
	const { codeCoverageComparisonForNewPackages, codeCoverageComparisonForExistingPackages } =
		codeCoverageChangeForPackages;
	const packagesWithNotableRegressions = codeCoverageComparisonForExistingPackages.filter(
		(codeCoverageReport: CodeCoverageComparison) => codeCoverageReport.branchCoverageDiff < -1,
	);

	logger?.verbose(
		`Found ${packagesWithNotableRegressions.length} existing packages with notable regressions`,
	);

	// Code coverage for the newly added package should be less than 50% to fail.
	const newPackagesWithNotableRegressions = codeCoverageComparisonForNewPackages.filter(
		(codeCoverageReport) => codeCoverageReport.branchCoverageInPr < 50,
	);

	logger?.verbose(
		`Found ${newPackagesWithNotableRegressions.length} new packages with notable regressions`,
	);
	let success: boolean = false;
	if (
		newPackagesWithNotableRegressions.length === 0 &&
		packagesWithNotableRegressions.length === 0
	) {
		success = true;
	}

	return success;
}
