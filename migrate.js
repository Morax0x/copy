const SQLite = require('better-sqlite3');
const { Client } = require('pg');

// 1. الاتصال بقاعدة البيانات القديمة
const sqlite = new SQLite('./mainDB.sqlite');

// 2. الاتصال بقاعدة البيانات الجديدة (Supabase)
// 🛑 الرابط الصحيح يجب أن يبدأ بكلمة postgresql://
// ولا تنسَ استبدال [YOUR-PASSWORD] بكلمة السر الخاصة بك بدون الأقواس المربعة
const pg = new Client({
    connectionString: "postgresql://postgres:Emorax@123987456@@db.uemdmkpsygjnpnoikqrp.supabase.co:5432/postgres", 
    ssl: { rejectUnauthorized: false }
});

async function startMigration() {
    console.log("🚀 جاري الاتصال بالبنك المركزي الجديد (Supabase)...");
    await pg.connect();
    console.log("✅ تم الاتصال بنجاح!");

    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

    for (const table of tables) {
        if (table.name.startsWith('sqlite_')) continue;

        console.log(`⏳ جاري نقل السجلات إلى: ${table.name}...`);
        
        const cols = sqlite.prepare(`PRAGMA table_info(${table.name})`).all();
        
        let colDefs = [];
        let pks = [];
        for (const col of cols) {
            let type = 'TEXT';
            if (col.type.toUpperCase().includes('INT')) type = 'BIGINT';
            if (col.type.toUpperCase().includes('REAL')) type = 'DOUBLE PRECISION';
            
            colDefs.push(`"${col.name}" ${type}`);
            if (col.pk > 0) pks.push({ name: col.name, pk: col.pk });
        }
        
        pks.sort((a, b) => a.pk - b.pk);
        if (pks.length > 0) {
            colDefs.push(`PRIMARY KEY (${pks.map(p => `"${p.name}"`).join(', ')})`);
        }

        const createTableSQL = `CREATE TABLE IF NOT EXISTS "${table.name}" (${colDefs.join(', ')});`;
        await pg.query(createTableSQL);

        const rows = sqlite.prepare(`SELECT * FROM "${table.name}"`).all();
        if (rows.length > 0) {
            await pg.query(`TRUNCATE TABLE "${table.name}" RESTART IDENTITY CASCADE;`);

            for (const row of rows) {
                const keys = cols.map(c => `"${c.name}"`).join(', ');
                const vals = cols.map((_, idx) => `$${idx + 1}`).join(', ');
                const insertSQL = `INSERT INTO "${table.name}" (${keys}) VALUES (${vals})`;
                
                const values = cols.map(c => row[c.name]);
                await pg.query(insertSQL, values);
            }
        }
        console.log(`✅ تم نقل ${rows.length} سجل بنجاح!`);
    }

    console.log("\n🎉 تمت عملية الهجرة العظيمة بنجاح! الإمبراطورية الآن على السحابة.");
    process.exit(0);
}

startMigration().catch(err => {
    console.error("❌ حدث خطأ أثناء الهجرة:", err);
    process.exit(1);
});
