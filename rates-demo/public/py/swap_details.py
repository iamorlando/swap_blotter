from rateslib import from_json, dt, IRS, Solver, add_tenor, Curve,LineCurve,get_calendar, defaults, Dual
import pandas as pd
from typing import Dict, List
import numpy as np
from datetime import datetime


swap_context: Dict = {}

def _to_naive(ts_val):
    ts = pd.to_datetime(ts_val)
    for fn in ("tz_convert", "tz_localize"):
        try:
            ts = getattr(ts, fn)(None)
            break
        except Exception:
            continue
    return ts

def build_swap(row: pd.Series) -> IRS:
    global swap_context
    valuation_date = swap_context['valuation_date']
    cal = get_calendar(defaults.spec['usd_irs']['calendar'])
    fixings = swap_context.get('fixings', pd.Series(dtype=float))  # should be a series indexed by date
    if isinstance(fixings, pd.DataFrame):
        fixings = fixings.squeeze()
    if not fixings.empty:
        fixings = fixings.loc[cal.bus_date_range(fixings.index.min(), cal.add_bus_days(valuation_date, -1, True))]
    kwargs = {"leg2_fixings": fixings} if not fixings.empty else {}
    swp =IRS(
            row['StartDate'],
            row['TerminationDate'],
            notional=row['Notional'],
            fixed_rate=row['FixedRate'],
            spec="usd_irs",
            curves="sofr",
            **kwargs
        )
    return swp


#variables to set for a swap id on init, must be in scope for all calculations within the swap details modal

def set_swap_context(swap_row:pd.Series,curve_json:str,calibration_md:pd.DataFrame):
    global swap_context
    swap_context = {}
    # Normalize dates to naive datetimes (rateslib expects tz-naive)
    if 'StartDate' in swap_row:
        swap_row['StartDate'] = _to_naive(swap_row['StartDate'])
    if 'TerminationDate' in swap_row:
        swap_row['TerminationDate'] = _to_naive(swap_row['TerminationDate'])
    swap_context['swap_row'] = swap_row
    swap_context['curve_json'] = curve_json
    swap_context['curve']= from_json(curve_json)
    swap_context['valuation_date'] = _to_naive(swap_context['curve'].nodes.keys[0])
    swap_context['calibration_md'] = calibration_md
    swap_context['fixings'] = pd.Series(dtype=float)
    swap_context['solver'] = form_solver(
        swap_context['curve_json'],
        list(calibration_md['Term']),
        calibration_md
    )
def get_swap_fixing_index_name():
    return 'sofr' # TODO TIE TO rateslib defaults, get that from swap row (convert SOFR to usd_irs spec)
def get_inclusive_fixings_date_bounds():
    global swap_context
    cal = get_calendar('nyc') # TODO TIE TO rateslib defaults, get that from swap row (convert SOFR to usd_irs spec)
    end_date = cal.add_bus_days(swap_context['valuation_date'],-1,True)
    start_date = swap_context['swap_row']['StartDate']
    return (start_date,end_date)

def update_calibration_json_and_md(curve_json:str,calibration_md:pd.DataFrame):
    global swap_context
    swap_context['curve'] = from_json(curve_json)
    swap_context['valuation_date'] = pd.to_datetime(swap_context['curve'].nodes.keys[0]).tz_localize(None)
    if 'StartDate' in swap_context['swap_row']:
        swap_context['swap_row']['StartDate'] = _to_naive(swap_context['swap_row']['StartDate'])
    if 'TerminationDate' in swap_context['swap_row']:
        swap_context['swap_row']['TerminationDate'] = _to_naive(swap_context['swap_row']['TerminationDate'])
    swap_context['calibration_md'] = calibration_md
    swap_context['solver'] = form_solver(
        curve_json,
        list(swap_context['calibration_md']['Term']),
        swap_context['calibration_md']
    )
def form_solver(sofr_curve_json:str,terms:List[str],calibration_market_data:pd.DataFrame)->Solver:
    sofr_curve = from_json(sofr_curve_json)
    valuation_date = sofr_curve.nodes.keys[0]
    maturities = [add_tenor(valuation_date, t, "F", "nyc") for t in terms]
    solver = Solver(
        instruments=[IRS(valuation_date, m, spec="usd_irs", curves="sofr") for m in maturities],
        s=calibration_market_data["Rate"]*100,
        curves=[sofr_curve],
        instrument_labels=calibration_market_data['Term'],
    id="sofr",
    )
    return solver
def hydrate_swap():
    global swap_context 
    swp = build_swap(swap_context['swap_row'])
    swap_context['swap'] = swp
    
    return swp

def set_fixings(fixings_series: pd.Series):
    global swap_context
    if isinstance(fixings_series, pd.DataFrame):
        fixings_series = fixings_series.squeeze()
    if not isinstance(fixings_series, pd.Series):
        fixings_series = pd.Series(dtype=float)
    try:
        fixings_series.index = _to_naive(fixings_series.index)
    except Exception:
        pass
    swap_context['fixings'] = fixings_series
    return fixings_series

def get_swap_risk():
    risk_tbl = swap_context['swap'].delta(solver=swap_context['solver'])
    terms = [i[-1] for i in risk_tbl.index]
    return pd.Series(data=risk_tbl.values.squeeze(),index=terms)
    # ones = np.ones(len(terms))
    # dummy_df = pd.Series(data=ones,index=terms)
    # return dummy_df
