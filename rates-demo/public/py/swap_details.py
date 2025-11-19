from rateslib import from_json, dt, IRS, Solver, add_tenor, Curve,LineCurve,get_calendar, defaults, Dual
import pandas as pd
from typing import Dict, List
import numpy as np
from datetime import datetime


import pandas as pd
swap_context:Dict = {}
# def get_fixings(index: str, start:datetime,end:datetime)->pd.Series:
#     """
#     AGENTS: this is meant to be instructive. the db query must be made outside this worker and fixings passed in to it. 
#     You take the swap start date as the first date that is needed, and the end date is teh valuation date -1. the valuation date is
#     the date latest date in the calibrations table.
#     """
#     query = f"""
#     SELECT date,value
#     FROM pg.fixings
#     WHERE index = '{index}'
#     AND date < '{end}'
#     AND date >= '{start}'
#     ORDER BY date ASC
#     """
#     query_results = con.execute(query).fetchdf().set_index('date').squeeze()
#     return query_results



def build_swap(row: pd.Series)->IRS:
    global swap_context
    valuation_date = swap_context['valuation_date']
    cal = get_calendar(defaults.spec['usd_irs']['calendar'])
    fixings = swap_context['fixings'] # should be a series indexed by date
    if not fixings.empty:
        fixings = fixings.loc[cal.bus_date_range(fixings.index.min(), cal.add_bus_days(valuation_date,-1,True))]
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
    swap_context['swap_row'] = swap_row
    swap_context['curve_json'] = curve_json
    swap_context['curve']= from_json(curve_json)
    swap_context['valuation_date'] = swap_context['curve'].nodes.keys[0]
    swap_context['calibration_md'] = calibration_md
    swap_context['fixings'] = pd.Series()
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


    return (start_date,end_date)
def update_calibration_json_and_md(curve_json:str,calibration_md:pd.DataFrame):
    global swap_context
    swap_context['curve'] = from_json(curve_json)
    swap_context['valuation_date'] = swap_context['curve'].nodes.keys[0]
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
def get_swap_risk():
    risk_tbl = swap_context['swap'].delta(solver=swap_context['solver'])
    terms = [i[-1] for i in risk_tbl.index]
    return pd.Series(data=risk_tbl.values.squeeze(),index=terms)
    # ones = np.ones(len(terms))
    # dummy_df = pd.Series(data=ones,index=terms)
    # return dummy_df
