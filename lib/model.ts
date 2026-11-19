// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value is a launch valuation estimated only from the snapshot's own figures. It is built in
// four transparent steps, and every step is exported on the board row so the dashboard can show its
// working:
//
//   multiple   = the median market-cap / TVL ratio of live-token protocols in the same category,
//                shrunk toward the market-wide median when the category has few comparables, then
//                clamped to [MULTIPLE_FLOOR, MULTIPLE_CAP]. No live comparables means the market
//                prior is used and the row says so.
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP)                  (percent)
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT                          (a wild week is bounded)
//   ageDays    = as_of - listed_at, at least 0                                (unknown: UNKNOWN_AGE_DAYS)
//   maturity   = MATURITY_FLOOR + min(ageDays, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
//   implied    = max(1, round(base x growthMult x maturity))
//
// Maturity is capped at MATURITY_DAYS so that a long history helps without dominating; a protocol that
// has run longer without a token is a stronger launch candidate, but only up to the range above. The
// growth clamp and weight keep one turbulent week from driving the whole board.
//
// Every constant is named in MODEL and stated in the dashboard. No protocol name is ever special-cased:
// the same function scores every row, and the category multiple is derived from the snapshot, not from a
// hand-written list of names.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  prior_weight: number;
  prior_floor: number;
  prior_cap: number;
  comparable_min_tvl_usd: number;
  comparable_min_mcap_usd: number;
  ratio_floor: number;
  ratio_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.35,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1460,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 6,
  prior_weight: 2,
  prior_floor: 0.05,
  prior_cap: 5,
  comparable_min_tvl_usd: 500_000,
  comparable_min_mcap_usd: 1_000_000,
  ratio_floor: 0.02,
  ratio_cap: 20,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-category-comparable';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** The live-token view's cap, by market cap. Set above the sealed snapshot's live side so every
 *  token-bearing protocol can be shown while still bounding a much larger future snapshot. */
export const LIVE_ROWS = 500;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The category multiple one sector is scored with, and the evidence behind it. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comparables: number;
  median_ratio: number | null;
  global_prior: number;
  source: 'category' | 'market';
}

/** The working behind one row's implied value. */
export interface ValueBreakdown {
  category_multiple: number;
  category_comparables: number;
  category_median_ratio: number | null;
  category_multiple_source: 'category' | 'market';
  base_value_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ValueBreakdown & { age_days: number | null };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan and the factor working carried along. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  token_status: 'pre-token';
  symbol: string | null;
  gecko_id: string | null;
  model: ValueBreakdown & { age_days: number | null };
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the page shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'live';
}

/** Everything the dashboard needs: the board, the live set, the category multiples and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  multiples: CategoryMultiple[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers, or null when the list is empty. Does not mutate its argument. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/**
 * Derive one market-cap / TVL multiple per category from the snapshot's own live-token protocols.
 *
 * Each comparable's ratio is clamped to [RATIO_FLOOR, RATIO_CAP] so a micro-TVL outlier cannot set the
 * price. The category median is then shrunk toward the market-wide median with PRIOR_WEIGHT pseudo-
 * observations, so a category with one comparable does not claim to know more than it does. Finally the
 * multiple is clamped to the model's own range. Categories with no live comparable use the market prior
 * and are labelled `market` rather than `category`.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, CategoryMultiple> {
  const byCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.category === 'CEX' || VERSIONED.test(p.name)) continue;
    if ((p.mcap_usd ?? 0) < model.comparable_min_mcap_usd || p.tvl_usd < model.comparable_min_tvl_usd) continue;
    if (p.tvl_usd <= 0 || (p.mcap_usd ?? 0) <= 0) continue;
    const ratio = clamp((p.mcap_usd as number) / p.tvl_usd, model.ratio_floor, model.ratio_cap);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key);
    if (list === undefined) byCategory.set(key, [ratio]);
    else list.push(ratio);
    allRatios.push(ratio);
  }
  const globalPrior = clamp(median(allRatios) ?? 0.3, model.prior_floor, model.prior_cap);
  const out = new Map<string, CategoryMultiple>();
  for (const p of snapshot.protocols) {
    const key = p.category ?? 'Other';
    if (out.has(key)) continue;
    const ratios = byCategory.get(key) ?? [];
    const n = ratios.length;
    const categoryMedian = median(ratios);
    const anchor = categoryMedian ?? globalPrior;
    const shrunk = (n * anchor + model.prior_weight * globalPrior) / (n + model.prior_weight);
    const multiple = round6(clamp(shrunk, model.multiple_floor, model.multiple_cap));
    out.set(key, {
      category: key,
      multiple,
      comparables: n,
      median_ratio: categoryMedian === null ? null : round6(categoryMedian),
      global_prior: round6(globalPrior),
      source: n > 0 ? 'category' : 'market',
    });
  }
  if (!out.has('Other')) {
    out.set('Other', {
      category: 'Other',
      multiple: round6(clamp(globalPrior, model.multiple_floor, model.multiple_cap)),
      comparables: 0,
      median_ratio: null,
      global_prior: round6(globalPrior),
      source: 'market',
    });
  }
  return out;
}

/**
 * One protocol's implied value. The formula, in the order the page shows it:
 *
 *   base        = max(0, tvl_usd) x clamp(category.multiple, MULTIPLE_FLOOR, MULTIPLE_CAP)
 *   growthPct   = clamp(change_7d ?? 0, GROWTH_FLOOR, GROWTH_CAP)
 *   growthMult  = 1 + (growthPct / 100) x GROWTH_WEIGHT
 *   age         = ageDays(as_of, listed_at), or UNKNOWN_AGE_DAYS when absent
 *   maturity    = MATURITY_FLOOR + clamp(age, 0, MATURITY_DAYS) / MATURITY_DAYS x MATURITY_RANGE
 *   implied     = max(1, round(base x growthMult x maturity))
 *
 * Both multipliers are rounded to four places before the product, so the dashboard's recompute from
 * the row's own figures lands on exactly the integer board.json carries.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  category: CategoryMultiple,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; multiple: number } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = round4(
    model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range,
  );
  const multiple = round6(clamp(category.multiple, model.multiple_floor, model.multiple_cap));
  const base = Math.max(0, finite(protocol.tvl_usd, 0)) * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, growthPct, growthMult, maturityMult, age, multiple };
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = categoryMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const category = multiples.get(p.category ?? 'Other')!;
    const value = impliedValue(p, snapshot.as_of, model, category);
    return { p, category, value };
  });
  scored.sort((a, b) => b.value.implied - a.value.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.value.age,
    implied_value_usd: s.value.implied,
    model: {
      category_multiple: s.value.multiple,
      category_comparables: s.category.comparables,
      category_median_ratio: s.category.median_ratio,
      category_multiple_source: s.category.source,
      base_value_usd: Math.round(s.value.base),
      growth_pct: s.value.growthPct,
      growth_multiplier: s.value.growthMult,
      maturity_multiplier: s.value.maturityMult,
      age_days: s.value.age,
    },
    farm_steps: farmSteps(s.p, s.value.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A chain-aware gas estimate, so the plan's cost is specific rather than a slogan. */
function gasNote(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum') || c === 'mainnet') return 'about $8 of gas on Ethereum';
  if (c.includes('bitcoin')) return 'the network fee, about $2-10 in BTC';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon')) return 'about $1-2 of gas';
  if (c.includes('solana') || c.includes('sui') || c.includes('monad')) return 'under $0.50 of gas';
  return 'about $2-5 of gas';
}

/** Which concrete plan a category gets. Matching is on words, never on a protocol's name. */
function planFamily(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('governance')) return 'curator';
  if (c.includes('basis')) return 'basis';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('restak') || c.includes('staking') || c.includes('liquid stak') || c.includes('anchor btc')) return 'staking';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('dex') || c.includes('liquidity') || c.includes('leveraged farm')) return 'dex';
  if (c.includes('chain') || c.includes('decentralized btc')) return 'chain';
  if (c.includes('cefi') || c.includes('cedefi') || c.includes('otc') || c.includes('card') || c.includes('payments')) return 'cefi';
  if (c.includes('derivative') || c.includes('option') || c.includes('synthetic') || c.includes('interest rate')) return 'derivatives';
  if (c.includes('insurance')) return 'insurance';
  if (c.includes('stable') || c.includes('reserve currency')) return 'stable';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('yield') || c.includes('farm')) return 'yield';
  return 'default';
}

/** The two category-specific farming actions: deploy the capital, then maintain it. */
function categoryActions(p: SnapshotProtocol, capital: number, chain: string): FarmStep[] {
  const gas = gasNote(chain);
  const name = p.name;
  switch (planFamily(p.category)) {
    case 'lending':
      return [
        {
          text: `Supply $${capital} of USDC as collateral on ${name} on ${chain}, then borrow no more than half of the allowed stablecoin limit.`,
          cost: `$${capital} of capital plus ${gas}; keep a 2x health buffer`,
          time: '20 minutes',
        },
        {
          text: `Check the health factor and the borrow APR every week; repay part of the debt or add collateral if the health factor falls below 1.6.`,
          cost: `${gas} per adjustment`,
          time: '10 minutes a week',
        },
      ];
    case 'dex':
      return [
        {
          text: `Provide $${capital} of liquidity to ${name}'s deepest USDC pair on ${chain}, using a range around the current price if the pool is concentrated.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Stake the LP receipt in ${name}'s farm if one exists, and rebalance the range when price leaves it by more than 10%.`,
          cost: `${gas} per rebalance; impermanent loss applies to the capital`,
          time: '15 minutes a week',
        },
      ];
    case 'rwa':
      return [
        {
          text: `Complete ${name}'s onboarding and whitelist on ${chain}, then mint or subscribe $${capital} of its yield-bearing asset.`,
          cost: `$${capital} of capital plus ${gas}; allow 1-3 days for approval`,
          time: '30 minutes plus review',
        },
        {
          text: `Verify the mint receipt and the reported NAV on ${name}'s own dashboard each month before adding more capital.`,
          cost: 'no fee to check; redemption may carry a protocol fee',
          time: '15 minutes a month',
        },
      ];
    case 'curator':
      return [
        {
          text: `Deposit $${capital} into the ${name} vault on ${chain} with the longest track record and the lowest fee, not the highest advertised yield.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '15 minutes',
        },
        {
          text: `Track the vault's allocations, curator fee and share price weekly; move to a second vault if drawdown passes 5%.`,
          cost: `${gas} per move; the $${capital} stays at risk`,
          time: '15 minutes a week',
        },
      ];
    case 'staking':
      return [
        {
          text: `Stake $${capital} of ${chain}'s staking asset through ${name}, keep the liquid receipt token, and note the validator or operator set.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '15 minutes',
        },
        {
          text: `Check the receipt's peg, the operator's slashing record and the unstaking queue every two weeks before compounding.`,
          cost: `${gas} to claim or restake; slashing risk applies to the capital`,
          time: '10 minutes every two weeks',
        },
      ];
    case 'basis':
      return [
        {
          text: `Deposit $${capital} of USDC as margin on ${name} on ${chain}, buy the spot asset and open an equal-size perpetual short to stay delta-neutral.`,
          cost: `$${capital} of capital plus ${gas} and trading fees`,
          time: '25 minutes',
        },
        {
          text: `Monitor the funding rate and the basis daily; roll the position before expiry and close both legs together if funding turns negative.`,
          cost: `${gas} per roll plus trading fees`,
          time: '10 minutes a day',
        },
      ];
    case 'chain':
      return [
        {
          text: `Bridge $${capital} of the chain's canonical asset into ${chain} through ${name}, then use it in the chain's main app instead of leaving it idle.`,
          cost: `$${capital} of capital plus a bridge fee of about 0.1%`,
          time: '20 minutes',
        },
        {
          text: `Check the bridge's withdrawal window and the chain's validator set monthly; move funds back if finality stalls.`,
          cost: `${gas} per bridge round trip`,
          time: '15 minutes a month',
        },
      ];
    case 'cefi':
      return [
        {
          text: `Complete identity and source-of-funds checks with ${name}, then deposit $${capital} of USDC through its official app or card rail on ${chain}.`,
          cost: `$${capital} of capital; verification is usually free`,
          time: '30-60 minutes plus review',
        },
        {
          text: `Reconcile the custody statement and the withdrawal address every month; keep only working capital on the platform.`,
          cost: 'a withdrawal fee, usually under $10',
          time: '15 minutes a month',
        },
      ];
    case 'derivatives':
      return [
        {
          text: `Deposit $${capital} of USDC as margin on ${name} and open one small hedge or options position on the asset you already hold.`,
          cost: `$${capital} of capital plus ${gas} and trading fees`,
          time: '20 minutes',
        },
        {
          text: `Check margin usage and the oracle or settlement price daily; reduce size before the margin ratio reaches 70%.`,
          cost: `${gas} per adjustment`,
          time: '10 minutes a day',
        },
      ];
    case 'insurance':
      return [
        {
          text: `Buy $${capital} of cover from ${name} on ${chain} for the contract or asset you actually use, and store the policy NFT or certificate.`,
          cost: `$${capital} of cover premium plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Review the policy's expiry and the claims process each quarter; renew only the cover you still need.`,
          cost: 'the renewal premium, paid in the protocol asset',
          time: '15 minutes a quarter',
        },
      ];
    case 'stable':
      return [
        {
          text: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}, keeping the collateral ratio above the protocol's recommended buffer.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Check the peg, collateral ratio and redemption route weekly; repay or top up if the ratio moves within 10% of the limit.`,
          cost: `${gas} per adjustment`,
          time: '10 minutes a week',
        },
      ];
    case 'bridge':
      return [
        {
          text: `Bridge $${capital} of USDC into ${chain} through ${name}, then complete one return trip so both directions of the route are tested.`,
          cost: `$${capital} of capital plus bridge fees, usually under 0.2%`,
          time: '25 minutes',
        },
        {
          text: `Track the route's finality time and liquidity depth monthly; avoid amounts larger than the pool's available liquidity.`,
          cost: `${gas} per transfer`,
          time: '15 minutes a month',
        },
      ];
    case 'prediction':
      return [
        {
          text: `Fund $${capital} on ${name} on ${chain} and place one position in a market you can research, sizing it as a small share of the bankroll.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Record the resolution date and check the market's oracle rules before adding any second position.`,
          cost: 'the capital stays at risk until resolution',
          time: '10 minutes per market',
        },
      ];
    case 'yield':
      return [
        {
          text: `Deposit $${capital} into ${name}'s main yield vault on ${chain}, after checking the strategy, the fee and the withdrawal delay.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Compare the realised yield with the advertised rate weekly and exit to a second vault if the strategy changes.`,
          cost: `${gas} per rebalance; the $${capital} stays at risk`,
          time: '15 minutes a week',
        },
      ];
    default:
      return [
        {
          text: `Deposit $${capital} of USDC into ${name} on ${chain} through its own app, after reading the fees and the withdrawal rules.`,
          cost: `$${capital} of capital plus ${gas}`,
          time: '20 minutes',
        },
        {
          text: `Check the app's fees, TVL and withdrawal status every two weeks before adding or compounding capital.`,
          cost: `${gas} per action`,
          time: '10 minutes every two weeks',
        },
      ];
  }
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. Two steps are specific to
 * the protocol's category (Lending, Dexs, RWA, Risk Curators, Restaking, Basis Trading, Chain, Yield,
 * CeFi and the rest); the rest are the safety, cadence, holding, claim and record steps every position
 * needs. Everything is derived from the protocol's own record, never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasNote(chain);
  const [deploy, maintain] = categoryActions(p, capital, chain);
  return [
    {
      text: `Set up a fresh wallet for ${p.name} on ${chain}, fund it only with the amount you are willing to leave in the position, and store the recovery phrase offline.`,
      cost: `under $3 of gas to create and fund the wallet`,
      time: '5-10 minutes',
    },
    deploy!,
    maintain!,
    {
      text: `Make one small qualifying action each week, such as a deposit, a borrow, a swap, a vote or a claim, and keep every transaction in the same wallet so activity is counted.`,
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so it appears in several weekly snapshots, and do not move the capital to a new wallet mid-farm.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points or rewards page before you withdraw, and claim only from the domain or contract it publishes in its docs.`,
      cost: 'no fee to check; never pay to unlock a claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet address, the entry date, the amount and every transaction in a farm log, so you can repeat or unwind the plan.`,
      cost: 'nothing but a text file',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the page's live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'live',
    }));
}

/** A board row's compact form for data.js, carrying the farm plan and the model's working. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    token_status: 'pre-token',
    symbol: row.symbol,
    gecko_id: row.gecko_id,
    model: row.model,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiples = [...categoryMultiples(snapshot, model).values()].sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    multiples,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, size, ranks, order, spread, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board has ${board.length} rows, outside the gate's 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!(r.model.category_multiple > 0) || !Number.isFinite(r.model.category_multiple)) return `${r.slug} has category multiple ${r.model.category_multiple}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
