import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fzrwnfojyvdpvrkcybte.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cnduZm9qeXZkcHZya2N5YnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTIyOTUsImV4cCI6MjA4ODU4ODI5NX0.vTabFKkFKmynTWJ9J8qy7_pfDUql7INZfVGyTkk-PII';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
