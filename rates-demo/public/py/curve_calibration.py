import pandas as pd
from pandas import DataFrame
# Adapted from the rateslib swap pricing example:
# https://rateslib.com/py/en/2.0.x/z_swpm.html
# Changes: adjusted inputs, renamed variables, simplified output.
# rateslib is MIT Licensed: https://github.com/sonofeft/rateslib/blob/main/LICENSE
from rateslib import add_tenor, dt, Curve, Solver, IRS
valuation_date = dt(2023, 9, 29)
from .datafeed import get_mutaded_datafeed
data["Termination"] = [add_tenor(valuation_date, _, "F", "nyc") for _ in data["Term"]]
sofr = Curve(
    id="sofr",
    convention="Act360",
    calendar="nyc",
    modifier="MF",
    interpolation="log_linear",
    nodes={
        **{valuation_date: 1.0},  
        **{_: 1.0 for _ in data["Termination"]},
    }
)
solver = Solver(
    curves=[sofr],
    instruments=[IRS(valuation_date, _, spec="usd_irs", curves="sofr") for _ in data["Termination"]],
    s=data["Rate"],
    instrument_labels=data["Term"],
    id="us_rates",
)