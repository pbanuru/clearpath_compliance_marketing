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
import type * as findings from "../findings.js";
import type * as policies from "../policies.js";
import type * as quickCheck from "../quickCheck.js";
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
import type * as review_quickCheckExtractions from "../review/quickCheckExtractions.js";
import type * as review_quickCheckLogic from "../review/quickCheckLogic.js";
import type * as review_quickCheckRun from "../review/quickCheckRun.js";
import type * as review_quickCheckStore from "../review/quickCheckStore.js";
import type * as review_quickCheckTypes from "../review/quickCheckTypes.js";
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
  findings: typeof findings;
  policies: typeof policies;
  quickCheck: typeof quickCheck;
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
  "review/quickCheckExtractions": typeof review_quickCheckExtractions;
  "review/quickCheckLogic": typeof review_quickCheckLogic;
  "review/quickCheckRun": typeof review_quickCheckRun;
  "review/quickCheckStore": typeof review_quickCheckStore;
  "review/quickCheckTypes": typeof review_quickCheckTypes;
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
