// Public connection settings. Publishable keys are designed to be shipped to browsers;
// all access is enforced by row-level security in the database.
// payments: shows the Razorpay pay buttons. Turn on only after the Razorpay secrets are set in
// that project's Edge Functions (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET).
const ENVS = {
  production: { name: "production", url: "https://auqhmkdeurfexrtzylyd.supabase.co", key: "sb_publishable_g2iFPCDFTggPiqXmsJgW4w_lUaoLbSu", payments: false },
  staging: { name: "staging", url: "https://pbnszadplkqxsvzronfp.supabase.co", key: "sb_publishable_NaeryF24hadyO9eqqXlypg_7vUBO_7y", payments: false }
};
const host = location.hostname;
export default (host === "daskies.com" || host === "www.daskies.com") ? ENVS.production : ENVS.staging;
