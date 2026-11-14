
const SUPABASE_URL = "https://gzuggdzdfmgfobncvcyb.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yHy3nt_VaQuiX3bBxfzUEQ_Kbgv0ltR";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);

window.supabaseClient = supabaseClient;
