const { Pool } = require('pg');
require('dotenv').config(); // لجلب الرابط السري من ملف .env

// نستخدم Pool بدلاً من Client للسماح بتنفيذ أوامر متعددة في نفس الوقت بدون تصادم
const db = new Pool({
    connectionString: process.env.DATABASE_URL, // الرابط محمي هنا
    ssl: { rejectUnauthorized: false },
    max: 20, // أقصى عدد من الاتصالات المتزامنة (ممتاز لسيرفر نشط)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

db.connect()
    .then(() => console.log("✅ تم الاتصال بالبنك المركزي (Supabase) بنجاح!"))
    .catch(err => console.error("❌ خطأ في الاتصال بقاعدة البيانات. تأكد من الرابط في ملف .env:", err.message));

module.exports = db;
