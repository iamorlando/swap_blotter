import pandas as pd
from pandas import DataFrame

# Adapted from the rateslib swap pricing example:
# https://rateslib.com/py/en/2.0.x/z_swpm.html
# Changes: adjusted inputs, renamed variables, simplified output.
# rateslib is MIT Licensed: https://github.com/sonofeft/rateslib/blob/main/LICENSE
from rateslib import add_tenor, dt, Curve, Solver, IRS
from datetime import datetime, timedelta
from .datafeed import _source

today = datetime.now().date()
valuation_date = dt(today.year, today.month, today.day)

maturities = [add_tenor(valuation_date, _, "F", "nyc") for _ in _source["Term"]]
terms = _source["Term"].to_list()
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


def calibrate_curve(data: DataFrame) -> DataFrame:
    global sofr
    global maturities
    _ = Solver(
        curves=[sofr],
        instruments=[
            IRS(valuation_date, _, spec="usd_irs", curves="sofr") for _ in maturities
        ],
        s=data["Rate"],
        instrument_labels=data["Term"],
        id="us_rates",
    )
    return sofr


def get_discount_factor_curve() -> pd.DataFrame:
    global sofr
    global maturities
    global terms
    return pd.DataFrame(
        columns=["df", "term"],
        data=[(float(sofr.df(maturities[i])), terms[i]) for i in range(len(terms))],
    ).set_index("term")

def get_zero_rate_curve() -> pd.DataFrame:
    global sofr
    global maturities
    global valuation_date
    global terms
    return pd.DataFrame(
        columns=["zero_rate", "term"],
        data=[(float(sofr.rate(valuation_date, maturities[i])), terms[i]) for i in range(len(terms))],
    ).set_index("term")

def get_forward_rate_curve() -> pd.DataFrame:
    global sofr
    global maturities
    global valuation_date
    global terms
    forwards =[float(sofr.rate(valuation_date, valuation_date+timedelta(days=1)))] + [(float(sofr.rate(maturities[i], maturities[i] - timedelta(days=1)))) for i in range(len(maturities))]
    days = [0]+[(maturities[i] - valuation_date).days for i in maturities]
    new_terms = ["ON"] + terms
    return pd.DataFrame(
        columns=["forward_rate","days", "term"],
        data=[(forwards[i], days[i], new_terms[i]) for i in range(len(new_terms))],
    ).set_index("term")