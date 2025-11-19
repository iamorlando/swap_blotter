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
    start_date = cal.add_bus_days(swap_context['swap_row']['StartDate'],-1,True)
    return (start_date,end_date)

def get_fixed_cashflows()->pd.DataFrame:
    global swap_context
    swap:IRS = swap_context['swap']
    curve:Curve = swap_context['curve']
    cfs = swap.leg1.cashflows(curve=curve)
    return cfs[['Period','Ccy','Acc Start','Acc End','Payment','DCF','Notional','DF','Rate','Cashflow','NPV',]].rename(columns={'Acc Start':'Accrual Start','Acc End':'Accrual End','Payment':'Payment Date','DCF':'Accrual Fraction','DF':'Discount Factor'})
def get_floating_cashflows()->pd.DataFrame:
    global swap_context
    swap:IRS = swap_context['swap']
    curve:Curve = swap_context['curve']
    cfs = swap.leg2.cashflows(curve=curve)
    return cfs[['Period','Ccy','Acc Start','Acc End','Payment','DCF','Notional','DF','Rate','Cashflow','NPV',]].rename(columns={'Acc Start':'Accrual Start','Acc End':'Accrual End','Payment':'Payment Date','DCF':'Accrual Fraction','DF':'Discount Factor'})


def update_calibration_json_and_md(curve_json:str,calibration_md:pd.DataFrame):
    global swap_context
    swap_context['swap_row']['NPV'] = 0.0
    swap_context['swap_row']['ParRate'] = 0.0
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
        s=calibration_market_data["Rate"],
        curves=[sofr_curve],
        instrument_labels=calibration_market_data['Term'],
    id="sofr",
    )
    return solver
def hydrate_swap():
    global swap_context 
    swp = build_swap(swap_context['swap_row'])
    swap_context['swap'] = swp
    revalue_swap()
    
    return swp
def get_current_swap_price()->pd.Series:
    global swap_context
    npv = swap_context['swap_row']['NPV']
    parrate = swap_context['swap_row']['ParRate']
    return pd.Series({'NPV':npv,'ParRate':parrate})

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

def update_curve_in_context(json_str: str,curve_md:pd.DataFrame):
    global swap_context
    swap_context['curve'] = from_json(json_str)
    swap_context['curve_json'] = json_str
    swap_context['calibration_md'] = curve_md
    swap_context['solver'] = form_solver(
        json_str,
        list(curve_md['Term']),
        curve_md
    )
    revalue_swap()
def revalue_swap():
    global swap_context
    swp:IRS = swap_context['swap']
    solver:Solver = swap_context['solver']
    npv = swp.npv(solver=solver).real
    parrate = swp.rate(solver=solver).real
    swap_context['swap_row']['NPV'] = npv
    swap_context['swap_row']['ParRate'] = parrate
    save_swap_fixed_base_flows()
def get_swap_risk():
    risk_tbl = swap_context.setdefault('swap',build_swap(swap_context['swap_row'])).delta(solver=swap_context['solver'])
    terms = [i[-1] for i in risk_tbl.index]
    return pd.Series(data=risk_tbl.values.squeeze(),index=terms)
    # ones = np.ones(len(terms))
    # dummy_df = pd.Series(data=ones,index=terms)
    # return dummy_df
def form_risk_matrix(deltas:List[pd.DataFrame],referenced_base_length:int=0)->np.ndarray:
    arr = np.zeros((len(deltas),referenced_base_length))
    for i,d in enumerate(deltas):
        arr[i] = d.to_numpy().squeeze()
    return arr

def get_df_sensitivities(duals:List[Dual])->pd.DataFrame:
    global swap_context
    solver:Solver = swap_context['solver']
    currency = 'USD' # TODO TIE TO rateslib defaults, get that from swap row (convert SOFR to usd_irs spec)
    dualsdict = [{currency:d} for d in duals]
    dfs = [solver.delta(d) for d in dualsdict]
    return form_risk_matrix(dfs,referenced_base_length=len(dfs[0].index))

def save_swap_fixed_base_flows():
    global swap_context
    swp = swap_context['swap']
    solver = swap_context['solver']
    calibrated_curve = swap_context['curve']
    valuation_date = swap_context['valuation_date']
    l1_dfs = [calibrated_curve[d.payment] for d in swp.leg1.periods if d.payment > valuation_date]
    flows =get_fixed_cashflows()
    swap_context.setdefault('fixed_leg',{})
    swap_context['fixed_leg']['cashflows'] = flows
    swap_context['fixed_leg']['df_sensitivities'] = get_df_sensitivities(l1_dfs)

def get_fixed_flows(new_md:pd.DataFrame=None)->pd.DataFrame:
    global swap_context
    base_md=swap_context.get('calibration_md',pd.DataFrame())
    if base_md is None or base_md.empty:
        return pd.DataFrame()
    base_md = base_md.set_index('Term')[['Rate']].squeeze()
    if new_md is None or new_md.empty:
        new_md = base_md
    else:
        new_md['Rate'] = new_md['Rate']
        new_md = new_md.set_index('Term')[['Rate']].squeeze() * 100  # rateslib expects percents
    md_changes = (new_md - base_md).fillna(0.0).to_numpy(dtype='float64')
    df = swap_context['fixed_leg']['cashflows'].copy()
    dfs = df['Discount Factor'].to_numpy(dtype='float64')
    sensitivities = swap_context['fixed_leg']['df_sensitivities'] 
    updated_dfs = dfs + (sensitivities @ (md_changes * 100))
    df['Discount Factor'] = updated_dfs
    df['NPV'] = updated_dfs * df['Cashflow']
    return df
