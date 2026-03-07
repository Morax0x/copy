const { Pool } = require('pg');
require('dotenv').config();

// الرابط الخاص بك
const connectionString = "postgresql://postgres:Emorax%40123987456@db.uemdmkpsygjnpnoikqrp.supabase.co:5432/postgres";

const db = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // زودنا مهلة الاتصال
});

// هذا السطر يجبر الـ Pool على استخدام IPv4 فقط لتجنب مشكلة ENETUNREACH
const pg = require('pg');
if (pg.defaults) {
    pg.defaults.family = 4;
}

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) بنجاح!"))
    .catch(err => {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
        // لا ننهي العملية هنا، نترك PM2 يحاول مجدداً
    });

module.exports = db;
