module.exports = (client, db) => {
    // 🚀 الذاكرة العشوائية (RAM Cache) للسرعة الخارقة
    const levelsCache = new Map();
    const dailyStatsCache = new Map();
    const weeklyStatsCache = new Map();
    const totalStatsCache = new Map();
    const questNotifCache = new Map();

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
    const defaultQuestNotif = { userID: null, guildID: null, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 };

    client.safeMerge = function(base, defaults) {
        const result = { ...base };
        for (const key in defaults) {
            if (result[key] === undefined) result[key] = defaults[key];
        }
        return result;
    };

    function fixCase(row, defaultObj) {
        if (!row) return null;
        let fixed = {};
        for (let key in defaultObj) {
            let lowerKey = key.toLowerCase();
            if (row[lowerKey] !== undefined && row[lowerKey] !== null) fixed[key] = row[lowerKey];
            else if (row[key] !== undefined && row[key] !== null) fixed[key] = row[key];
            else fixed[key] = defaultObj[key];
        }
        for (let key in row) {
            if (fixed[key] === undefined) fixed[key] = row[key];
        }

        // 🔥 إجبار تحويل الأرقام الفلكية لنوع رقمي حقيقي لمنع الاندماج النصي
        for (const [k, v] of Object.entries(fixed)) {
            if (typeof v === 'string' && !isNaN(v) && v.trim() !== '') {
                // نستثني الآيديات والتواريخ لأنها نصوص أرقام لا تُجمع
                if (!['user', 'userid', 'guild', 'guildid', 'id', 'lasttransferdate', 'date', 'weekstartdate', 'currentlocation', 'last_rob_pardon', 'last_ticket_reset'].includes(k.toLowerCase())) {
                    fixed[k] = Number(v);
                }
            }
        }
        return fixed;
    }

    client.getLevel = async function(userId, guildId) {
        const cacheKey = `${userId}-${guildId}`;
        if (levelsCache.has(cacheKey)) return levelsCache.get(cacheKey);

        try {
            const res = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userId, guildId]);
            const data = fixCase(res.rows[0], client.defaultData);
            if (data) levelsCache.set(cacheKey, data);
            return data;
        } catch(e) { return null; }
    };

    client.setLevel = async function(data) {
        const userId = data.user || data.userid;
        const guildId = data.guild || data.guildid;
        const cacheKey = `${userId}-${guildId}`;
        
        levelsCache.set(cacheKey, data); // حفظ في الرام للسرعة

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
        // 🔥 تأمين إضافي للمتغيرات قبل الإرسال للسحابة
        db.query(query, [
            userId, guildId, Number(data.xp) || 0, Number(data.level) || 1, Number(data.totalXP ?? data.totalxp) || 0, Number(data.mora) || 0, Number(data.lastWork ?? data.lastwork) || 0, Number(data.lastDaily ?? data.lastdaily) || 0, Number(data.dailyStreak ?? data.dailystreak) || 0, Number(data.bank) || 0,
            Number(data.lastInterest ?? data.lastinterest) || 0, Number(data.totalInterestEarned ?? data.totalinterestearned) || 0, Number(data.hasGuard ?? data.hasguard) || 0, Number(data.guardExpires ?? data.guardexpires) || 0, Number(data.totalVCTime ?? data.totalvctime) || 0, Number(data.lastCollected ?? data.lastcollected) || 0,
            Number(data.lastRob ?? data.lastrob) || 0, Number(data.lastGuess ?? data.lastguess) || 0, Number(data.lastRPS ?? data.lastrps) || 0, Number(data.lastRoulette ?? data.lastroulette) || 0, Number(data.lastTransfer ?? data.lasttransfer) || 0, Number(data.lastDeposit ?? data.lastdeposit) || 0, Number(data.shop_purchases) || 0,
            Number(data.total_meow_count) || 0, Number(data.boost_count) || 0, Number(data.lastPVP ?? data.lastpvp) || 0, Number(data.lastFarmYield ?? data.lastfarmyield) || 0, Number(data.lastFish ?? data.lastfish) || 0, Number(data.rodLevel ?? data.rodlevel) || 1, Number(data.boatLevel ?? data.boatlevel) || 1,
            data.currentLocation ?? data.currentlocation ?? 'beach', Number(data.lastMemory ?? data.lastmemory) || 0, Number(data.lastArrange ?? data.lastarrange) || 0, Number(data.last_dungeon) || 0, Number(data.dungeon_gate_level) || 1, Number(data.max_dungeon_floor) || 0, Number(data.dungeon_wins) || 0,
            Number(data.lastRace ?? data.lastrace) || 0, data.lastTransferDate ?? data.lasttransferdate ?? '', Number(data.dailyTransferCount ?? data.dailytransfercount) || 0
        ]).catch((err) => console.error("❌ [Level Save Error]:", err.message)); 
    };

    client.getDailyStats = async function(id) {
        if (dailyStatsCache.has(id)) return dailyStatsCache.get(id);
        try {
            const res = await db.query('SELECT * FROM user_daily_stats WHERE id = $1', [id]);
            const data = fixCase(res.rows[0], defaultDailyStats);
            if (data) dailyStatsCache.set(id, data);
            return data;
        } catch(e) { return null; }
    };

    client.setDailyStats = async function(data) {
        dailyStatsCache.set(data.id, data);
        const query = `
            INSERT INTO user_daily_stats (id, userID, guildID, date, messages, images, stickers, emojis_sent, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps, boost_channel_reactions, topgg_votes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            ON CONFLICT (id) DO UPDATE SET
            userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, date=EXCLUDED.date, messages=EXCLUDED.messages, images=EXCLUDED.images, stickers=EXCLUDED.stickers, emojis_sent=EXCLUDED.emojis_sent, reactions_added=EXCLUDED.reactions_added, replies_sent=EXCLUDED.replies_sent, mentions_received=EXCLUDED.mentions_received, vc_minutes=EXCLUDED.vc_minutes, water_tree=EXCLUDED.water_tree, counting_channel=EXCLUDED.counting_channel, meow_count=EXCLUDED.meow_count, streaming_minutes=EXCLUDED.streaming_minutes, disboard_bumps=EXCLUDED.disboard_bumps, boost_channel_reactions=EXCLUDED.boost_channel_reactions, topgg_votes=EXCLUDED.topgg_votes;
        `;
        db.query(query, [
            data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.date, Number(data.messages) || 0, Number(data.images) || 0, Number(data.stickers) || 0, Number(data.emojis_sent) || 0, Number(data.reactions_added) || 0, Number(data.replies_sent) || 0, Number(data.mentions_received) || 0, Number(data.vc_minutes) || 0, Number(data.water_tree) || 0, Number(data.counting_channel) || 0, Number(data.meow_count) || 0, Number(data.streaming_minutes) || 0, Number(data.disboard_bumps) || 0, Number(data.boost_channel_reactions) || 0, Number(data.topgg_votes) || 0
        ]).catch((err) => console.error("❌ [DailyStats Save Error]:", err.message));
    };

    client.getWeeklyStats = async function(id) {
        if (weeklyStatsCache.has(id)) return weeklyStatsCache.get(id);
        try {
            const res = await db.query('SELECT * FROM user_weekly_stats WHERE id = $1', [id]);
            const data = fixCase(res.rows[0], defaultDailyStats);
            if (data) weeklyStatsCache.set(id, data);
            return data;
        } catch(e) { return null; }
    };

    client.setWeeklyStats = async function(data) {
        weeklyStatsCache.set(data.id, data);
        const query = `
            INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, messages, images, stickers, emojis_sent, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps, topgg_votes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (id) DO UPDATE SET
            userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, weekStartDate=EXCLUDED.weekStartDate, messages=EXCLUDED.messages, images=EXCLUDED.images, stickers=EXCLUDED.stickers, emojis_sent=EXCLUDED.emojis_sent, reactions_added=EXCLUDED.reactions_added, replies_sent=EXCLUDED.replies_sent, mentions_received=EXCLUDED.mentions_received, vc_minutes=EXCLUDED.vc_minutes, water_tree=EXCLUDED.water_tree, counting_channel=EXCLUDED.counting_channel, meow_count=EXCLUDED.meow_count, streaming_minutes=EXCLUDED.streaming_minutes, disboard_bumps=EXCLUDED.disboard_bumps, topgg_votes=EXCLUDED.topgg_votes;
        `;
        db.query(query, [
            data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, data.weekStartDate ?? data.weekstartdate, Number(data.messages) || 0, Number(data.images) || 0, Number(data.stickers) || 0, Number(data.emojis_sent) || 0, Number(data.reactions_added) || 0, Number(data.replies_sent) || 0, Number(data.mentions_received) || 0, Number(data.vc_minutes) || 0, Number(data.water_tree) || 0, Number(data.counting_channel) || 0, Number(data.meow_count) || 0, Number(data.streaming_minutes) || 0, Number(data.disboard_bumps) || 0, Number(data.topgg_votes) || 0
        ]).catch((err) => console.error("❌ [WeeklyStats Save Error]:", err.message));
    };

    client.getTotalStats = async function(id) {
        if (totalStatsCache.has(id)) return totalStatsCache.get(id);
        try {
            const res = await db.query('SELECT * FROM user_total_stats WHERE id = $1', [id]);
            const data = fixCase(res.rows[0], defaultTotalStats);
            if (data) totalStatsCache.set(id, data);
            return data;
        } catch(e) { return null; }
    };

    client.setTotalStats = async function(data) {
        totalStatsCache.set(data.id, data);
        const query = `
            INSERT INTO user_total_stats (id, userID, guildID, total_messages, total_images, total_stickers, total_emojis_sent, total_reactions_added, total_replies_sent, total_mentions_received, total_vc_minutes, total_disboard_bumps, total_topgg_votes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
            userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, total_messages=EXCLUDED.total_messages, total_images=EXCLUDED.total_images, total_stickers=EXCLUDED.total_stickers, total_emojis_sent=EXCLUDED.total_emojis_sent, total_reactions_added=EXCLUDED.total_reactions_added, total_replies_sent=EXCLUDED.total_replies_sent, total_mentions_received=EXCLUDED.total_mentions_received, total_vc_minutes=EXCLUDED.total_vc_minutes, total_disboard_bumps=EXCLUDED.total_disboard_bumps, total_topgg_votes=EXCLUDED.total_topgg_votes;
        `;
        db.query(query, [
            data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, Number(data.total_messages) || 0, Number(data.total_images) || 0, Number(data.total_stickers) || 0, Number(data.total_emojis_sent) || 0, Number(data.total_reactions_added) || 0, Number(data.total_replies_sent) || 0, Number(data.total_mentions_received) || 0, Number(data.total_vc_minutes) || 0, Number(data.total_disboard_bumps) || 0, Number(data.total_topgg_votes) || 0
        ]).catch((err) => console.error("❌ [TotalStats Save Error]:", err.message));
    };

    client.getQuestNotif = async function(id) {
        if (questNotifCache.has(id)) return questNotifCache.get(id);
        try {
            const res = await db.query('SELECT * FROM quest_notifications WHERE id = $1', [id]);
            const data = fixCase(res.rows[0], defaultQuestNotif);
            if (data) questNotifCache.set(id, data);
            return data;
        } catch(e) { return null; }
    };

    client.setQuestNotif = async function(data) {
        questNotifCache.set(data.id, data);
        const query = `
            INSERT INTO quest_notifications (id, userID, guildID, dailyNotif, weeklyNotif, achievementsNotif, levelNotif, kingsNotif, badgesNotif)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
            userID=EXCLUDED.userID, guildID=EXCLUDED.guildID, dailyNotif=EXCLUDED.dailyNotif, weeklyNotif=EXCLUDED.weeklyNotif, achievementsNotif=EXCLUDED.achievementsNotif, levelNotif=EXCLUDED.levelNotif, kingsNotif=EXCLUDED.kingsNotif, badgesNotif=EXCLUDED.badgesNotif;
        `;
        db.query(query, [
            data.id, data.userID ?? data.userid, data.guildID ?? data.guildid, Number(data.dailyNotif ?? data.dailynotif) || 1, Number(data.weeklyNotif ?? data.weeklynotif) || 1, Number(data.achievementsNotif ?? data.achievementsnotif) || 1, Number(data.levelNotif ?? data.levelnotif) || 1, Number(data.kingsNotif ?? data.kingsnotif) || 1, Number(data.badgesNotif ?? data.badgesnotif) || 1
        ]).catch((err) => console.error("❌ [QuestNotif Save Error]:", err.message));
    };
};
