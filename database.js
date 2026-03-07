const { Pool } = require('pg');

// ⚠️ ضع رابط الـ Connection pooling هنا (الذي ينتهي بـ 6543 وفيه كلمة pooler)
const connectionString = "postgresql://postgres:AzizEmorax123789456@db.sdboxeafvjsfoiphoulb.supabase.co:5432/postgres";

const db = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// إجبار الاتصال على IPv4 لحل مشكلة ENETUNREACH
const pg = require('pg');
if (pg.defaults) {
    pg.defaults.family = 4;
}

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) بنجاح!"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
