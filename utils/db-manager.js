module.exports = (client, db) => {
    client.defaultData = { 
        user: null, guild: null, xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, 
        lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, 
        lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, 
        total_meow_count: 0, boost_count: 0, lastPVP: 0, lastFarmYield: 0, lastFish: 0, rodLevel: 1, boatLevel: 1, currentLocation: 'beach',
        lastMemory: 0, lastArrange: 0, last_dungeon: 0, dungeon_gate_level: 1, max_dungeon_floor: 0, dungeon_wins: 0,
        lastRace: 0, lastTransferDate: '', dailyTransferCount: 0 
    };

    const defaultDailyStats = { messages: 0, images: 0, stickers: 0, emojis_sent: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0, boost_channel_reactions: 0, topgg_votes: 0 };
    const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_emojis_sent: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0, total_topgg_votes: 0 };

    client.safeMerge = function(base, defaults) {
        const result = { ...base };
        for (const key in defaults) {
            if (result[key] === undefined) result[key] = defaults[key];
        }
        return result;
    };

    client.getLevel = async function(userId, guildId) {
        try {
            const res = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
            return res.rows[0];
        } catch(e) { return null; }
    };

    client.setLevel = async function(data) {
        try {
            const query = `
                INSERT INTO levels (
                    "user", guild, xp, level, totalXP, mora, lastWork, lastDaily, dailyStreak, bank,
                    lastInterest, totalInterestEarned, hasGuard, guardExpires, totalVCTime, lastCollected,
                    lastRob, lastGuess, lastRPS, lastRoulette, lastTransfer, lastDeposit, shop_purchases,
                    total_meow_count, boost_count, lastPVP, lastFarmYield, lastFish, rodLevel, boatLevel,
                    currentLocation, lastMemory, lastArrange, last_dungeon, dungeon_gate_level, max_dungeon_floor, dungeon_wins,
                    lastRace, lastTransferDate, dailyTransferCount
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
                    $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
                ) ON CONFLICT ("user", guild) DO UPDATE SET
                    xp = EXCLUDED.xp, level = EXCLUDED.level, totalXP = EXCLUDED.totalXP, mora = EXCLUDED.mora, lastWork = EXCLUDED.lastWork, lastDaily = EXCLUDED.lastDaily, dailyStreak = EXCLUDED.dailyStreak, bank = EXCLUDED.bank,
                    lastInterest = EXCLUDED.lastInterest, totalInterestEarned = EXCLUDED.totalInterestEarned, hasGuard = EXCLUDED.hasGuard, guardExpires = EXCLUDED.guardExpires, totalVCTime = EXCLUDED.totalVCTime, lastCollected = EXCLUDED.lastCollected,
                    lastRob = EXCLUDED.lastRob, lastGuess = EXCLUDED.lastGuess, lastRPS = EXCLUDED.lastRPS, lastRoulette = EXCLUDED.lastRoulette, lastTransfer = EXCLUDED.lastTransfer, lastDeposit = EXCLUDED.lastDeposit, shop_purchases = EXCLUDED.shop_purchases,
                    total_meow_count = EXCLUDED.total_meow_count, boost_count = EXCLUDED.boost_count, lastPVP = EXCLUDED.lastPVP, lastFarmYield = EXCLUDED.lastFarmYield, lastFish = EXCLUDED.lastFish, rodLevel = EXCLUDED.rodLevel, boatLevel = EXCLUDED.boatLevel,
                    currentLocation = EXCLUDED.currentLocation, lastMemory = EXCLUDED.lastMemory, lastArrange = EXCLUDED.lastArrange, last_dungeon = EXCLUDED.last_dungeon, dungeon_gate_level = EXCLUDED.dungeon_gate_level, max_dungeon_floor = EXCLUDED.max_dungeon_floor, dungeon_wins = EXCLUDED.dungeon_wins,
                    lastRace = EXCLUDED.lastRace, lastTransferDate = EXCLUDED.lastTransferDate, dailyTransferCount = EXCLUDED.dailyTransferCount;
            `;
            await db.query(query, [
                data.user, data.guild, data.xp, data.level, data.totalXP, data.mora, data.lastWork, data.lastDaily, data.dailyStreak, data.bank,
                data.lastInterest, data.totalInterestEarned, data.hasGuard, data.guardExpires, data.totalVCTime, data.lastCollected,
                data.lastRob, data.lastGuess, data.lastRPS, data.lastRoulette, data.lastTransfer, data.lastDeposit, data.shop_purchases,
                data.total_meow_count, data.boost_count, data.lastPVP, data.lastFarmYield, data.lastFish, data.rodLevel, data.boatLevel,
                data.currentLocation, data.lastMemory, data.lastArrange, data.last_dungeon, data.dungeon_gate_level, data.max_dungeon_floor, data.dungeon_wins,
                data.lastRace, data.lastTransferDate, data.dailyTransferCount
            ]);
        } catch(e) {}
    };

    client.getDailyStats = async function(id) {
        try {
            const res = await db.query('SELECT * FROM user_daily_stats WHERE id = $1', [id]);
            return res.rows[0];
        } catch(e) { return null; }
    };

    client.setDailyStats = async function(data) {
        try {
            const query = `
                INSERT INTO user_daily_stats (id, userID, guildID, date, messages, images, stickers, emojis_sent, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps, boost_channel_reactions, topgg_votes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                ON CONFLICT (id) DO UPDATE SET
                userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, date=EXCLUDED.date, messages=EXCLUDED.messages, images=EXCLUDED.images, stickers=EXCLUDED.stickers, emojis_sent=EXCLUDED.emojis_sent, reactions_added=EXCLUDED.reactions_added, replies_sent=EXCLUDED.replies_sent, mentions_received=EXCLUDED.mentions_received, vc_minutes=EXCLUDED.vc_minutes, water_tree=EXCLUDED.water_tree, counting_channel=EXCLUDED.counting_channel, meow_count=EXCLUDED.meow_count, streaming_minutes=EXCLUDED.streaming_minutes, disboard_bumps=EXCLUDED.disboard_bumps, boost_channel_reactions=EXCLUDED.boost_channel_reactions, topgg_votes=EXCLUDED.topgg_votes;
            `;
            await db.query(query, [
                data.id, data.userID, data.guildID, data.date, data.messages, data.images, data.stickers, data.emojis_sent, data.reactions_added, data.replies_sent, data.mentions_received, data.vc_minutes, data.water_tree, data.counting_channel, data.meow_count, data.streaming_minutes, data.disboard_bumps, data.boost_channel_reactions, data.topgg_votes
            ]);
        } catch(e) {}
    };

    client.getWeeklyStats = async function(id) {
        try {
            const res = await db.query('SELECT * FROM user_weekly_stats WHERE id = $1', [id]);
            return res.rows[0];
        } catch(e) { return null; }
    };

    client.setWeeklyStats = async function(data) {
        try {
            const query = `
                INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, messages, images, stickers, emojis_sent, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps, topgg_votes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                ON CONFLICT (id) DO UPDATE SET
                userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, weekStartDate=EXCLUDED.weekStartDate, messages=EXCLUDED.messages, images=EXCLUDED.images, stickers=EXCLUDED.stickers, emojis_sent=EXCLUDED.emojis_sent, reactions_added=EXCLUDED.reactions_added, replies_sent=EXCLUDED.replies_sent, mentions_received=EXCLUDED.mentions_received, vc_minutes=EXCLUDED.vc_minutes, water_tree=EXCLUDED.water_tree, counting_channel=EXCLUDED.counting_channel, meow_count=EXCLUDED.meow_count, streaming_minutes=EXCLUDED.streaming_minutes, disboard_bumps=EXCLUDED.disboard_bumps, topgg_votes=EXCLUDED.topgg_votes;
            `;
            await db.query(query, [
                data.id, data.userID, data.guildID, data.weekStartDate, data.messages, data.images, data.stickers, data.emojis_sent, data.reactions_added, data.replies_sent, data.mentions_received, data.vc_minutes, data.water_tree, data.counting_channel, data.meow_count, data.streaming_minutes, data.disboard_bumps, data.topgg_votes
            ]);
        } catch(e) {}
    };

    client.getTotalStats = async function(id) {
        try {
            const res = await db.query('SELECT * FROM user_total_stats WHERE id = $1', [id]);
            return res.rows[0];
        } catch(e) { return null; }
    };

    client.setTotalStats = async function(data) {
        try {
            const query = `
                INSERT INTO user_total_stats (id, userID, guildID, total_messages, total_images, total_stickers, total_emojis_sent, total_reactions_added, total_replies_sent, total_mentions_received, total_vc_minutes, total_disboard_bumps, total_topgg_votes)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (id) DO UPDATE SET
                userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, total_messages=EXCLUDED.total_messages, total_images=EXCLUDED.total_images, total_stickers=EXCLUDED.total_stickers, total_emojis_sent=EXCLUDED.total_emojis_sent, total_reactions_added=EXCLUDED.total_reactions_added, total_replies_sent=EXCLUDED.total_replies_sent, total_mentions_received=EXCLUDED.total_mentions_received, total_vc_minutes=EXCLUDED.total_vc_minutes, total_disboard_bumps=EXCLUDED.total_disboard_bumps, total_topgg_votes=EXCLUDED.total_topgg_votes;
            `;
            await db.query(query, [
                data.id, data.userID, data.guildID, data.total_messages, data.total_images, data.total_stickers, data.total_emojis_sent, data.total_reactions_added, data.total_replies_sent, data.total_mentions_received, data.total_vc_minutes, data.total_disboard_bumps, data.total_topgg_votes
            ]);
        } catch(e) {}
    };

    client.getQuestNotif = async function(id) {
        try {
            const res = await db.query('SELECT * FROM quest_notifications WHERE id = $1', [id]);
            return res.rows[0];
        } catch(e) { return null; }
    };

    client.setQuestNotif = async function(data) {
        try {
            const query = `
                INSERT INTO quest_notifications (id, userID, guildID, dailyNotif, weeklyNotif, achievementsNotif, levelNotif, kingsNotif, badgesNotif)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (id) DO UPDATE SET
                userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, dailyNotif=EXCLUDED.dailyNotif, weeklyNotif=EXCLUDED.weeklyNotif, achievementsNotif=EXCLUDED.achievementsNotif, levelNotif=EXCLUDED.levelNotif, kingsNotif=EXCLUDED.kingsNotif, badgesNotif=EXCLUDED.badgesNotif;
            `;
            await db.query(query, [
                data.id, data.userID, data.guildID, data.dailyNotif, data.weeklyNotif, data.achievementsNotif, data.levelNotif, data.kingsNotif, data.badgesNotif
            ]);
        } catch(e) {}
    };
};
