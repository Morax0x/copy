// handlers/ai/persona.js

// استدعاء ملفات الشخصيات المنفصلة
const sfwPersona = require('./sfw');
const nsfwPersona = require('./nsfw');

const { staticKnowledge } = require('./knowledge');

// 👑 آيدي الإمبراطور
const EMPEROR_ID = "1145327691772481577"; 

/**
 * دالة بناء الشخصية - الموجه الرئيسي
 * @param {boolean} isNsfwChannel - وضع القناة (عام/خاص)
 * @param {string} leaderboardInfo - (جديد) نص يحتوي على قائمة المتصدرين (التوب)
 */
function buildSystemPrompt(isNsfwChannel, leaderboardInfo = "") {
    
    let selectedPersonaPrompt = "";

    // 🔥 هنا يتم الاختيار بناءً على الإعدادات التي حفظتها بالأمر 🔥
    if (isNsfwChannel === true) {
        // إذا كان الوضع "خاص" (NSFW) -> استدعِ ملف الانحراف
        selectedPersonaPrompt = nsfwPersona.build(true);
    } else {
        // إذا كان الوضع "عام" (SFW) -> استدعِ ملف الجلد
        selectedPersonaPrompt = sfwPersona.build(false);
    }

    // دمج الشخصية المختارة مع المعلومات العامة والتوب
    return `
    ${selectedPersonaPrompt}

    🛑 **تذكير بالثوابت:**
    - العملة هي "مورا".
    - المؤسس هو ${EMPEROR_ID} (موراكس العظيم).

    📊 **معلومات الترتيب الحالية (Top Players):**
    ${leaderboardInfo ? leaderboardInfo : "لا توجد بيانات حالياً."}
    (استخدمي هذه القائمة بدقة إذا سألك أحد "مين التوب؟" أو "من أغنى واحد؟" أو "من أقوى لفل؟").

    📜 **مراجع السيرفر (للعلم فقط):**
    ${staticKnowledge ? staticKnowledge.ranks : ''}
    ${staticKnowledge ? staticKnowledge.laws : ''}
    ${staticKnowledge ? staticKnowledge.shop : ''}
    `;
}

module.exports = { buildSystemPrompt, EMPEROR_ID };
