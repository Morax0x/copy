const { EmbedBuilder, Colors } = require('discord.js');

// 🔥 استيراد الدالة السحرية لإضافة الـ XP بصمت 🔥
let addXPAndCheckLevel;
try {
    ({ addXPAndCheckLevel } = require('../../handler-utils.js'));
} catch (e) {
    try {
        ({ addXPAndCheckLevel } = require('../../../handlers/handler-utils.js'));
    } catch(err) {}
}

// 🔥 نظام الحفظ المحصن: تم تحويله لاستخدام الدالة المركزية والصامتة 🔥
async function safeUpdateLevels(db, userId, guildId, addMora, addXp, context, client) {
    if (!db || (addMora === 0 && addXp === 0)) return;
    
    try {
        if (addXPAndCheckLevel && client) {
            const guildObj = client.guilds.cache.get(guildId);
            if (guildObj) {
                const member = await guildObj.members.fetch(userId).catch(()=>null);
                if (member) {
                    // نمرر false لمنع إرسال التهنئة باللفل
                    await addXPAndCheckLevel(client, member, db, addXp, addMora, false).catch(()=>{});
                    return; // انتهينا، الدالة المركزية تكفلت بكل شيء
                }
            }
        }
        
        // كود احتياطي (Fallback) في حال كان العضو قد غادر السيرفر أثناء المعركة
        let userData = null;
        if (client && typeof client.getLevel === 'function') {
            userData = await client.getLevel(userId, guildId);
        }
        
        if (!userData) {
            userData = { ...client.defaultData, user: userId, guild: guildId, level: 1, xp: 0, totalXP: 0, mora: 0, bank: 0 };
        }

        userData.mora = String(Number(userData.mora || 0) + addMora);
        userData.xp = String(Number(userData.xp || 0) + addXp);
        userData.totalXP = String(Number(userData.totalXP || userData.totalxp || 0) + addXp);

        if (client && typeof client.setLevel === 'function') {
            await client.setLevel(userData);
        }

        try {
            await db.query(`
                INSERT INTO levels ("user", "guild", "mora", "xp", "totalXP", "level") 
                VALUES ($1, $2, $3, $4, $4, 1) 
                ON CONFLICT ("user", "guild") DO UPDATE SET 
                "mora" = CAST(COALESCE(levels."mora", '0') AS BIGINT) + $3, 
                "xp" = CAST(COALESCE(levels."xp", '0') AS BIGINT) + $4, 
                "totalXP" = CAST(COALESCE(levels."totalXP", '0') AS BIGINT) + $4
            `, [userId, guildId, addMora, addXp]);
        } catch(e) {
            await db.query(`
                INSERT INTO levels (userid, guildid, mora, xp, totalxp, level) 
                VALUES ($1, $2, $3, $4, $4, 1) 
                ON CONFLICT (userid, guildid) DO UPDATE SET 
                mora = CAST(COALESCE(levels.mora, '0') AS BIGINT) + $3, 
                xp = CAST(COALESCE(levels.xp, '0') AS BIGINT) + $4, 
                totalxp = CAST(COALESCE(levels.totalxp, '0') AS BIGINT) + $4
            `, [userId, guildId, addMora, addXp]).catch(()=>{});
        }
    } catch (e) {
        console.error(`[🚨 DUNGEON REWARDS ERROR] in safeUpdateLevels:`, e);
    }
}

async function handleMemberRetreat(member, floor, db, guildId, thread) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    if (db && (earnedMora > 0 || earnedXp > 0)) {
        const client = thread ? thread.client : null;
        await safeUpdateLevels(db, member.id, guildId, earnedMora, earnedXp, "RETREAT", client);
    }

    member.rewardsClaimed = true;
    member.finalMora = earnedMora;
    member.finalXp = earnedXp;
    member.loot.mora = 0;
    member.loot.xp = 0;

    return { mora: earnedMora, xp: earnedXp };
}

async function handleTeamWipe(players, currentFloor, db, guildId, client) {
    const results = [];
    for (const p of players) {
        if (p.rewardsClaimed) continue;
        let finalMora = 0, finalXp = 0, note = "";

        if (currentFloor > 20) {
            finalMora = p.lootSnapshot20 ? p.lootSnapshot20.mora : 0;
            finalXp = p.lootSnapshot20 ? p.lootSnapshot20.xp : 0;
            note = " (Safe Point F20)";
        } else {
            finalMora = Math.floor((p.loot.mora || 0) * 0.5);
            finalXp = Math.floor((p.loot.xp || 0) * 0.5);
            note = " (Penalty -50%)";
        }

        if (db && (finalMora > 0 || finalXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, finalMora, finalXp, "TEAM WIPE", client);
        }

        p.finalMora = finalMora;
        p.finalXp = finalXp;
        p.rewardsClaimed = true; 
        p.loot.mora = 0;
        p.loot.xp = 0;
        results.push({ name: p.name, mora: finalMora, xp: finalXp, note: note });
    }
    return results;
}

async function handleLeaderRetreat(players, db, guildId, client) {
    const results = [];
    for (const p of players) {
        if (p.rewardsClaimed) continue;
        const earnedMora = Math.floor(p.loot.mora || 0);
        const earnedXp = Math.floor(p.loot.xp || 0);

        if (db && (earnedMora > 0 || earnedXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, earnedMora, earnedXp, "LEADER RETREAT", client);
        }

        p.finalMora = earnedMora;
        p.finalXp = earnedXp;
        p.rewardsClaimed = true;
        p.loot.mora = 0;
        p.loot.xp = 0;
        results.push({ name: p.name, mora: earnedMora, xp: earnedXp });
    }
    return results;
}

function snapshotLootAtFloor20(players) {
    players.forEach(p => {
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
