const fs = require('fs');
const path = require('path');

// قائمة الملفات التي تريد فحصها (تأكد من المسارات)
const filesToCheck = [
    './commands/economy/dungeon.js',
    './handlers/dungeon-battle.js',
    './handlers/dungeon-handler.js',
    './handlers/dungeon/utils.js'
];

console.log("\n\n🔍 ====================================================");
console.log("🔍 جاري فحص ملفات الدانجون بحثاً عن (Missing Catch)...");
console.log("🔍 ====================================================\n");

filesToCheck.forEach(filePath => {
    const fullPath = path.join(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️ الملف غير موجود: ${filePath}`);
        return;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    
    // تنظيف الكود من التعليقات لتجنب الإنذارات الكاذبة
    const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '');

    // فحص Syntax عام
    try {
        new Function(cleanContent);
        console.log(`✅ سليم برمجياً: ${filePath}`);
    } catch (err) {
        console.error(`\n❌❌❌ خطأ قاتل (SYNTAX ERROR) في الملف: ${filePath} ❌❌❌`);
        console.error(`🔴 رسالة الخطأ: ${err.message}`);
        
        // محاولة ذكية لتحديد مكان الـ try المكسور
        if (err.message.includes('Missing catch') || err.message.includes('Unexpected token')) {
            console.log("👇 جاري البحث عن السطر المسبب للمشكلة...\n");
            
            let bracketBalance = 0;
            let tryStack = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmed = line.trim();

                // حساب الأقواس
                for (let char of line) {
                    if (char === '{') bracketBalance++;
                    if (char === '}') bracketBalance--;
                }

                // اكتشاف بداية try
                if (trimmed.startsWith('try {') || trimmed === 'try') {
                    tryStack.push({ line: i + 1, brackets: bracketBalance });
                }

                // اكتشاف catch أو finally
                if (trimmed.startsWith('catch') || trimmed.startsWith('} catch') || trimmed.startsWith('finally') || trimmed.startsWith('} finally')) {
                    if (tryStack.length > 0) {
                        tryStack.pop(); // تم إغلاق الـ try بنجاح
                    }
                }
            }

            if (tryStack.length > 0) {
                const badTry = tryStack.pop();
                console.error(`🔥 **الخطأ غالباً هنا!**`);
                console.error(`👉 وجدنا (try) في السطر [${badTry.line}] لم يتم إغلاقها بـ (catch) أو (finally).`);
                console.error(`📄 محتوى السطر: ${lines[badTry.line - 1].trim()}`);
                console.error(`💡 الحل: اذهب لهذا السطر وتأكد من وجود } catch (e) {} بعد انتهاء البلوك.`);
            } else {
                console.error(`⚠️ لم يستطع الفحص التلقائي تحديد السطر، لكن الخطأ مؤكد في هذا الملف.`);
            }
        }
        console.log("\n====================================================\n");
    }
});
