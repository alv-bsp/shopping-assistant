// Configurazione Supabase. La chiave "publishable" (o "anon") è pensata per stare nel client:
// la protezione la fanno le policy RLS sulla tabella kv. Non mettere mai qui la secret / service_role.
// Se SUPABASE_KEY è vuota l'app funziona solo in locale, senza login né sincronizzazione.
export const SUPABASE_URL = "https://pmfhqghhfeqmewsdirri.supabase.co";
export const SUPABASE_KEY = "sb_publishable_hgCeVcOpHHDwZwlj5OyQ-A_nZ5Wo68-";
