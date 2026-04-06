import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const SUPABASE_URL = 'https://fzrwnfojyvdpvrkcybte.supabase.co';

// Admin client — bypasses RLS. Only use in server-side (+server.ts) files.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
