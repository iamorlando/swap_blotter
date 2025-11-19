import pandas as pd
from pandas import DataFrame
import numpy as np


# Adapted from the rateslib swap pricing example:
# https://rateslib.com/py/en/2.0.x/z_swpm.html
# Changes: adjusted inputs, renamed variables, simplified output.
# rateslib is MIT Licensed: https://github.com/sonofeft/rateslib/blob/main/LICENSE
from rateslib import add_tenor, dt, Curve, Solver, IRS, dcf, from_json
from datetime import datetime, timedelta

valuation_date:datetime
sofr: Curve | None = None  # to be set via set_curve_from_json
sofr_json: str | None = None



def set_curve_from_json(json_str: str):
    """
    Initialize the global rateslib curve from stored calibration JSON.
    """
    global sofr, sofr_json, valuation_date
    sofr = from_json(json_str)
    valuation_date = sofr.nodes.keys[0]
    sofr_json = json_str
    return sofr


def calibrate_curve(data: DataFrame) -> str:
    """
    Calibrate the stored curve using market data rows [{Term, Rate}].
    Rates are expected in decimals (0.053 -> 5.3%).
    """
    global sofr_json
    df = data.copy()
    if not {"Term", "Rate"}.issubset(df.columns):
        raise ValueError("calibrate_curve: data must have Term and Rate columns")
    df["Rate"] = df["Rate"].astype(float)
    terms = list(df["Term"])
    df['maturity'] = [add_tenor(valuation_date, t, "F", "nyc") for t in terms]
    df = df.set_index('maturity').sort_index(ascending=True)
    maturities = df.index
    df = df.reset_index().set_index('Term')
    Solver(
        curves=[sofr],
        instruments=[IRS(valuation_date, m, spec="usd_irs", curves="sofr") for m in maturities],
        s=df["Rate"] * 100,  # rateslib expects percents
        instrument_labels=df.index.tolist(),
        id="us_rates",
    )
    sofr_json = sofr.to_json()
    return sofr_json


display_terms = [
    "1B",
    "2B",
    "7D",
    "1M",
    "3M",
    "6M",
    "1Y",
    "2Y",
    "3Y",
    "5Y",
    "7Y",
    "10Y",
    "20Y",
    "30Y",
    "40Y",
]


def get_discount_factor_curve() -> pd.DataFrame:
    return pd.DataFrame(
        columns=["df", "term"],
        data=[
            (float(sofr[add_tenor(valuation_date, t, "F", "nyc")]), t)
            for t in display_terms
        ],
    ).set_index("term")


def get_zero_rate_curve() -> pd.DataFrame:
    return pd.DataFrame(
        columns=["zero_rate", "term"],
        data=[
            (
                100
                * (
                    np.log(sofr[add_tenor(valuation_date, t, "F", "nyc")].real)
                    / -dcf(valuation_date, add_tenor(valuation_date, t, "F", "nyc"), "act360")
                ),
                t,
            )
            for t in display_terms
        ],
    ).set_index("term")


def get_forward_rate_curve() -> pd.DataFrame:
    maturities = [add_tenor(valuation_date, t, "F", "nyc") for t in display_terms]
    forwards = [float(sofr.rate(m - timedelta(days=1), m)) for m in maturities]
    days = [(m - valuation_date).days for m in maturities]
    return pd.DataFrame(
        columns=["forward_rate", "days", "term"],
        data=[
            (forwards[i], days[i], display_terms[i]) for i in range(len(display_terms))
        ],
    ).set_index("term")
