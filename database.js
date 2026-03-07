const { Pool } = require('pg');

// الرابط الصحيح والمضمون للـ Pooler
const connectionString = "postgresql://postgres.sdboxeafvjsfoiphoulb:AzizEmorax123789456@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres";

const db = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false },
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// هذا السطر السحري يجبر الاستضافة تتصل بشكل صحيح (IPv4)
const pg = require('pg');
if (pg.defaults) {
    pg.defaults.family = 4;
}

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) بنجاح!"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message));

module.exports = db;
