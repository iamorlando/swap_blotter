import pandas as pd
from pandas import DataFrame
import numpy as np


# Adapted from the rateslib swap pricing example:
# https://rateslib.com/py/en/2.0.x/z_swpm.html
# Changes: adjusted inputs, renamed variables, simplified output.
# rateslib is MIT Licensed: https://github.com/sonofeft/rateslib/blob/main/LICENSE
from rateslib import add_tenor, dt, Curve, Solver, IRS, dcf
from datetime import datetime, timedelta
from .datafeed import _source

VAL_DATE_STR = globals().get("VAL_DATE_STR")
if VAL_DATE_STR:
    try:
        _y, _m, _d = map(int, str(VAL_DATE_STR).split("-"))
        valuation_date = dt(_y, _m, _d)
    except Exception:
        today = datetime.now().date()
        valuation_date = dt(today.year, today.month, today.day)
else:
    today = datetime.now().date()
    valuation_date = dt(today.year, today.month, today.day)

maturities = [add_tenor(valuation_date, _, "F", "nyc") for _ in _source.index]
terms = _source.index.to_list()
sofr = Curve(
    id="sofr",
    convention="Act360",
    calendar="nyc",
    modifier="MF",
    interpolation="log_linear",
    nodes={
        **{valuation_date: 1.0},
        **{_: 1.0 for _ in maturities},
    },
)
sofr_json = sofr.to_json()

def calibrate_curve(data: DataFrame) -> DataFrame:
    global sofr
    global maturities
    global sofr_json
    _ = Solver(
        curves=[sofr],
        instruments=[
            IRS(valuation_date, _, spec="usd_irs", curves="sofr") for _ in maturities
        ],
        s=data["Rate"]  *100,
        instrument_labels=data["Term"],
        id="us_rates",
    )
    sofr_json = sofr.to_json()

    return sofr_json


display_terms = ["1B",
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
                 "40Y"]
def get_discount_factor_curve() -> pd.DataFrame:
    global sofr
    global display_terms
    return pd.DataFrame(
        columns=["df", "term"],
        data=[(float(sofr[add_tenor(valuation_date, display_terms[i], "F", "nyc")]), display_terms[i]) for i in range(len(display_terms))],
    ).set_index("term")

def get_zero_rate_curve() -> pd.DataFrame:
    global sofr
    global valuation_date
    global display_terms
    return pd.DataFrame(
        columns=["zero_rate", "term"],
        data=[(100*(np.log(sofr[add_tenor(valuation_date,display_terms[i], "F", "nyc")].real)/-dcf(valuation_date, add_tenor(valuation_date,display_terms[i], "F", "nyc"),'act360')), display_terms[i]) for i in range(len(display_terms))],
    ).set_index("term")

def get_forward_rate_curve() -> pd.DataFrame:
    global sofr
    global display_terms
    global valuation_date
    terms = display_terms
    maturities = [add_tenor(valuation_date, terms[i], "F", "nyc") for i in range(len(terms))]
    forwards =[(float(sofr.rate(maturities[i] - timedelta(days=1), maturities[i]))) for i in range(len(maturities))]
    days =[(maturities[i] - valuation_date).days for i in range(len(maturities))]
    new_terms = terms
    return pd.DataFrame(
        columns=["forward_rate","days", "term"],
        data=[(forwards[i], days[i], display_terms[i]) for i in range(len(new_terms))],
    ).set_index("term")
