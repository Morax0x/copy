const { Pool } = require('pg');
require('dotenv').config();

// نأخذ الرابط الجديد والآمن من ملف .env
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) عبر الـ Pooler بنجاح!"))
    .catch(err => {
        console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
    });

module.exports = db;
