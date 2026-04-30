import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export const supabaseUrl = 'https://bkztwcyrqszqwicyqnzb.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrenR3Y3lycXN6cXdpY3lxbnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NDI3NDgsImV4cCI6MjA5MzExODc0OH0.2ZJdCCijDCAb-UDrjaxOLz9hlnFaZuE_K3ncG9KDQYE';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
