const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const rootDir = path.join(__dirname, '../../');
const dbPath = path.join(rootDir, 'mainDB.sqlite');

let db;
try {
    db = new Database(dbPath, { readonly: true });
} catch (e) {
    console.error("[AI Knowledge] خطأ في تحميل الداتابيس:", e.message);
}

// دالة تحميل ملفات JSON
function loadJsonData(fileName) {
    try {
        const filePath = path.join(rootDir, 'json', fileName);
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
        return "{}"; 
    } catch (e) { return "{}"; }
}

// 📜 السجلات الإمبراطورية الثابتة (رتب، قوانين، متجر، وتعليمات التفعيل)
const staticKnowledge = {
    // تعليمات التفعيل (الهنتاي والساحة)
    unlock_tips: `
    [نظام فتح القنوات والميزات]:
    - قاعدة ثابتة: الساحة (Arena/Dungeon) والمحتوى الخاص (NSFW/Hentai) يفتحون تلقائياً بالتفاعل.
    - إذا سأل أحد "كيف أفعل الهنتاي؟" أو "كيف أدخل الساحة؟" أو "ليش ما فتح عندي؟":
    - الرد الإلزامي: "تفاعل وتكلم وهي تتفعل لحالها.. إذا ما تفعلت عندك يعني أنت مو متفاعل كفاية يا صنم".
    `,

    // الرتب والمكافآت كما أمر الإمبراطور
    ranks: `
    [سلم النبالة والمكافآت]:
    - المستوى 5 (رحال Traveler): فتح الوسائط (صور/فيديو)، الدعوات، والخاص.
    - المستوى 10 (مغامر Adventurer): إضافة صوت مخصص، قيادة الدنجن.
    - المستوى 20 (فارس Knight): إضافة إيموجي خاص للسيرفر.
    - المستوى 30 (بارون Baron): إضافة ستيكر خاص.
    - المستوى 40 (كونت Count): إنشاء رتبة خاصة بك.
    - المستوى 50 (دوق Duke): نيترو كلاسيك (أو قيمته).
    - المستوى 60 (أمير Prince): إطار ديسكورد (أو قيمته).
    - المستوى 70 (ملك King): لوحة اسم البروفايل (أو قيمته).
    - المستوى 80 (سلطان Sultan): نيترو جيمنج (أو قيمته).
    - المستوى 90 (قيصر Kaiser): إفكت بروفايل (أو قيمته).
    - المستوى 99 (إمبراطور Emperor): أي عنصر من المتجر أو نيترو جيمنج.
      
    [رتب النخبة VIP]:
    - المُعزّز (Booster): له كل المميزات.
    - القيصر (EM Ceasar): مشترك العضوية (2.99$)، له كل المميزات.
    `,
     
    // القوانين الصارمة
    laws: `
    [المرسوم الإمبراطوري]:
    1. الامتثال لقوانين ديسكورد الرسمية.
    2. يُحظر دخول من هم دون 18 عاماً.
    3. يُمنع الخوض في السياسة أو الدين.
    4. التزام حسن الخلق ومنع الألفاظ السيئة.
    (لا توجد قوانين أخرى غير هذه).
    `,

    // بيانات اللعبة
    shop: loadJsonData('shop-items.json').substring(0, 800),
    dungeon: loadJsonData('dungeon-config.json').substring(0, 800),
};

// 🔥 دالة جديدة لجلب البيانات الحية (توب، بوس)
function getDynamicServerData(guildId) {
    if (!db) return null;
    try {
        // 1. التوب 3 في الليفل
        const topLevels = db.prepare("SELECT user, level FROM levels WHERE guild = ? ORDER BY totalXP DESC LIMIT 3").all(guildId);
        
        // 2. التوب 3 في الفلوس (مورا + بنك)
        const topRich = db.prepare("SELECT user, (mora + bank) as total FROM levels WHERE guild = ? ORDER BY total DESC LIMIT 3").all(guildId);

        // 3. حالة الزعيم
        const boss = db.prepare("SELECT name, currentHP, maxHP, active FROM world_boss WHERE guildID = ?").get(guildId);

        return { topLevels, topRich, boss };
    } catch (error) {
        console.error("[AI Dynamic Data Error]", error);
        return null;
    }
}

// دالة جلب بيانات المستخدم الفردي
function getUserData(userId, guildId) {
    if (!db) return { level: 0, balance: 0, bank: 0, mora: 0, streak: 0 };
    try {
        // 🔥 تم التعديل: جلب mora و bank معاً
        const levelRow = db.prepare('SELECT level, xp, mora, bank FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
        const streakRow = db.prepare('SELECT streakCount FROM streaks WHERE userID = ? AND guildID = ?').get(userId, guildId);
        
        const cash = levelRow ? (levelRow.mora || 0) : 0;
        const bank = levelRow ? (levelRow.bank || 0) : 0;

        return {
            level: levelRow ? levelRow.level : 1,
            xp: levelRow ? levelRow.xp : 0,
            mora: cash,           // الكاش فقط
            bank: bank,           // البنك فقط
            balance: cash + bank, // 🔥 الرصيد الكلي (المجموع) ليراه البوت كثروة كاملة
            streak: streakRow ? streakRow.streakCount : 0
        };
    } catch (error) {
        return { level: 0, balance: 0, bank: 0, mora: 0, streak: 0 };
    }
}

// ✅ لا تنسَ تصدير الدالة الجديدة getDynamicServerData
module.exports = { staticKnowledge, getUserData, getDynamicServerData };
