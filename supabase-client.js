// supabase-client.js

// استيراد دالة إنشاء العميل من مكتبة Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// بيانات الاتصال الخاصة بك في Supabase
const supabaseUrl = 'https://cqurenbrqciwuhswbogg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxdXJlbmJycWNpd3Voc3dib2dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5OTk4ODgsImV4cCI6MjA2OTU3NTg4OH0.WoLh024C_niRc2wfvoq9ExyoxzH94gsYRjEzk9nNtjQ';

// إنشاء وتصدير عميل Supabase لاستخدame في جميع أنحاء التطبيق
export const supabase = createClient(supabaseUrl, supabaseKey);
