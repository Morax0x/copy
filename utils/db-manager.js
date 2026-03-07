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
                data.user || data.userid, data.guild || data.guildid, data.xp || 0, data.level || 1, data.totalXP ?? data.totalxp ?? 0, data.mora || 0, data.lastWork ?? data.lastwork ?? 0, data.lastDaily ?? data.lastdaily ?? 0, data.dailyStreak ?? data.dailystreak ?? 0, data.bank || 0,
                data.lastInterest ?? data.lastinterest ?? 0, data.totalInterestEarned ?? data.totalinterestearned ?? 0, data.hasGuard ?? data.hasguard ?? 0, data.guardExpires ?? data.guardexpires ?? 0, data.totalVCTime ?? data.totalvctime ?? 0, data.lastCollected ?? data.lastcollected ?? 0,
                data.lastRob ?? data.lastrob ?? 0, data.lastGuess ?? data.lastguess ?? 0, data.lastRPS ?? data.lastrps ?? 0, data.lastRoulette ?? data.lastroulette ?? 0, data.lastTransfer ?? data.lasttransfer ?? 0, data.lastDeposit ?? data.lastdeposit ?? 0, data.shop_purchases ?? 0,
                data.total_meow_count ?? 0, data.boost_count ?? 0, data.lastPVP ?? data.lastpvp ?? 0, data.lastFarmYield ?? data.lastfarmyield ?? 0, data.lastFish ?? data.lastfish ?? 0, data.rodLevel ?? data.rodlevel ?? 1, data.boatLevel ?? data.boatlevel ?? 1,
                data.currentLocation ?? data.currentlocation ?? 'beach', data.lastMemory ?? data.lastmemory ?? 0, data.lastArrange ?? data.lastarrange ?? 0, data.last_dungeon ?? 0, data.dungeon_gate_level ?? 1, data.max_dungeon_floor ?? 0, data.dungeon_wins ?? 0,
                data.lastRace ?? data.lastrace ?? 0, data.lastTransferDate ?? data.lasttransferdate ?? '', data.dailyTransferCount ?? data.dailytransfercount ?? 0
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
                data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.date, data.messages ?? 0, data.images ?? 0, data.stickers ?? 0, data.emojis_sent ?? 0, data.reactions_added ?? 0, data.replies_sent ?? 0, data.mentions_received ?? 0, data.vc_minutes ?? 0, data.water_tree ?? 0, data.counting_channel ?? 0, data.meow_count ?? 0, data.streaming_minutes ?? 0, data.disboard_bumps ?? 0, data.boost_channel_reactions ?? 0, data.topgg_votes ?? 0
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
                data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.weekStartDate ?? data.weekstartdate, data.messages ?? 0, data.images ?? 0, data.stickers ?? 0, data.emojis_sent ?? 0, data.reactions_added ?? 0, data.replies_sent ?? 0, data.mentions_received ?? 0, data.vc_minutes ?? 0, data.water_tree ?? 0, data.counting_channel ?? 0, data.meow_count ?? 0, data.streaming_minutes ?? 0, data.disboard_bumps ?? 0, data.topgg_votes ?? 0
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
                data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.total_messages ?? 0, data.total_images ?? 0, data.total_stickers ?? 0, data.total_emojis_sent ?? 0, data.total_reactions_added ?? 0, data.total_replies_sent ?? 0, data.total_mentions_received ?? 0, data.total_vc_minutes ?? 0, data.total_disboard_bumps ?? 0, data.total_topgg_votes ?? 0
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
                data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.dailyNotif ?? data.dailynotif ?? 1, data.weeklyNotif ?? data.weeklynotif ?? 1, data.achievementsNotif ?? data.achievementsnotif ?? 1, data.levelNotif ?? data.levelnotif ?? 1, data.kingsNotif ?? data.kingsnotif ?? 1, data.badgesNotif ?? data.badgesnotif ?? 1
            ]);
        } catch(e) {}
    };
};
