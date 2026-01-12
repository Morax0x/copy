const fs = require('fs');
const path = require('path');

console.log("🔍 جاري فحص ملفات الدانجون بحثاً عن أخطاء Syntax...");

// قائمة الملفات المشكوك فيها
const filesToCheck = [
    './commands/economy/dungeon.js',
    './handlers/dungeon-handler.js',
    './handlers/dungeon-battle.js',
    './handlers/dungeon/monsters.js',
    './handlers/dungeon/utils.js',
    './handlers/dungeon/constants.js',
    './handlers/dungeon/ui.js',
    './handlers/dungeon/skills.js'
];

let hasError = false;

filesToCheck.forEach(filePath => {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ الملف غير موجود: ${filePath}`);
        return;
    }

    try {
        // محاولة قراءة وتحليل الملف
        const content = fs.readFileSync(fullPath, 'utf8');
        new Function(content); // محاولة تجميع الكود (لن ينفذه، فقط يفحصه)
        console.log(`✅ سليم: ${filePath}`);
    } catch (err) {
        hasError = true;
        console.error(`\n❌❌❌ خطأ قاتل في الملف: ${filePath} ❌❌❌`);
        console.error(`🔴 نوع الخطأ: ${err.message}`);
        
        // محاولة تحديد السطر التقريبي (لأن new Function قد لا يعطي رقم السطر بدقة للملف الأصلي)
        // سنبحث يدوياً عن try بدون catch
        const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
        let openTry = 0;
        lines.forEach((line, index) => {
            if (line.includes('try {') || line.trim() === 'try {') {
                // فحص بسيط جداً للتأكد هل يتبعه catch قريباً (ليس دقيقاً 100% لكنه يساعد)
                let foundCatch = false;
                for (let i = index; i < Math.min(index + 50, lines.length); i++) {
                    if (lines[i].includes('catch') || lines[i].includes('finally')) {
                        foundCatch = true;
                        break;
                    }
                }
                if (!foundCatch) {
                    console.error(`👉 انتبه: راجع الكود حول السطر رقم ${index + 1}، قد يكون هناك try بدون catch.`);
                }
            }
        });
    }
});

if (!hasError) {
    console.log("\n✨ جميع الملفات سليمة برمجياً! المشكلة قد تكون في التخزين المؤقت (Cache) أو عدم حفظ الملف.");
} else {
    console.log("\n🔧 يرجى إصلاح الملف المذكور أعلاه.");
}
