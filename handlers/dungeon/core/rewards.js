const { EmbedBuilder, Colors } = require('discord.js');

/**
 * معالجة انسحاب عضو واحد فورياً
 */
async function handleMemberRetreat(member, floor, sql, guildId, thread) {
    // 1. حساب الجوائز المتراكمة في المحفظة
    const earnedMora = Math.floor(member.loot.mora);
    const earnedXp = Math.floor(member.loot.xp);

    // 2. الحفظ الفوري في الداتابيس
    if (sql.open && (earnedMora > 0 || earnedXp > 0)) {
        sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
           .run(earnedMora, earnedXp, member.id, guildId);
    }

    // 3. وضع علامة أن هذا اللاعب استلم جوائزه (لتجنب التكرار)
    member.rewardsClaimed = true;
    member.finalMora = earnedMora; // للحفظ في السجل النهائي
    member.finalXp = earnedXp;

    // 4. تصفير المحفظة الحالية (لأنه استلمها خلاص)
    member.loot.mora = 0;
    member.loot.xp = 0;

    return { mora: earnedMora, xp: earnedXp };
}

/**
 * معالجة موت الفريق بالكامل (أو انتهاء الوقت)
 */
async function handleTeamWipe(players, currentFloor, sql, guildId) {
    const results = [];

    for (const p of players) {
        // إذا كان اللاعب قد انسحب سابقاً واستلم جوائزه، نتجاهله
        if (p.rewardsClaimed) continue;

        let finalMora = 0;
        let finalXp = 0;
        let note = "";

        // القاعدة 1: إذا ماتوا فوق الطابق 20 -> نرجع لجوائز الطابق 20 (نقطة الأمان)
        if (currentFloor > 20) {
            // نستخدم النسخة المحفوظة عند الطابق 20
            finalMora = p.lootSnapshot20 ? p.lootSnapshot20.mora : 0;
            finalXp = p.lootSnapshot20 ? p.lootSnapshot20.xp : 0;
            note = " (Safe Point F20)";
        } 
        // القاعدة 2: إذا ماتوا في الطابق 20 أو أقل -> خصم 50%
        else {
            finalMora = Math.floor(p.loot.mora * 0.5);
            finalXp = Math.floor(p.loot.xp * 0.5);
            note = " (Penalty -50%)";
        }

        // الحفظ في الداتابيس
        if (sql.open && (finalMora > 0 || finalXp > 0)) {
            sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
               .run(finalMora, finalXp, p.id, guildId);
        }

        p.finalMora = finalMora;
        p.finalXp = finalXp;
        p.rewardsClaimed = true; // نمنع التكرار
        
        results.push({ name: p.name, mora: finalMora, xp: finalXp, note: note });
    }
    return results;
}

/**
 * معالجة انسحاب القائد (الجميع ينسحب بسلام)
 */
async function handleLeaderRetreat(players, sql, guildId) {
    const results = [];

    for (const p of players) {
        if (p.rewardsClaimed) continue; // تخطي من انسحب قبله

        const earnedMora = Math.floor(p.loot.mora);
        const earnedXp = Math.floor(p.loot.xp);

        if (sql.open && (earnedMora > 0 || earnedXp > 0)) {
            sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
               .run(earnedMora, earnedXp, p.id, guildId);
        }

        p.finalMora = earnedMora;
        p.finalXp = earnedXp;
        p.rewardsClaimed = true;

        results.push({ name: p.name, mora: earnedMora, xp: earnedXp });
    }
    return results;
}

/**
 * دالة مساعدة لحفظ لقطة من الجوائز عند الطابق 20
 */
function snapshotLootAtFloor20(players) {
    players.forEach(p => {
        // نحفظ نسخة من الجوائز كما هي الآن (عند نهاية الطابق 20)
        p.lootSnapshot20 = {
            mora: p.loot.mora,
            xp: p.loot.xp
        };
    });
}

module.exports = { 
    handleMemberRetreat, 
    handleTeamWipe, 
    handleLeaderRetreat,
    snapshotLootAtFloor20
};
