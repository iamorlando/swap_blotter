// Calibration worker: loads rateslib via micropip, loads public python modules,
// calibrates curves using the latest market data, returns Discount/Zero/Forward curves.
export {};

const ctx: any = self as any;

let pyodide: any = null;
let initialized = false;

async function init(baseUrl: string, datafeedUrl: string, calibUrl: string,swapId: string) {
  
}
ctx.onmessage = async (ev: MessageEvent) => {

};
