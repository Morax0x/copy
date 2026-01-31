// utils/aiActionHandler.js

const SQLite = require("better-sqlite3");
const path = require('path');

// 🎨 استدعاء ملف الألوان لتنفيذه مباشرة
const colorsCommand = require('../commands/colors.js'); 

const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

module.exports = {
    /**
     * تنفيذ الأوامر المرفقة في رد الذكاء الاصطناعي
     * الصيغ المدعومة:
     * - [ACTION:GIVE_MORA]
     * - [ACTION:TIMEOUT]
     * - [ACTION:SHOW_COLORS]
     * - [ACTION:SET_COLOR:5]
     */
    executeActions: async (message, actionString) => {
        const userID = message.author.id;
        const guildID = message.guild.id;

        // تنظيف النص واستخراج البيانات
        // مثال: [ACTION:SET_COLOR:5] -> Type: SET_COLOR, Value: 5
        const cleanAction = actionString.replace('[', '').replace(']', '').replace('ACTION:', '');
        const parts = cleanAction.split(':');
        const actionCode = parts[0]; 
        const actionValue = parts[1]; // قد يكون غير موجود في بعض الأوامر

        console.log(`[AI Action] Received request: ${actionCode} (Value: ${actionValue}) for user: ${message.author.tag}`);

        // =========================================================
        // 1. 🎨 نظام الألوان (Colors System)
        // =========================================================
        
        // أ) عرض اللوحة
        if (actionCode === 'SHOW_COLORS') {
            try {
                // نمرر مصفوفة فارغة في args ليفهم الكود أنه طلب عرض القائمة
                await colorsCommand.execute(message, []);
                return true;
            } catch (e) {
                console.error("[AI Action Error] Show Colors:", e);
            }
        }

        // ب) تعيين لون محدد
        if (actionCode === 'SET_COLOR') {
            try {
                if (actionValue) {
                    // نمرر الرقم كـ args ليفهم الكود أنه طلب تغيير لون
                    await colorsCommand.execute(message, [actionValue]);
                    return true;
                } else {
                    console.log("[AI Action] Set Color Rejected: No color number provided.");
                }
            } catch (e) {
                console.error("[AI Action Error] Set Color:", e);
            }
        }

        // =========================================================
        // 2. 💰 أمر إعطاء المورا (معدل)
        // =========================================================
        if (actionCode === 'GIVE_MORA') {
            try {
                const userData = sql.prepare("SELECT mora, bank FROM levels WHERE user = ? AND guild = ?").get(userID, guildID);
                const totalWealth = (userData?.mora || 0) + (userData?.bank || 0);
                
                // الحد الأقصى للثروة صار 10,000
                if (totalWealth >= 10000) {
                    console.log("[AI Action] Give Mora Rejected: User is too rich (>10k).");
                    return false; 
                }

                // المبلغ الممنوح صار 1000
                sql.prepare("INSERT INTO levels (user, guild, mora) VALUES (?, ?, 1000) ON CONFLICT(user, guild) DO UPDATE SET mora = mora + 1000").run(userID, guildID);
                
                await message.react('💸').catch(e => console.error("Failed to react:", e));
                console.log("[AI Action] Give Mora Success (1000 added).");
                return true;
            } catch (e) {
                console.error("[AI Action Error] Give Mora:", e);
            }
        }

        // =========================================================
        // 3. 🚫 أمر التايم أوت (معدل لدقيقة واحدة)
        // =========================================================
        if (actionCode === 'TIMEOUT' || actionCode === 'TIMEOUT_5M') {
            try {
                // 🛑 فحص الأمان 1: هل العضو موجود؟
                if (!message.member) {
                    console.log("[AI Timeout] Failed: Member object not found.");
                    return false;
                }

                // 🛑 فحص الأمان 2: هل البوت يقدر عليه؟
                if (!message.member.moderatable) {
                    console.log(`[AI Timeout] Failed: Bot cannot punish ${message.author.tag}.`);
                    await message.reply("ما أقدر أعاقبك.. رتبتك أعلى مني! 😤").catch(() => {});
                    return false;
                }

                // المدة دقيقة واحدة (60 ثانية)
                await message.member.timeout(60 * 1000, "بأمر من الإمبراطورة (إزعاج/تطاول)");
                
                await message.react('🤐').catch(() => {});
                console.log(`[AI Timeout] Success: ${message.author.tag} muted for 1 min.`);
                return true;

            } catch (e) {
                console.error("[AI Action Error] Timeout:", e);
                if (e.code === 50013) {
                    console.log("⚠️ Missing Permissions: Please give the bot 'Moderate Members' permission.");
                }
            }
        }

        return false;
    }
};
