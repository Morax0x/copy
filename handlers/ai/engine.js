const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getEmojiContext } = require('./emojis'); 
// 👇 استدعاء معالج الأوامر الجديد (تأكد من إنشاء الملف في الخطوة التالية)
const aiActionHandler = require('../../utils/aiActionHandler'); 
require('dotenv').config();

// 🔥 قائمة الموديلات
const MODELS = [
    "gemini-2.0-flash",       
    "gemini-1.5-flash",       
    "gemini-1.5-pro"
];

const chatSessions = {}; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🔥 دالة لاستخراج الإيموجيات المسموحة فقط
function getAllowedEmojiIds() {
    const context = getEmojiContext(true); 
    const matches = context.match(/:(\d+)>/g); 
    if (!matches) return [];
    return matches.map(m => m.replace(/[:>]/g, '')); 
}

const ALLOWED_EMOJI_IDS = getAllowedEmojiIds();

/**
 * 🧹 دالة الفلترة الذكية (Smart Whitelist Filter)
 */
function enforceSingleEmoji(text) {
    let cleanText = text.replace(/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu, '');

    const customEmojiRegex = /<a?:\w+:(\d+)>/g;
    const foundEmojis = [];
    let match;
    
    while ((match = customEmojiRegex.exec(text)) !== null) {
        const fullEmoji = match[0];
        const emojiId = match[1];
        
        if (ALLOWED_EMOJI_IDS.includes(emojiId)) {
            foundEmojis.push(fullEmoji);
        }
    }

    cleanText = cleanText.replace(customEmojiRegex, '').trim();

    if (foundEmojis.length > 0) {
        const lastValidEmoji = foundEmojis[foundEmojis.length - 1];
        return `${cleanText} ${lastValidEmoji}`;
    }

    return cleanText;
}

/**
 * 🖼️ دالة مساعدة لتحميل الصورة
 */
async function urlToGenerativePart(url, mimeType) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const arrayBuffer = await response.arrayBuffer();
        return {
            inlineData: {
                data: Buffer.from(arrayBuffer).toString("base64"),
                mimeType
            }
        };
    } catch (error) {
        console.error("Error processing image:", error);
        throw error; 
    }
}

/**
 * المحرك الرئيسي (Engine)
 */
// 👇 تمت إضافة messageObject هنا لتمرير الرسالة للمعالج
async function generateResponse(apiKey, systemInstruction, userMessage, userData, userId, username, imageAttachment, isNsfw, messageObject) {
    if (!apiKey) return "⚠️ مفتاح الخزينة (API Key) مفقود!";

    const genAI = new GoogleGenerativeAI(apiKey);
    const sessionKey = `${userId}-${isNsfw ? 'NSFW' : 'SFW'}`;

    // 💰 حساب مجموع الثروة (كاش + بنك)
    const totalWealth = (userData.balance || 0) + (userData.bank || 0);

    // تحديث المعلومات المرسلة للذكاء
    const contextInfo = `
    [User Data]:
    - Name: ${username}
    - Cash: ${userData.balance} Mora
    - Bank: ${userData.bank || 0} Mora
    - Total Wealth: ${totalWealth} Mora
    - Level: ${userData.level}
    - Streak: ${userData.streak}
    `;

    // ============================================================
    // 🖼️ مسار 1: الصور
    // ============================================================
    if (imageAttachment) {
        for (const modelName of MODELS) {
            try {
                const model = genAI.getGenerativeModel({ 
                    model: modelName,
                    systemInstruction: { parts: [{ text: systemInstruction }], role: "model" }
                });

                const imagePart = await urlToGenerativePart(imageAttachment.url, imageAttachment.mimeType);
                
                const result = await model.generateContent([
                    contextInfo,
                    userMessage || "ما رأيك في هذه الصورة؟",
                    imagePart
                ]);

                // معالجة الرد (وتنفيذ الأوامر إن وجدت)
                let responseText = result.response.text();
                
                // 🔥 تنفيذ الأوامر
                if (responseText.includes('[ACTION:GIVE_MORA]')) {
                    await aiActionHandler.executeActions(messageObject, 'GIVE_MORA');
                    responseText = responseText.replace('[ACTION:GIVE_MORA]', '');
                }
                if (responseText.includes('[ACTION:TIMEOUT]')) {
                    await aiActionHandler.executeActions(messageObject, 'TIMEOUT_5M');
                    responseText = responseText.replace('[ACTION:TIMEOUT]', '');
                }

                return enforceSingleEmoji(responseText);

            } catch (error) {
                console.warn(`⚠️ [Image AI] ${modelName} failed, trying next...`);
                if (modelName === MODELS[MODELS.length - 1]) return "عذراً، لم أتمكن من رؤية الصورة بوضوح.";
                await sleep(2000);
            }
        }
    }

    // ============================================================
    // 💬 مسار 2: النصوص
    // ============================================================
    for (const modelName of MODELS) {
        try {
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                systemInstruction: { parts: [{ text: systemInstruction }], role: "model" }
            });

            if (!chatSessions[sessionKey]) {
                chatSessions[sessionKey] = model.startChat({
                    history: [
                        { 
                            role: "user", 
                            parts: [{ text: `[SYSTEM: RESET] Activate Persona Mode: ${isNsfw ? 'NSFW Pleasure' : 'SFW Empress'}.` }] 
                        },
                        { 
                            role: "model", 
                            parts: [{ text: isNsfw ? "جاهزة لك كلياً.. 🔥" : "همم.. من سمح لك بالحديث؟ 👑" }] 
                        }
                    ],
                });
            }

            const fullMessage = `${contextInfo}\n\n${username}: ${userMessage}`;
            const result = await chatSessions[sessionKey].sendMessage(fullMessage);
            
            let responseText = result.response.text();

            // 🔥🔥🔥 فحص وتنفيذ الأوامر (Action Checks) 🔥🔥🔥
            // 1. أمر إعطاء المورا
            if (responseText.includes('[ACTION:GIVE_MORA]')) {
                await aiActionHandler.executeActions(messageObject, 'GIVE_MORA');
                // حذف الكود من الرسالة الظاهرة
                responseText = responseText.replace('[ACTION:GIVE_MORA]', '');
            }

            // 2. أمر التايم أوت
            if (responseText.includes('[ACTION:TIMEOUT]')) {
                await aiActionHandler.executeActions(messageObject, 'TIMEOUT_5M');
                responseText = responseText.replace('[ACTION:TIMEOUT]', '');
            }

            return enforceSingleEmoji(responseText);

        } catch (error) {
            if (chatSessions[sessionKey]) delete chatSessions[sessionKey];
            
            console.warn(`⚠️ [Text AI] ${modelName} failed: ${error.message.split('[')[0]}`);

            if (error.message.includes("429")) { 
                await sleep(4000); 
                continue; 
            }
            if (error.message.includes("503")) { 
                await sleep(2000); 
                continue;
            }

            if (modelName === MODELS[MODELS.length - 1]) {
                return "🌑 طاقتي الذهنية نفدت حالياً. حاول لاحقاً.";
            }
        }
    }
}

// 🧹 تنظيف الذاكرة
setInterval(() => {
    const keys = Object.keys(chatSessions);
    if (keys.length > 0) {
        console.log(`[AI Engine] Cleaning ${keys.length} cached sessions...`);
        keys.forEach(key => delete chatSessions[key]);
    }
}, 3600000); 

module.exports = { generateResponse };
