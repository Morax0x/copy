// handlers/ai/serverLore.js

const fs = require('fs');
const path = require('path');
const OWNER_ID = "1145327691772481577"; 

// 🛠️ دالة مساعدة لتحميل ملفات JSON بأمان
function loadGameData(fileName) {
    try {
        const filePath = path.join(__dirname, '../../json', fileName);
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`[Lore Error] Failed to load ${fileName}:`, e.message);
        return [];
    }
}

// 🛠️ دالة لتنسيق القوائم للنص (الاسم - الوصف - السعر)
function formatList(data, type = 'general') {
    if (!Array.isArray(data) || data.length === 0) return "لا توجد بيانات حالياً.";
    
    return data.map(item => {
        let text = `- **${item.name}**`;
        if (item.price) text += ` (💰 ${item.price})`;
        if (item.description) text += `: ${item.description}`;
        if (item.effect) text += ` (تأثير: ${item.effect})`;
        return text;
    }).slice(0, 30).join('\n'); // نأخذ أول 30 عنصر فقط لتجنب ضغط الذاكرة
}

// 🔥 تحميل البيانات مرة واحدة عند تشغيل البوت
const weaponsData = loadGameData('weapons-config.json');
const skillsData = loadGameData('skills-config.json');
const shopData = loadGameData('shop-items.json');
const seedsData = loadGameData('seeds.json');
const potionsData = loadGameData('potions.json');
const feedItems = loadGameData('feed-items.json');
const farmAnimals = loadGameData('farm-animals.json');
const dungeonData = loadGameData('dungeon-config.json');
const questsData = loadGameData('quests-config.json');

// تنسيق البيانات للنص
const weaponsText = formatList(weaponsData);
const skillsText = formatList(skillsData);
const shopText = formatList(shopData);
const seedsText = formatList(seedsData);
const potionsText = formatList(potionsData);
const animalsText = formatList(farmAnimals);
const questsDailyText = questsData.daily ? formatList(questsData.daily) : "لا يوجد";
const questsWeeklyText = questsData.weekly ? formatList(questsData.weekly) : "لا يوجد";

/**
 * دالة لجلب قائمة المتصدرين (التوب) من الداتابيس
 */
function getLeaderboardKnowledge(sql, guildID) {
    if (!sql || !sql.open) return "";

    try {
        const topLevels = sql.prepare("SELECT user, level FROM levels WHERE guild = ? AND user != ? ORDER BY totalXP DESC LIMIT 5").all(guildID, OWNER_ID);
        const levelText = topLevels.length > 0 ? topLevels.map((u, i) => `${i+1}. <@${u.user}> (Lv.${u.level})`).join('\n') : "لا يوجد بيانات.";

        const topMora = sql.prepare("SELECT user, (mora + bank) as totalWealth FROM levels WHERE guild = ? AND user != ? ORDER BY totalWealth DESC LIMIT 5").all(guildID, OWNER_ID);
        const moraText = topMora.length > 0 ? topMora.map((u, i) => `${i+1}. <@${u.user}> (💰 ${u.totalWealth.toLocaleString()})`).join('\n') : "لا يوجد بيانات.";

        return `
🏆 **لوحة الشرف (أسياد السيرفر):**
💪 **الأقوياء (أعلى لفلات):**
${levelText}
💸 **الهوامير (أغنى ناس):**
${moraText}
`;
    } catch (error) {
        console.error("Error fetching leaderboard for AI:", error.message);
        return "";
    }
}

module.exports = {
    getLeaderboardKnowledge,

    // معلومات السيرفر الثابتة + الديناميكية من الملفات
    getServerKnowledge: () => {
        return `
📚 **قاعدة بيانات الإمبراطورية (الموسوعة الشاملة):**

1. **📍 الهوية والنظام:**
   - **الاسم:** الإمبراطورية (The Empire).
   - **المالك:** موراكس (Morax).
   - **الإدارة:** "الحكم للشعب" (لا يوجد مشرفين).
   - **نظام العقاب:** الإبلاغ عن طريق التطبيقات (Apps -> تقديم بلاغ).

2. **💎 التاق الملكي (Server Tag VIP):**
   - **ما هو؟** أي عضو يضع تاق السيرفر بجانب اسمه يعتبر **VIP** ومميز جداً.
   - **طريقة وضعه:** (User Profile -> Edit Profile -> Server Profiles -> اختر الإمبراطورية واختار التاق).

3. **📜 المهام والتحديات (Quests):**
   - **المهام اليومية:**
${questsDailyText}
   - **المهام الأسبوعية:**
${questsWeeklyText}

4. **⚔️ الترسانة الحربية (Weapons & Skills):**
   - **الأسلحة المتاحة:**
${weaponsText}
   - **المهارات القتالية:**
${skillsText}

5. **🛍️ السوق والمتجر (Shop & Items):**
   - **عناصر المتجر:**
${shopText}
   - **جرعات الدانجون:**
${potionsText}

6. **🌾 المزرعة والحياة الريفية:**
   - **البذور:**
${seedsText}
   - **الحيوانات:**
${animalsText}

7. **🏰 الدانجون (Dungeons):**
   - نظام قتال وحوش وتسلق طوابق.
   - عدد الطوابق الحالي: ${dungeonData.floors ? dungeonData.floors.length : 'غير محدد'}.
   - يحتوي على وحوش وزعماء وجوائز نادرة.

8. **🎉 الفعاليات:**
   - **الويكند:** تدبيل XP و Mora كل جمعة وسبت وأحد.

⚠️ **توجيه للإمبراطورة:**
- لديك الآن وصول كامل لجميع بيانات اللعبة أعلاه.
- إذا سألك أحد "وش أقوى سلاح؟" أو "كم سعر البيض؟" أو "وش المهام اليوم؟"، استخرجي الإجابة من القوائم أعلاه.
- استخدمي هذه المعلومات بذكاء لتبدي خبيرة في شؤون مملكتك.
`;
    }
};
