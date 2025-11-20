from rateslib import from_json, dt, IRS, Solver, add_tenor, Curve,LineCurve,get_calendar, defaults, Dual, FloatPeriod, NoInput
import pandas as pd
from typing import Dict, List, Union, Tuple
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
    set_curve_deltas()
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


# def update_calibration_json_and_md(curve_json:str,calibration_md:pd.DataFrame):
#     global swap_context
#     swap_context['swap_row']['NPV'] = 0.0
#     swap_context['swap_row']['ParRate'] = 0.0
#     swap_context['curve'] = from_json(curve_json)
#     swap_context['valuation_date'] = pd.to_datetime(swap_context['curve'].nodes.keys[0]).tz_localize(None)
#     if 'StartDate' in swap_context['swap_row']:
#         swap_context['swap_row']['StartDate'] = _to_naive(swap_context['swap_row']['StartDate'])
#     if 'TerminationDate' in swap_context['swap_row']:
#         swap_context['swap_row']['TerminationDate'] = _to_naive(swap_context['swap_row']['TerminationDate'])
#     swap_context['calibration_md'] = calibration_md
#     swap_context['solver'] = form_solver(
#         curve_json,
#         list(swap_context['calibration_md']['Term']),
#         swap_context['calibration_md']
#     )
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
    set_curve_deltas()
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
    save_swap_float_base_flows()
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

def reproject_sensitivities_to_md(duals:List[Dual])->pd.DataFrame:
    global swap_context
    solver:Solver = swap_context['solver']
    currency = 'USD' # TODO TIE TO rateslib defaults, get that from swap row (convert SOFR to usd_irs spec)
    dualsdict = [{currency:d} for d in duals]
    ds = [solver.delta(d) for d in dualsdict]
    return form_risk_matrix(ds,referenced_base_length=len(ds[0].index))



def save_swap_fixed_base_flows():
    global swap_context
    swp = swap_context['swap']
    calibrated_curve = swap_context['curve']
    valuation_date = swap_context['valuation_date']
    dfs = [calibrated_curve[d.payment] for d in swp.leg1.periods if d.payment > valuation_date]
    flows =get_fixed_cashflows()
    swap_context.setdefault('fixed_leg',{})
    swap_context['fixed_leg']['cashflows'] = flows
    swap_context['fixed_leg']['df_sensitivities'] = reproject_sensitivities_to_md(dfs)

def save_swap_float_base_flows():
    global swap_context
    swp = swap_context['swap']
    calibrated_curve = swap_context['curve']
    valuation_date = swap_context['valuation_date']
    dfs = [calibrated_curve[d.payment] for d in swp.leg2.periods if d.payment > valuation_date]
    rates = [p.rate(curve=calibrated_curve) for p in swp.leg2.periods if p.payment > valuation_date]
    flows =get_floating_cashflows()
    swap_context.setdefault('float_leg',{})
    swap_context['float_leg']['cashflows'] = flows
    swap_context['float_leg']['df_sensitivities'] = reproject_sensitivities_to_md(dfs)
    swap_context['float_leg']['rate_sensitivities'] = reproject_sensitivities_to_md(rates)

def get_md_changes(new_md:pd.DataFrame=None)->pd.DataFrame:
    base_md=swap_context.get('calibration_md',pd.DataFrame())
    if base_md is None or base_md.empty:
        return pd.DataFrame()
    base_md = base_md.set_index('Term')[['Rate']].squeeze()
    if new_md is None or new_md.empty:
        new_md = base_md
    else:
        new_md['Rate'] = new_md['Rate']
        new_md = new_md.set_index('Term')[['Rate']].squeeze() * 100  # rateslib expects percents
    return (new_md - base_md).fillna(0.0).to_numpy(dtype='float64')

def get_fixed_flows(new_md:pd.DataFrame=None)->pd.DataFrame:
    global swap_context
    md_changes = get_md_changes(new_md)
    df = swap_context['fixed_leg']['cashflows'].copy()
    dfs = df['Discount Factor'].to_numpy(dtype='float64')
    sensitivities = swap_context['fixed_leg']['df_sensitivities'] 
    updated_dfs = dfs + (sensitivities @ (md_changes * 100))
    df['Discount Factor'] = updated_dfs
    df['NPV'] = updated_dfs * df['Cashflow']
    return df

def get_float_flows(new_md:pd.DataFrame=None)->pd.DataFrame:
    global swap_context
    md_changes = get_md_changes(new_md)
    df = swap_context['float_leg']['cashflows'].copy()
    dfs = df['Discount Factor'].to_numpy(dtype='float64')
    rates = df['Rate'].to_numpy(dtype='float64')
    sensitivities = swap_context['float_leg']['df_sensitivities'] 
    rate_sensitivities = swap_context['float_leg']['rate_sensitivities']
    updated_dfs = dfs + (sensitivities @ (md_changes * 100))
    updated_rates = rates + (rate_sensitivities @ (md_changes * 100))
    df['Discount Factor'] = updated_dfs
    df['Rate'] = updated_rates
    df['Cashflow'] = -df['Notional']*df['Accrual Fraction']*(df['Rate']/100)
    df['NPV'] = df['Discount Factor']*df['Cashflow']
    return df


def _form_fixings_df(period_idx:int)->pd.DataFrame:
    global swap_context
    curve = swap_context['curve']
    swp = swap_context['swap']
    table = swp.leg2.periods[period_idx].fixings_table(curve=curve)
    table=table['sofr']
    cols = ['ObservationDate', 'AccrualFraction', 'HedgingNotional', 'Fixing']
    df = pd.DataFrame(table, columns=cols,index = table.index).assign(
        AccrualFraction=lambda x: table['dcf'],
        ObservationDate=lambda x: table.index,
        HedgingNotional=lambda x: table['notional'],
        Fixing=lambda x: table['rates'],
        Risk = lambda x: table['risk'],
    )
    df = df.rename(columns={'ObservationDate':'Observation Date','AccrualFraction':'Accrual Fraction','HedgingNotional':'Hedging Notional'})
    swap_context.setdefault('float_leg',{})\
        .setdefault('periods',{})\
        .setdefault(period_idx, {})['fixings_df'] = df
    return df
def get_fixings_df(period_idx:int)->pd.DataFrame:
    global swap_context
    return swap_context.get('float_leg',{})\
        .get('periods',{})\
            .get(period_idx,{})\
                .get('fixings_df',_form_fixings_df(period_idx))

def set_curve_deltas():
    global swap_context
    curve = swap_context['curve']
    solver = swap_context['solver']
    deltas = [solver.delta({'USD':curve[d]})for d in curve.nodes.keys]
    base_md_len = len(swap_context['calibration_md'])
    dm = form_risk_matrix(deltas,referenced_base_length=base_md_len)
    swap_context['curve_risk'] = dm
    return dm
def get_shocked_curve(new_md:pd.DataFrame)->Curve:
    global swap_context
    base_curve:Curve = swap_context['curve']
    md_changes = get_md_changes(new_md)
    deltas = swap_context['curve_risk']
    updated_dfs = np.array([base_curve[d].real for d in base_curve.nodes.keys]) + (deltas @ (md_changes * 100))
    shocked_nodes = {d: v for d, v in zip(base_curve.nodes.keys, updated_dfs)}
    shocked_curve = Curve(
        id=base_curve.id,
        convention=base_curve.meta.convention,
        calendar=base_curve.meta.calendar,
        modifier=base_curve.meta.modifier,
        interpolation='log_linear',
        nodes=shocked_nodes
    )
    return shocked_curve


def get_updated_fixings_df(idx,new_md:pd.DataFrame)->Tuple[float,float,pd.DataFrame]:
    # return period rate, df, and fixings df with updated data
    global swap_context
    shocked_curve = get_shocked_curve(new_md)
    base_fixings_df = get_fixings_df(idx)
    new_fixings_df = swap_context['swap'].leg2.periods[idx].fixings_table(curve=shocked_curve)['sofr'] # TODO TIE sofr to swap row
    only_forwsrds_df = new_fixings_df.loc[lambda x: x.index >= swap_context['valuation_date']]
    base_fixings_df.loc[lambda x: x.index >= swap_context['valuation_date'], 'Fixing'] = new_fixings_df['rates']
    base_fixings_df['Hedging Notional'] = only_forwsrds_df['notional']
    base_fixings_df['Risk'] = only_forwsrds_df['risk']
    period_rate = swap_context['swap'].leg2.periods[idx].rate(curve=shocked_curve).real
    period_df = shocked_curve[swap_context['swap'].leg2.periods[idx].payment].real
    return period_rate,period_df,base_fixings_df



def get_clicked_cashflow_fixings_data(idx,new_md:pd.DataFrame)->Tuple[pd.Series,pd.DataFrame]:
    # returns the casfhlow row with i[dated data in the first element, the fixings df with updated data in the second]
    global swap_context
    if 'float_leg' not in swap_context or 'cashflows' not in swap_context['float_leg']:
        return pd.Series(dtype=float),pd.DataFrame()
    rate,df,fixings_df = get_updated_fixings_df(idx,new_md)
    cf_row = swap_context['float_leg']['cashflows'].iloc[idx].copy()
    cf_row['Rate'] = rate
    cf_row['Discount Factor'] = df
    cf_row['Cashflow'] = -cf_row['Notional']*cf_row['Accrual Fraction']*(rate/100)
    cf_row['NPV'] = cf_row['Cashflow'] * df
    fixings_df = fixings_df.drop(columns=['Risk'])
    return cf_row,fixings_df






from datetime import datetime

def _fmt_date(val) -> str:
    """Format a date-like value as 'dd MMM yyyy'."""
    if pd.isna(val):
        return ""
    if isinstance(val, str):
        try:
            val = pd.to_datetime(val)
        except Exception:
            return val
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.strftime("%d %b %Y")
    return str(val)

def _fmt_num(val, decimals=2, thousand_sep=True) -> str:
    if pd.isna(val):
        return ""
    try:
        v = float(val)
    except Exception:
        return str(val)
    if thousand_sep:
        return f"{v:,.{decimals}f}"
    else:
        return f"{v:.{decimals}f}"

def build_swap_termsheet_html(
    swap_row: pd.Series,
    dealer_name: str = 'ACME INC',
    fixed_leg_ccy: str = "USD",
    float_leg_ccy: str = "USD",
) -> str:
    """
    Build an HTML term sheet for a single swap row.

    Expected columns in swap_row:
      ID, CounterpartyID, StartDate, TerminationDate, FixedRate,
      NPV, ParRate, ParSpread, Notional, SwapType, PayFixed, PricingTime
    """

    # --- Extract & format data ---
    trade_id      = str(swap_row.get("ID", ""))
    cpty          = str(swap_row.get("CounterpartyID", "Counterparty"))
    start_date    = _fmt_date(swap_row.get("StartDate"))
    end_date      = _fmt_date(swap_row.get("TerminationDate"))
    pricing_time  = _fmt_date(swap_row.get("StartDate"))
    fixed_rate    = float(swap_row.get("FixedRate", 0.0))
    par_rate      = float(swap_row.get("ParRate", fixed_rate))
    par_spread_bp = float(swap_row.get("ParSpread", 0.0))   # looks like bp already in your data
    npv           = 0.0
    notional      = float(swap_row.get("Notional", 0.0))
    swap_type     = str(swap_row.get("SwapType", "SOFR"))
    pay_fixed     = bool(swap_row.get("PayFixed", False))

    # sign convention: your example has negative notional
    notional_abs = abs(notional)

    fixed_payer   = cpty if pay_fixed else dealer_name
    fixed_receiver = dealer_name if pay_fixed else cpty

    # --- HTML template ---
    html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Swap Term Sheet - {trade_id}</title>
  <style>
    body {{
      font-family: Arial, sans-serif;
      font-size: 11px;
      margin: 24px;
      color: #222;
    }}
    h1, h2, h3 {{
      margin: 6px 0;
    }}
    h1 {{
      font-size: 16px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
    }}
    h2 {{
      font-size: 13px;
      border-bottom: 1px solid #888;
      padding-bottom: 3px;
      margin-top: 18px;
    }}
    table {{
      border-collapse: collapse;
      width: 100%;
      margin-top: 6px;
    }}
    th, td {{
      border: 1px solid #bbb;
      padding: 4px 6px;
      vertical-align: top;
    }}
    th {{
      background: #f4f4f4;
      text-align: left;
      font-weight: bold;
    }}
    .two-col {{
      width: 50%;
      vertical-align: top;
      border: none;
    }}
    .two-col table {{
      width: 100%;
      margin-top: 0;
    }}
    .small {{
      font-size: 9px;
      color: #555;
    }}
  </style>
</head>
<body>

  <h1>Interest Rate Swap Term Sheet</h1>

  <table>
    <tr>
      <th style="width: 25%;">Dealer</th>
      <td style="width: 75%;">{dealer_name}</td>
    </tr>
    <tr>
      <th>Client</th>
      <td>{cpty}</td>
    </tr>
    <tr>
      <th>Trade ID</th>
      <td>{trade_id}</td>
    </tr>
    <tr>
      <th>Trade Date</th>
      <td>{pricing_time}</td>
    </tr>
  </table>

  <h2>Key Economic Terms</h2>
  <table>
    <tr><th style="width: 30%;">Field</th><th>Value</th></tr>
    <tr><td>Product</td><td>{swap_type} Interest Rate Swap</td></tr>
    <tr><td>Effective Date</td><td>{start_date}</td></tr>
    <tr><td>Termination Date</td><td>{end_date}</td></tr>
    <tr><td>Notional</td><td>{fixed_leg_ccy} {_fmt_num(notional_abs, 0)}</td></tr>
    <tr><td>NPV (to Dealer)</td><td>{fixed_leg_ccy} {_fmt_num(npv, 2)}</td></tr>
    <tr><td>Fixed Rate</td><td>{_fmt_num(fixed_rate, 4)} %</td></tr>
    <tr><td>Fixed Payer</td><td>{fixed_payer}</td></tr>
    <tr><td>Fixed Receiver</td><td>{fixed_receiver}</td></tr>
  </table>

  <h2>Leg Details</h2>
  <table style="border: none;">
    <tr>
      <td class="two-col">
        <h3>Fixed Leg</h3>
        <table>
          <tr><th style="width: 40%;">Item</th><th>Details</th></tr>
          <tr><td>Payer</td><td>{fixed_payer}</td></tr>
          <tr><td>Receiver</td><td>{fixed_receiver}</td></tr>
          <tr><td>Currency</td><td>{fixed_leg_ccy}</td></tr>
          <tr><td>Notional</td><td>{fixed_leg_ccy} {_fmt_num(notional_abs, 0)}</td></tr>
          <tr><td>Fixed Rate</td><td>{_fmt_num(fixed_rate, 4)} %</td></tr>
          <tr><td>Day Count</td><td>Actual/360</td></tr>
          <tr><td>Payment Frequency</td><td>Quarterly</td></tr>
          <tr><td>Business Day Convention</td><td>Modified Following</td></tr>
        </table>
      </td>
      <td class="two-col">
        <h3>Floating Leg</h3>
        <table>
          <tr><th style="width: 40%;">Item</th><th>Details</th></tr>
          <tr><td>Index</td><td>{swap_type} Overnight</td></tr>
          <tr><td>Currency</td><td>{float_leg_ccy}</td></tr>
          <tr><td>Spread</td><td>{_fmt_num(par_spread_bp, 4)} bp</td></tr>
          <tr><td>Reset Frequency</td><td>Daily (compounded)</td></tr>
          <tr><td>Payment Frequency</td><td>Quarterly</td></tr>
          <tr><td>Day Count</td><td>Actual/360</td></tr>
          <tr><td>Business Day Convention</td><td>Modified Following</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <h2>Notes & Disclaimers</h2>
  <p class="small">
    This term sheet is for discussion purposes only and does not constitute an offer, commitment,
    recommendation or advice to enter into any transaction. Any transaction will be subject to
    final credit approval, internal review and execution of definitive documentation.
  </p>

</body>
</html>
"""
    return html.strip()

