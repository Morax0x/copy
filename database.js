const { Client } = require('pg');

// سنضع الرابط هنا لاحقاً عندما تنهي Supabase صيانتها
const db = new Client({
    connectionString: "رابط_سوبابيس_سيوضع_هنا_لاحقاً", 
    ssl: { rejectUnauthorized: false }
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) بنجاح!"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err));

module.exports = db;
