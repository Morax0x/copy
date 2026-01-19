// استدعاء ملفات الشخصيات المنفصلة
const sfwPersona = require('./sfw');
const nsfwPersona = require('./nsfw');

const { staticKnowledge } = require('./knowledge');

// 👑 آيدي الإمبراطور
const EMPEROR_ID = "1145327691772481577"; 

/**
 * دالة بناء الشخصية - الموجه الرئيسي
 * @param {boolean} isNsfwChannel - هذه القيمة تأتي من قاعدة البيانات بناءً على أمر /ai add
 */
function buildSystemPrompt(isNsfwChannel) {
    
    let selectedPersonaPrompt = "";

    // 🔥 هنا يتم الاختيار بناءً على الإعدادات التي حفظتها بالأمر 🔥
    if (isNsfwChannel === true) {
        // إذا كان الوضع "خاص" (NSFW) -> استدعِ ملف الانحراف
        selectedPersonaPrompt = nsfwPersona.build(true);
    } else {
        // إذا كان الوضع "عام" (SFW) -> استدعِ ملف الجلد
        selectedPersonaPrompt = sfwPersona.build(false);
    }

    // دمج الشخصية المختارة مع المعلومات العامة
    return `
    ${selectedPersonaPrompt}

    🛑 **تذكير بالثوابت:**
    - العملة هي "مورا".
    - المؤسس هو ${EMPEROR_ID} (موراكس العظيم).

    📜 **مراجع السيرفر (للعلم فقط):**
    ${staticKnowledge.ranks}
    ${staticKnowledge.laws}
    ${staticKnowledge.shop}
    `;
}

module.exports = { buildSystemPrompt, EMPEROR_ID };
