const { EmbedBuilder, Colors } = require('discord.js');

/**
 * معالجة انسحاب عضو واحد فورياً
 * - يحفظ الجوائز في قاعدة البيانات فوراً.
 * - يضع علامة لمنع التكرار.
 * - يصفر المحفظة المؤقتة.
 */
async function handleMemberRetreat(member, floor, sql, guildId, thread) {
    // 1. حساب الجوائز المتراكمة في المحفظة
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    // 2. الحفظ الفوري في الداتابيس (تأمين الغنيمة)
    if (sql.open && (earnedMora > 0 || earnedXp > 0)) {
        sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
           .run(earnedMora, earnedXp, member.id, guildId);
    }

    // 3. وضع علامة أن هذا اللاعب استلم جوائزه (لتجنب التكرار في حالة موت الفريق لاحقاً)
    member.rewardsClaimed = true;
    member.finalMora = earnedMora; // للحفظ في السجل النهائي (log)
    member.finalXp = earnedXp;

    // 4. تصفير المحفظة الحالية (لأنه استلمها خلاص)
    member.loot.mora = 0;
    member.loot.xp = 0;

    return { mora: earnedMora, xp: earnedXp };
}

/**
 * معالجة موت الفريق بالكامل (أو انتهاء الوقت)
 * - يطبق عقوبات الخسارة بناءً على الطابق.
 * - يتجاهل من انسحب سابقاً (rewardsClaimed).
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
            // نستخدم النسخة المحفوظة (Snapshot) عند الطابق 20
            finalMora = p.lootSnapshot20 ? p.lootSnapshot20.mora : 0;
            finalXp = p.lootSnapshot20 ? p.lootSnapshot20.xp : 0;
            note = " (Safe Point F20)";
        } 
        // القاعدة 2: إذا ماتوا في الطابق 20 أو أقل -> خصم 50% من الجوائز المتراكمة
        else {
            finalMora = Math.floor((p.loot.mora || 0) * 0.5);
            finalXp = Math.floor((p.loot.xp || 0) * 0.5);
            note = " (Penalty -50%)";
        }

        // الحفظ في الداتابيس (إذا تبقى شيء بعد الخصم)
        if (sql.open && (finalMora > 0 || finalXp > 0)) {
            sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
               .run(finalMora, finalXp, p.id, guildId);
        }

        p.finalMora = finalMora;
        p.finalXp = finalXp;
        p.rewardsClaimed = true; // نمنع التكرار مستقبلاً
        
        // تصفير المحفظة بعد التوزيع
        p.loot.mora = 0;
        p.loot.xp = 0;

        results.push({ name: p.name, mora: finalMora, xp: finalXp, note: note });
    }
    return results;
}

/**
 * معالجة انسحاب القائد (الجميع ينسحب بسلام)
 * - يحصل الجميع على كامل جوائزهم المتراكمة.
 */
async function handleLeaderRetreat(players, sql, guildId) {
    const results = [];

    for (const p of players) {
        if (p.rewardsClaimed) continue; // تخطي من انسحب قبله

        const earnedMora = Math.floor(p.loot.mora || 0);
        const earnedXp = Math.floor(p.loot.xp || 0);

        if (sql.open && (earnedMora > 0 || earnedXp > 0)) {
            sql.prepare("UPDATE levels SET mora = mora + ?, xp = xp + ? WHERE user = ? AND guild = ?")
               .run(earnedMora, earnedXp, p.id, guildId);
        }

        p.finalMora = earnedMora;
        p.finalXp = earnedXp;
        p.rewardsClaimed = true;
        
        // تصفير المحفظة
        p.loot.mora = 0;
        p.loot.xp = 0;

        results.push({ name: p.name, mora: earnedMora, xp: earnedXp });
    }
    return results;
}

/**
 * دالة مساعدة لحفظ لقطة من الجوائز عند الطابق 20 (نقطة الأمان)
 * - تستدعى مرة واحدة فقط عند الوصول للطابق 20.
 */
function snapshotLootAtFloor20(players) {
    players.forEach(p => {
        // نحفظ نسخة من الجوائز كما هي الآن (عند نهاية الطابق 20)
        // هذه النسخة لا تتأثر بالتقدم المستقبلي وتستخدم فقط عند الخسارة فوق طابق 20
        p.lootSnapshot20 = {
            mora: Math.floor(p.loot.mora || 0),
            xp: Math.floor(p.loot.xp || 0)
        };
    });
}

module.exports = { 
    handleMemberRetreat, 
    handleTeamWipe, 
    handleLeaderRetreat,
    snapshotLootAtFloor20
};
