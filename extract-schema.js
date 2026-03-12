// احفظ هذا الكود في ملف باسم extract-schema.js وشغله باستخدام node extract-schema.js
const sqlite3 = require('sqlite3').verbose();

// تأكد أن المسار يشير إلى ملف قاعدة البيانات القديمة الخاص بك
const dbPath = './mainDB.sqlite'; 

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error("❌ فشل فتح القاعدة القديمة:", err.message);
        return;
    }
    console.log("✅ تم الاتصال بقاعدة SQLite القديمة. جاري استخراج الهيكل...\n");
    
    // جلب كود الإنشاء لكل الجداول
    db.all("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, rows) => {
        if (err) {
            console.error("❌ خطأ أثناء القراءة:", err.message);
            return;
        }

        console.log("====== 📊 هيكل الجداول الأصلي ======\n");
        rows.forEach((row) => {
            console.log(`-- Table: ${row.name}`);
            console.log(`${row.sql};\n`);
        });
        console.log("=====================================");
        
        db.close();
    });
});
