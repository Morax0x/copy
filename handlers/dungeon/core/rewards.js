const { EmbedBuilder, Colors } = require('discord.js');

// 🔥 نظام التحديث الآمن ورادار الفحص 🔥
async function safeUpdateLevels(db, userId, guildId, addMora, addXp, context) {
    console.log(`\n[🕵️ DUNGEON DEBUG - ${context}] Starting update for User: ${userId} | Mora: +${addMora} | XP: +${addXp}`);
    if (!db) { console.log(`[❌ DUNGEON DEBUG] Database is undefined!`); return; }

    try {
        let currentMora = 0, currentXp = 0;
        let useQuotes = true;

        try {
            const res = await db.query(`SELECT "mora", "xp" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            if (res.rows.length > 0) { 
                currentMora = Number(res.rows[0].mora) || 0; 
                currentXp = Number(res.rows[0].xp) || 0; 
            } else {
                await db.query(`INSERT INTO levels ("user", "guild", "mora", "xp", "level") VALUES ($1, $2, 0, 0, 1)`, [userId, guildId]).catch(()=>{});
            }
        } catch (e1) {
            useQuotes = false;
            console.log(`[⚠️ DUNGEON DEBUG] Select Query 1 failed: ${e1.message}`);
            const res = await db.query(`SELECT mora, xp FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(e => console.log(`[❌ DUNGEON DEBUG] Select Query 2 failed: ${e.message}`));
            if (res && res.rows.length > 0) { 
                currentMora = Number(res.rows[0].mora) || 0; 
                currentXp = Number(res.rows[0].xp) || 0; 
            } else if (res) {
                await db.query(`INSERT INTO levels (userid, guildid, mora, xp, level) VALUES ($1, $2, 0, 0, 1)`, [userId, guildId]).catch(()=>{});
            }
        }

        // الحساب الرياضي يتم هنا لتفادي أخطاء قواعد البيانات
        const newMora = currentMora + addMora;
        const newXp = currentXp + addXp;
        console.log(`[📊 DUNGEON DEBUG] Math result: Mora (${currentMora} -> ${newMora}) | XP (${currentXp} -> ${newXp})`);

        if (useQuotes) {
            await db.query(`UPDATE levels SET "mora" = $1, "xp" = $2 WHERE "user" = $3 AND "guild" = $4`, [String(newMora), String(newXp), userId, guildId]);
        } else {
            await db.query(`UPDATE levels SET mora = $1, xp = $2 WHERE userid = $3 AND guildid = $4`, [String(newMora), String(newXp), userId, guildId]);
        }
        console.log(`[✅ DUNGEON DEBUG] Successfully updated DB for user ${userId}!`);
    } catch (e) {
        console.error(`[🚨 DUNGEON DEBUG FATAL ERROR]`, e);
    }
}

async function handleMemberRetreat(member, floor, db, guildId, thread) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    if (db && (earnedMora > 0 || earnedXp > 0)) {
        await safeUpdateLevels(db, member.id, guildId, earnedMora, earnedXp, "RETREAT");
    }

    member.rewardsClaimed = true;
    member.finalMora = earnedMora;
    member.finalXp = earnedXp;

    member.loot.mora = 0;
    member.loot.xp = 0;

    return { mora: earnedMora, xp: earnedXp };
}

async function handleTeamWipe(players, currentFloor, db, guildId) {
    const results = [];

    for (const p of players) {
        if (p.rewardsClaimed) continue;

        let finalMora = 0;
        let finalXp = 0;
        let note = "";

        if (currentFloor > 20) {
            finalMora = p.lootSnapshot20 ? p.lootSnapshot20.mora : 0;
            finalXp = p.lootSnapshot20 ? p.lootSnapshot20.xp : 0;
            note = " (Safe Point F20)";
        } 
        else {
            finalMora = Math.floor((p.loot.mora || 0) * 0.5);
            finalXp = Math.floor((p.loot.xp || 0) * 0.5);
            note = " (Penalty -50%)";
        }

        if (db && (finalMora > 0 || finalXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, finalMora, finalXp, "TEAM WIPE");
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

async function handleLeaderRetreat(players, db, guildId) {
    const results = [];

    for (const p of players) {
        if (p.rewardsClaimed) continue;

        const earnedMora = Math.floor(p.loot.mora || 0);
        const earnedXp = Math.floor(p.loot.xp || 0);

        if (db && (earnedMora > 0 || earnedXp > 0)) {
            await safeUpdateLevels(db, p.id, guildId, earnedMora, earnedXp, "LEADER RETREAT");
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
