const { EmbedBuilder, Colors } = require('discord.js');

async function handleMemberRetreat(member, floor, db, guildId, thread) {
    const earnedMora = Math.floor(member.loot.mora || 0);
    const earnedXp = Math.floor(member.loot.xp || 0);

    if (db && (earnedMora > 0 || earnedXp > 0)) {
        await db.query('UPDATE levels SET mora = mora + $1, xp = xp + $2 WHERE "user" = $3 AND guild = $4', [earnedMora, earnedXp, member.id, guildId]);
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
            await db.query('UPDATE levels SET mora = mora + $1, xp = xp + $2 WHERE "user" = $3 AND guild = $4', [finalMora, finalXp, p.id, guildId]);
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
            await db.query('UPDATE levels SET mora = mora + $1, xp = xp + $2 WHERE "user" = $3 AND guild = $4', [earnedMora, earnedXp, p.id, guildId]);
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
