const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log("\n🛑 --- بدء فحص الأخطاء --- 🛑");

// الملف الذي يشتكي منه اللوج
const filesToCheck = [
    './commands/economy/dungeon.js', 
    './handlers/dungeon-battle.js'
];

filesToCheck.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ الملف غير موجود: ${file}`);
        return;
    }

    const code = fs.readFileSync(filePath, 'utf8');

    try {
        // محاولة ترجمة الكود لكشف أخطاء الـ Syntax
        new vm.Script(code, { filename: file });
        console.log(`✅ الملف سليم: ${file}`);
    } catch (err) {
        console.log(`\n❌❌ خطأ في الملف: ${file} ❌❌`);
        console.log(`نوع الخطأ: ${err.message}`);
        
        // استخراج رقم السطر من الخطأ (Node.js يعطي مكان الخطأ غالباً)
        const stack = err.stack.split('\n');
        // السطر الأول عادة يحتوي على التفاصيل
        console.log(`📍 مكان الخطأ التقريبي:\n${stack.slice(0, 5).join('\n')}`);
        
        if (err.message.includes('Missing catch')) {
            console.log("\n💡 تلميح: لديك 'try {' في هذا الملف لم تقم بإغلاقها بـ '} catch (e) { }'.");
            console.log("ابحث عن كلمة 'try' وتأكد أن القوس الذي بعدها يغلق ويتبعه catch.");
        }
    }
});

console.log("🏁 --- انتهى الفحص --- 🏁\n");
