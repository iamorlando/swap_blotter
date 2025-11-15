# market_sim.py
from __future__ import annotations
import numpy as np
import pandas as pd
from pandas import DataFrame

# ---- Seed data (your curve) ----
_source = DataFrame({
    "Term": ["1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M",
             "10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y",
             "9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y"],
    "Rate": [5.309,5.312,5.314,5.318,5.351,5.382,5.410,5.435,5.452,5.467,
             5.471,5.470,5.467,5.457,5.445,5.208,4.990,4.650,4.458,4.352,
             4.291,4.250,4.224,4.210,4.201,4.198,4.199,4.153,4.047,3.941,
             3.719],
}).set_index("Term").apply(lambda x: x/100.0)  # stored internally as decimals (e.g., 0.05309)

# ---- Helpers to order tenors and work with neighbors ----
def _to_years(term: str) -> float:
    unit = term[-1].upper()
    n = float(term[:-1])
    if unit == "W":
        return n / 52.0
    if unit == "M":
        return n / 12.0
    if unit == "Y":
        return n
    raise ValueError(f"Unknown term: {term}")

def _ordered(df: DataFrame) -> DataFrame:
    out = df.copy()
    out["Years"] = [_to_years(t) for t in out.index]
    out = out.sort_values("Years")
    return out

# ---- Mutable state ----
_mut = _ordered(_source).drop(columns=["Years"])
_terms = _mut.index.to_list()

# persistent global factor to induce correlation across tenors/time
_global_factor = 0.0
_rng = np.random.default_rng()  # modern RNG

# ---- Public API ----
def get_datafeed() -> DataFrame:
    """Return the current full mutated curve (all terms)."""
    return _mut.copy()

def reset_datafeed():
    """Reset the curve to the original seed state."""
    global _mut, _global_factor
    _mut = _ordered(_source).drop(columns=["Years"])
    _global_factor = 0.0

def get_random_term() -> str:
    return _rng.choice(_terms)

def _is_decimal_scale() -> bool:
    try:
        v = float(_mut["Rate"].iloc[0])
    except Exception:
        return True
    return abs(v) < 1.0

def _bps_denom() -> float:
    """Return the divisor to convert basis points into rate units.
    - If rates are decimals (0.05), 1 bp = 0.0001 -> divide by 10000
    - If rates are percentage points (5.0), 1 bp = 0.01   -> divide by 100
    """
    return 10000.0 if _is_decimal_scale() else 100.0

def _neighbor_bounds(i: int, margin_bps: float) -> tuple[float, float]:
    """
    Compute lower/upper bounds for the ith tenor based on its neighbors.
    Ensures the moved point stays between adjacent points (± small margin).
    margin_bps is in basis points of rate units (e.g., 3 -> 0.03 in your scale).
    """
    margin = margin_bps / _bps_denom()
    rates = _mut["Rate"].to_numpy()
    n = len(rates)

    if n == 1:
        return rates[0] - margin, rates[0] + margin

    if i == 0:
        # only right neighbor
        r = rates[1]
        return r - margin, r + margin
    elif i == n - 1:
        # only left neighbor
        l = rates[n - 2]
        return l - margin, l + margin
    else:
        l, r = rates[i - 1], rates[i + 1]
        lo, hi = (l, r) if l <= r else (r, l)
        # allow tiny slack around the min/max neighbor
        return lo - margin, hi + margin

def simulate_tick(
    rho: float = 0.9,
    sigma_bps: float = 5.0,
    mean_revert: float = 0.02,
    margin_bps: float = 3.0,
    term: str | None = None,
) -> tuple[str, float]:
    """
    Move ONE random tenor (or the provided `term`) using:
      - persistent global factor (AR(1)) for correlation across terms/time
      - idiosyncratic noise
      - clipping into neighbor range ± margin_bps

    Parameters
    ----------
    rho : correlation (0..1) weight to the global factor
    sigma_bps : shock size in basis points for idiosyncratic noise
    mean_revert : AR(1) pull-to-zero for global factor (0..1 small)
    margin_bps : allowed slack beyond neighbor min/max (basis points)
    term : optional tenor label to move; if None, pick randomly

    Returns
    -------
    (moved_term, new_rate)
    """
    global _global_factor

    # pick tenor index
    label = term if term is not None else get_random_term()
    i = _terms.index(label)

    # update global factor (AR(1) mean-reverting random walk)
    _global_factor = (1.0 - mean_revert) * _global_factor + _rng.normal(0.0, 1.0)

    # compose shock: rho * global + sqrt(1-rho^2) * local
    local = _rng.normal(0.0, 1.0)
    sigma = sigma_bps / _bps_denom()
    shock = sigma * (rho * _global_factor + np.sqrt(max(0.0, 1.0 - rho**2)) * local)

    # apply to current rate
    cur = float(_mut.iloc[i, 0])
    proposal = cur + shock

    # clip to neighbor band ± margin
    lo, hi = _neighbor_bounds(i, margin_bps=margin_bps)
    new_rate = float(np.clip(proposal, lo, hi))

    # keep precision to reflect bps-level moves when using decimals
    _mut.iloc[i, 0] = round(new_rate, 6)
    return label, new_rate

def get_updated_datafeed() -> DataFrame:
    """
    Advance one tick and return a 'delta' view:
    same as the prior curve but with ONE term updated.
    """
    label, _ = simulate_tick()
    df = get_datafeed()
    # optional: to mimic your prior function that only differs in 1 row
    # (here we already mutated _mut; returning a copy is enough)
    return df


# usage
# import time

# reset_datafeed()
# print(get_datafeed().head())

# for _ in range(5):
#     term, new_rate = simulate_tick(rho=0.85, sigma_bps=4.0, margin_bps=2.0)
#     print("moved:", term, "->", new_rate)
#     print(get_datafeed().loc[[term]])
#     time.sleep(0.1)
