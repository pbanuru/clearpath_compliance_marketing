import { v } from 'convex/values';
import type { Infer } from 'convex/values';

export const policy = v.object({
  id: v.string(),
  title: v.string(),
  kind: v.union(
    v.literal('law'),
    v.literal('regulation'),
    v.literal('guidance'),
    v.literal('platform'),
    v.literal('clearpath_standard'),
  ),
  appliesTo: v.object({
    products: v.optional(v.array(v.string())),
    channels: v.optional(v.array(v.string())),
  }),
  check: v.string(),
  source: v.object({ label: v.string(), url: v.union(v.string(), v.null()) }),
});

export const policies: Infer<typeof policy>[] = [
  {
    id: 'meta-personal-attributes',
    title: 'Meta personal attributes',
    kind: 'platform',
    appliesTo: { channels: ['social'] },
    check:
      'ads must not assert or imply personal attributes of the viewer, including vulnerable financial status. Addressing the viewer with “Struggling with debt?” or “Need $10,000 by Friday?” can imply financial hardship; assess the wording in context.',
    source: {
      label: 'Meta Advertising Standards, Privacy Violations and Personal Attributes',
      url: 'https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/',
    },
  },
  {
    id: 'google-ads-personal-loans',
    title: 'Google Ads personal loans',
    kind: 'platform',
    appliesTo: { products: ['personal_loan'], channels: ['search', 'display', 'landing_page'] },
    check:
      'personal-loan ads must have a landing page or app that prominently states the minimum and maximum repayment period, the maximum APR separately from the representative example, and a representative total loan cost including all applicable fees. Only loans requiring repayment in full in 61 days or longer are allowed. Ads targeting the US must not promote personal loans with APR of 36% or above. These rules also cover lead generators and connections to third-party lenders. Do not infer a missing destination disclosure from ad copy alone when the destination was not provided.',
    source: {
      label:
        'Google Ads Financial products and services policy, Personal loans and High APR personal loans',
      url: 'https://support.google.com/adspolicy/answer/2464998?hl=en',
    },
  },
  {
    id: 'udaap-misleading',
    title: 'Misleading claims and omissions',
    kind: 'law',
    appliesTo: {},
    check:
      'claims that are false, unsupported, or likely to mislead a reasonable consumer, including through omission or a net impression that contradicts the fine print.',
    source: {
      label: 'Consumer Financial Protection Act, 12 U.S.C. 5531 and 5536',
      url: 'https://www.law.cornell.edu/uscode/text/12/5531',
    },
  },
  {
    id: 'approval-claims',
    title: 'Approval claims',
    kind: 'guidance',
    appliesTo: {},
    check:
      '"guaranteed approval", "pre-approved", "everyone qualifies", "no credit check", "approved in minutes" or similar claims about a consumer\'s likelihood or speed of approval, unless true for every consumer who sees them.',
    source: {
      label: 'FTC action against Credit Karma over "pre-approved" offers (2022)',
      url: 'https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-takes-action-stop-credit-karma-tricking-consumers-allegedly-false-pre-approved-credit-offers',
    },
  },
  {
    id: 'closed-end-trigger-terms',
    title: 'Closed-end triggering terms',
    kind: 'regulation',
    appliesTo: { products: ['personal_loan', 'mortgage_prequalification'] },
    check:
      'if the ad states a down payment amount or percentage, the number of payments or repayment period, a payment amount, or a finance charge amount, it must also state the down payment (if any), the terms of repayment, and the annual percentage rate (the abbreviation APR is acceptable), saying if it may increase.',
    source: {
      label: 'Regulation Z 12 CFR 1026.24(d), Official Interpretation comment 24(d)(2)-4',
      url: 'https://www.consumerfinance.gov/rules-policy/regulations/1026/24/',
    },
  },
  {
    id: 'closed-end-rate-as-apr',
    title: 'State rates as APR',
    kind: 'regulation',
    appliesTo: { products: ['personal_loan', 'mortgage_prequalification'] },
    check:
      'any rate of finance charge must be stated as an annual percentage rate (the abbreviation "APR" is acceptable); a simple or interest rate may appear only alongside the APR and not more conspicuously.',
    source: {
      label: '12 CFR 1026.24(c), Official Interpretation comment 24(c)-1',
      url: 'https://www.consumerfinance.gov/rules-policy/regulations/1026/24/',
    },
  },
  {
    id: 'open-end-trigger-terms',
    title: 'Credit card triggering terms',
    kind: 'regulation',
    appliesTo: { products: ['credit_card'] },
    check:
      'if the ad states a finance charge, periodic rate, or fee required in account-opening disclosures, it must also state any minimum or fixed finance charge, each periodic rate as an APR (and that it may vary, if variable), and any annual or membership fee.',
    source: {
      label: '12 CFR 1026.16(b)',
      url: 'https://www.consumerfinance.gov/rules-policy/regulations/1026/16/',
    },
  },
  {
    id: 'card-promo-rate',
    title: 'Promotional card rates',
    kind: 'regulation',
    appliesTo: { products: ['credit_card'] },
    check:
      'an introductory or promotional rate must be labeled "introductory" or "intro" next to the rate, and the ad must state when it ends and the APR that applies afterward, close to the first mention of the promotional rate.',
    source: {
      label: '12 CFR 1026.16(g)',
      url: 'https://www.consumerfinance.gov/rules-policy/regulations/1026/16/',
    },
  },
  {
    id: 'clear-conspicuous',
    title: 'Clear and conspicuous disclosures',
    kind: 'guidance',
    appliesTo: {},
    check:
      'required disclosures must be clear and conspicuous: near the claim they qualify, in a size, color, and contrast a consumer will notice, not buried in a footer or behind a link when the claim is up front; in video, on screen long enough to read and spoken when the claim is spoken; in audio, at an understandable pace.',
    source: {
      label: 'FTC .com Disclosures guidance (2013)',
      url: 'https://www.ftc.gov/news-events/news/press-releases/2013/03/ftc-staff-revises-online-advertising-disclosure-guidelines',
    },
  },
  {
    id: 'advertised-rate-available',
    title: 'Advertised rate availability',
    kind: 'clearpath_standard',
    appliesTo: {},
    check:
      'an advertised rate or "as low as" APR must show the full APR range, say that the rate depends on creditworthiness (other factors may also be named), and be a rate ClearPath actually offers.',
    source: { label: 'ClearPath advertising standard (illustrative), based on UDAAP.', url: null },
  },
  {
    id: 'soft-pull-claims',
    title: 'Soft inquiry claims',
    kind: 'clearpath_standard',
    appliesTo: {},
    check:
      '"won\'t affect your credit score" or "no impact on your credit" may only describe a soft-inquiry rate check, and must make clear that a full application may involve a hard inquiry.',
    source: { label: 'ClearPath advertising standard (illustrative), based on UDAAP.', url: null },
  },
  {
    id: 'prequal-not-preapproval',
    title: 'Prequalification is not preapproval',
    kind: 'regulation',
    appliesTo: { products: ['mortgage_prequalification'] },
    check:
      'prequalification must not be presented as a pre-approval, loan commitment, or guarantee of credit or terms.',
    source: {
      label: 'Regulation N, 12 CFR 1014.3',
      url: 'https://www.ecfr.gov/current/title-12/chapter-X/part-1014',
    },
  },
  {
    id: 'mortgage-identifiers',
    title: 'Mortgage identifiers',
    kind: 'clearpath_standard',
    appliesTo: { products: ['mortgage_prequalification'] },
    check:
      "mortgage advertising shows ClearPath's NMLS unique identifier and the Equal Housing Opportunity logo or statement.",
    source: {
      label:
        'ClearPath standard (illustrative), reflecting state mortgage licensing laws and the Fair Housing Act',
      url: 'https://www.law.cornell.edu/uscode/text/42/3604',
    },
  },
  {
    id: 'fair-lending',
    title: 'Fair lending',
    kind: 'regulation',
    appliesTo: {},
    check:
      'words or images that would discourage a reasonable person from applying on a prohibited basis (race, color, religion, national origin, sex, marital status, age, receipt of public assistance), or that target or exclude such groups.',
    source: {
      label: 'Regulation B 12 CFR 1002.4(b)',
      url: 'https://www.consumerfinance.gov/rules-policy/regulations/1002/4/',
    },
  },
  {
    id: 'state-availability',
    title: 'State availability and lender identity',
    kind: 'clearpath_standard',
    appliesTo: {},
    check:
      'national ads say when a product or terms are not available in all states, and name ClearPath Financial as the lender.',
    source: { label: 'ClearPath standard (illustrative).', url: null },
  },
  {
    id: 'email-can-spam',
    title: 'Commercial email requirements',
    kind: 'law',
    appliesTo: { channels: ['email'] },
    check:
      'a commercial email has an accurate sender and non-deceptive subject line, identifies itself as an advertisement where required, includes a valid physical postal address, and offers a working way to opt out.',
    source: {
      label: 'CAN-SPAM Act, 16 CFR Part 316',
      url: 'https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business',
    },
  },
  {
    id: 'sms-tcpa',
    title: 'Marketing text requirements',
    kind: 'law',
    appliesTo: { channels: ['sms'] },
    check:
      'a marketing text identifies ClearPath, includes opt-out instructions (for example "Reply STOP to opt out"), and is sent only with prior express written consent.',
    source: {
      label: 'TCPA, 47 CFR 64.1200',
      url: 'https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200',
    },
  },
  {
    id: 'endorsements',
    title: 'Affiliate and endorsement disclosures',
    kind: 'guidance',
    appliesTo: { channels: ['affiliate', 'social', 'video_audio'] },
    check:
      'an affiliate, creator, or endorser must clearly disclose being paid or otherwise connected to ClearPath, in the content itself (not only in a bio or link); testimonials must reflect real experience, and results that are not typical must not be presented as typical.',
    source: {
      label: 'FTC Endorsement Guides, 16 CFR Part 255',
      url: 'https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255',
    },
  },
];

export function normalizePolicy(id: string) {
  return policies.some((p) => p.id === id) ? id : 'other';
}

export function applicablePolicies(product: string, channel: string, library = policies) {
  return library.filter(
    (p) =>
      (!p.appliesTo.products?.length || p.appliesTo.products.includes(product)) &&
      (!p.appliesTo.channels?.length || p.appliesTo.channels.includes(channel)),
  );
}
