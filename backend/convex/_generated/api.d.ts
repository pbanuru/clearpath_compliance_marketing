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
import type * as campaign_analysisContext from "../campaign/analysisContext.js";
import type * as campaign_examples from "../campaign/examples.js";
import type * as campaign_helpers from "../campaign/helpers.js";
import type * as campaign_membership from "../campaign/membership.js";
import type * as campaign_model from "../campaign/model.js";
import type * as campaigns from "../campaigns.js";
import type * as findings from "../findings.js";
import type * as policies from "../policies.js";
import type * as review_analysis from "../review/analysis.js";
import type * as review_assemblyai from "../review/assemblyai.js";
import type * as review_detail from "../review/detail.js";
import type * as review_helpers from "../review/helpers.js";
import type * as review_mediaInput from "../review/mediaInput.js";
import type * as review_openai from "../review/openai.js";
import type * as review_output from "../review/output.js";
import type * as review_parsing from "../review/parsing.js";
import type * as review_policies from "../review/policies.js";
import type * as review_pricing from "../review/pricing.js";
import type * as review_prompt from "../review/prompt.js";
import type * as review_queueRow from "../review/queueRow.js";
import type * as review_state from "../review/state.js";
import type * as review_tables from "../review/tables.js";
import type * as review_transcriptLimits from "../review/transcriptLimits.js";
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
  "campaign/analysisContext": typeof campaign_analysisContext;
  "campaign/examples": typeof campaign_examples;
  "campaign/helpers": typeof campaign_helpers;
  "campaign/membership": typeof campaign_membership;
  "campaign/model": typeof campaign_model;
  campaigns: typeof campaigns;
  findings: typeof findings;
  policies: typeof policies;
  "review/analysis": typeof review_analysis;
  "review/assemblyai": typeof review_assemblyai;
  "review/detail": typeof review_detail;
  "review/helpers": typeof review_helpers;
  "review/mediaInput": typeof review_mediaInput;
  "review/openai": typeof review_openai;
  "review/output": typeof review_output;
  "review/parsing": typeof review_parsing;
  "review/policies": typeof review_policies;
  "review/pricing": typeof review_pricing;
  "review/prompt": typeof review_prompt;
  "review/queueRow": typeof review_queueRow;
  "review/state": typeof review_state;
  "review/tables": typeof review_tables;
  "review/transcriptLimits": typeof review_transcriptLimits;
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
