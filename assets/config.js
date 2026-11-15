// Public connection settings. Publishable keys are designed to be shipped to browsers;
// all access is enforced by row-level security in the database.
const ENVS = {
  production: { name: "production", url: "https://auqhmkdeurfexrtzylyd.supabase.co", key: "sb_publishable_g2iFPCDFTggPiqXmsJgW4w_lUaoLbSu" },
  staging: { name: "staging", url: "https://pbnszadplkqxsvzronfp.supabase.co", key: "sb_publishable_NaeryF24hadyO9eqqXlypg_7vUBO_7y" }
};
const host = location.hostname;
export default (host === "daskies.com" || host === "www.daskies.com") ? ENVS.production : ENVS.staging;
