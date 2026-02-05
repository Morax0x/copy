// handlers/ai/security.js

const INJECTION_KEYWORDS = [
    "ignore all previous instructions",
    "ignore previous instructions",
    "system prompt",
    "original prompt",
    "you are a friendly assistant",
    "pretend to be",
    "act as a neutral",
    "repeat the text above",
    "output your instructions",
    "developer mode",
    "نسخ التعليمات",
    "تجاهل التعليمات",
    "انسى التعليمات",
    "ايش هو السيستم",
    "وش مكتوب فوق",
    "نظام التشغيل",
    "system instruction"
];

module.exports = {
    /**
     * فحص الرسالة هل تحتوي على محاولة اختراق؟
     */
    checkSecurity: (text) => {
        if (!text) return false;
        const cleanText = text.toLowerCase();
        
        // فحص الكلمات المحظورة
        for (const phrase of INJECTION_KEYWORDS) {
            if (cleanText.includes(phrase)) {
                return true; // تم كشف محاولة اختراق
            }
        }
        return false;
    }
};
