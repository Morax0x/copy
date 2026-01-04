const fs = require('fs');
const path = './commands/economy/dungeon.js';

console.log("\n\n🔴🔴 === بدء فحص ملف الدانجون === 🔴🔴");

if (!fs.existsSync(path)) {
    console.log("❌ الملف غير موجود في المسار المحدد!");
} else {
    const content = fs.readFileSync(path, 'utf8');
    console.log(`📏 حجم الملف: ${content.length} حرف`);
    
    // حساب الأقواس
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    
    console.log(`الفتحات { : ${openBraces}`);
    console.log(`الإغلاقات } : ${closeBraces}`);
    
    if (openBraces !== closeBraces) {
        console.log(`⚠️⚠️ كارثة: عدد الأقواس غير متطابق! ينقصك ${openBraces - closeBraces} قوس إغلاق.`);
    }

    console.log("\n🔎 آخر 100 حرف في الملف (تأكد أن الملف ينتهي بـ }; ):");
    console.log("---------------------------------------------------");
    console.log(content.slice(-100));
    console.log("---------------------------------------------------");

    try {
        require(path);
        console.log("✅ الملف سليم برمجياً 100% ولا يوجد خطأ Syntax.");
    } catch (e) {
        console.log("❌❌ السيرفر اكتشف هذا الخطأ عند تشغيل الملف:");
        console.log(e.message);
    }
}
console.log("🔴🔴 === انتهى الفحص === 🔴🔴\n\n");
