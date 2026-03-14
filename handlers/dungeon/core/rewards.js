const { EmbedBuilder, Colors } = require('discord.js');

async function safeUpdateLevels(db, userId, guildId, addMora, addXp, context, client) {
    if (!db) return;
    try {
        let currentMora = 0, currentXp = 0;
        let useQuotes = true;

        try {
            const res = await db.query(`SELECT "mora", "xp" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
            if (res.rows.length > 0) { currentMora = Number(res.rows[0].mora) || 0; currentXp = Number(res.rows[0].xp) || 0; }
            else await db.query(`INSERT INTO levels ("user", "guild", "mora", "xp", "level") VALUES ($1, $2, 0, 0, 1)`, [userId, guildId]).catch(()=>{});
        } catch (e1) {
            useQuotes = false;
            const res = await db.query(`SELECT mora, xp FROM levels WHERE userid = $1 AND guildid = $2`, [userId, guildId]).catch(()=>{});
            if (res && res.rows.length > 0) { currentMora = Number(res.rows[0].mora) || 0; currentXp = Number(res.rows[0].xp) || 0; }
            else if (res) await db.query(`INSERT INTO levels (userid, guildid, mora, xp, level) VALUES ($1, $2, 0, 0, 1)`, [userId, guildId]).catch(()=>{});
        }

        const newMora = currentMora + addMora;
        const newXp = currentXp + addXp;

        if (useQuotes) await db.query(`UPDATE levels SET "mora" = $1, "xp" = $2 WHERE "user" = $3 AND "guild" = $4`, [String(newMora), String(newXp), userId, guildId]);
        else await db.query(`UPDATE levels SET mora = $1, xp = $2 WHERE userid = $3 AND guildid = $4`, [String(newMora), String(newXp), userId, guildId]);
        
        // 🔥 الحل الجذري لمشكلة التأخير: مسح الذاكرة المؤقتة (Cache) ليظهر الرصيد فوراً 🔥
        if (client && client.levelCache) {
            client.levelCache.delete(`${guildId}-${userId}`);
        }
    } catch (e) {
        console.error(`[🚨 DUNGEON ERROR]`, e);
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

async function handleTeamWipe(players, currentFloor, db, guildId) {
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
            await safeUpdateLevels(db, p.id, guildId, finalMora, finalXp, "TEAM WIPE", null);
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
            await safeUpdateLevels(db, p.id, guildId, earnedMora, earnedXp, "LEADER RETREAT", null);
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
