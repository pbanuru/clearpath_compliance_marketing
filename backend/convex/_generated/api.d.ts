/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assetAuth from "../assetAuth.js";
import type * as assetStorage from "../assetStorage.js";
import type * as assetTypes from "../assetTypes.js";
import type * as assetUploads from "../assetUploads.js";
import type * as assets from "../assets.js";
import type * as crons from "../crons.js";
import type * as findings from "../findings.js";
import type * as policies from "../policies.js";
import type * as policy_changes from "../policy/changes.js";
import type * as policy_checkSource from "../policy/checkSource.js";
import type * as policy_customRules from "../policy/customRules.js";
import type * as policy_dailyPlanning from "../policy/dailyPlanning.js";
import type * as policy_jobRecovery from "../policy/jobRecovery.js";
import type * as policy_library from "../policy/library.js";
import type * as policy_listings from "../policy/listings.js";
import type * as policy_monitor from "../policy/monitor.js";
import type * as policy_monitorState from "../policy/monitorState.js";
import type * as policy_recheck from "../policy/recheck.js";
import type * as policy_recheckState from "../policy/recheckState.js";
import type * as policy_rechecks from "../policy/rechecks.js";
import type * as policy_sourceJobs from "../policy/sourceJobs.js";
import type * as policy_sourceLibrary from "../policy/sourceLibrary.js";
import type * as policy_sourceManagement from "../policy/sourceManagement.js";
import type * as policy_sourceTables from "../policy/sourceTables.js";
import type * as policy_sources from "../policy/sources.js";
import type * as policy_tables from "../policy/tables.js";
import type * as policy_triage from "../policy/triage.js";
import type * as policy_urls from "../policy/urls.js";
import type * as review_analysis from "../review/analysis.js";
import type * as review_detail from "../review/detail.js";
import type * as review_helpers from "../review/helpers.js";
import type * as review_mediaInput from "../review/mediaInput.js";
import type * as review_openai from "../review/openai.js";
import type * as review_output from "../review/output.js";
import type * as review_parsing from "../review/parsing.js";
import type * as review_policies from "../review/policies.js";
import type * as review_pricing from "../review/pricing.js";
import type * as review_prompt from "../review/prompt.js";
import type * as review_state from "../review/state.js";
import type * as review_tables from "../review/tables.js";
import type * as review_types from "../review/types.js";
import type * as review_usage from "../review/usage.js";
import type * as reviews from "../reviews.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assetAuth: typeof assetAuth;
  assetStorage: typeof assetStorage;
  assetTypes: typeof assetTypes;
  assetUploads: typeof assetUploads;
  assets: typeof assets;
  crons: typeof crons;
  findings: typeof findings;
  policies: typeof policies;
  "policy/changes": typeof policy_changes;
  "policy/checkSource": typeof policy_checkSource;
  "policy/customRules": typeof policy_customRules;
  "policy/dailyPlanning": typeof policy_dailyPlanning;
  "policy/jobRecovery": typeof policy_jobRecovery;
  "policy/library": typeof policy_library;
  "policy/listings": typeof policy_listings;
  "policy/monitor": typeof policy_monitor;
  "policy/monitorState": typeof policy_monitorState;
  "policy/recheck": typeof policy_recheck;
  "policy/recheckState": typeof policy_recheckState;
  "policy/rechecks": typeof policy_rechecks;
  "policy/sourceJobs": typeof policy_sourceJobs;
  "policy/sourceLibrary": typeof policy_sourceLibrary;
  "policy/sourceManagement": typeof policy_sourceManagement;
  "policy/sourceTables": typeof policy_sourceTables;
  "policy/sources": typeof policy_sources;
  "policy/tables": typeof policy_tables;
  "policy/triage": typeof policy_triage;
  "policy/urls": typeof policy_urls;
  "review/analysis": typeof review_analysis;
  "review/detail": typeof review_detail;
  "review/helpers": typeof review_helpers;
  "review/mediaInput": typeof review_mediaInput;
  "review/openai": typeof review_openai;
  "review/output": typeof review_output;
  "review/parsing": typeof review_parsing;
  "review/policies": typeof review_policies;
  "review/pricing": typeof review_pricing;
  "review/prompt": typeof review_prompt;
  "review/state": typeof review_state;
  "review/tables": typeof review_tables;
  "review/types": typeof review_types;
  "review/usage": typeof review_usage;
  reviews: typeof reviews;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  r2: import("@convex-dev/r2/_generated/component.js").ComponentApi<"r2">;
};
