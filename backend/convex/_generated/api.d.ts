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
import type * as review_analysis from "../review/analysis.js";
import type * as review_detail from "../review/detail.js";
import type * as review_helpers from "../review/helpers.js";
import type * as review_policies from "../review/policies.js";
import type * as review_tables from "../review/tables.js";
import type * as review_types from "../review/types.js";
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
  "review/analysis": typeof review_analysis;
  "review/detail": typeof review_detail;
  "review/helpers": typeof review_helpers;
  "review/policies": typeof review_policies;
  "review/tables": typeof review_tables;
  "review/types": typeof review_types;
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
