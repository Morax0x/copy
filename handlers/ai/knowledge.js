// handlers/ai/knowledge.js

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

// 📜 السجلات الإمبراطورية الثابتة (رتب، قوانين، متجر، وتعليمات)
const staticKnowledge = {
    
    // 🔥 تم إضافة نظام رتب المغامرين (السمعة) 🔥
    adventurer_ranks: `
    [رتب المغامرين بناءً على نقاط السمعة (التزكية)]:
    - 1000 نقطة فما فوق: رتبة SS 👑
    - 500 نقطة فما فوق: رتبة S 💎
    - 250 نقطة فما فوق: رتبة A 🥇
    - 100 نقطة فما فوق: رتبة B 🥈
    - 50 نقطة فما فوق: رتبة C 🥉
    - 25 نقطة فما فوق: رتبة D ⚔️
    - 10 نقاط فما فوق: رتبة E 🛡️
    - أقل من 10 نقاط: رتبة F 🪵
    ملاحظة: السمعة هي مقياس لاحترام وثقة الإمبراطورية في المغامر، ويمكن للأعضاء تزكية بعضهم يومياً لرفع هذه النقاط.
    `,

    // الرتب والمكافآت (مستويات الشات)
    ranks: `
    [سلم النبالة والمكافآت - باللفل]:
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

// 🔥 دالة لجلب البيانات الحية (توب، بوس) مخصصة للسيرفر الحالي فقط
function getDynamicServerData(guildId) {
    if (!db) return null;
    try {
        // 1. التوب 3 في الليفل (خاص بالسيرفر الحالي فقط)
        const topLevels = db.prepare("SELECT user, level FROM levels WHERE guild = ? ORDER BY totalXP DESC LIMIT 3").all(guildId);
        
        // 2. التوب 3 في الفلوس (مورا + بنك) (خاص بالسيرفر الحالي فقط)
        const topRich = db.prepare("SELECT user, (mora + bank) as total FROM levels WHERE guild = ? ORDER BY total DESC LIMIT 3").all(guildId);

        // 3. حالة الزعيم (خاص بالسيرفر الحالي فقط)
        const boss = db.prepare("SELECT name, currentHP, maxHP, active FROM world_boss WHERE guildID = ?").get(guildId);

        return { topLevels, topRich, boss };
    } catch (error) {
        console.error("[AI Dynamic Data Error]", error);
        return null;
    }
}

// دالة جلب بيانات المستخدم الفردي (مخصصة للسيرفر الحالي فقط)
function getUserData(userId, guildId) {
    if (!db) return { level: 0, total_wealth: 0, bank_balance: 0, wallet_cash: 0, streak: 0, reputation: 0, dungeon_floor: 0 };
    try {
        const levelRow = db.prepare('SELECT level, xp, mora, bank FROM levels WHERE user = ? AND guild = ?').get(userId, guildId);
        const streakRow = db.prepare('SELECT streakCount FROM streaks WHERE userID = ? AND guildID = ?').get(userId, guildId);
        
        // جلب بيانات السمعة والدانجون
        const repRow = db.prepare('SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?').get(userId, guildId);
        const dungeonRow = db.prepare('SELECT current_floor FROM dungeon_saves WHERE userID = ? AND guildID = ?').get(userId, guildId);
        
        const cash = levelRow ? (levelRow.mora || 0) : 0;
        const bank = levelRow ? (levelRow.bank || 0) : 0;

        return {
            level: levelRow ? levelRow.level : 1,
            xp: levelRow ? levelRow.xp : 0,
            
            wallet_cash: cash,           
            bank_balance: bank,          
            total_wealth: cash + bank,   
            
            streak: streakRow ? streakRow.streakCount : 0,
            reputation: repRow ? (repRow.rep_points || 0) : 0,           
            dungeon_floor: dungeonRow ? (dungeonRow.current_floor || 0) : 0 
        };
    } catch (error) {
        return { level: 0, total_wealth: 0, bank_balance: 0, wallet_cash: 0, streak: 0, reputation: 0, dungeon_floor: 0 };
    }
}

module.exports = { staticKnowledge, getUserData, getDynamicServerData };
