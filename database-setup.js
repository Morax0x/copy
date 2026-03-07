const defaultMarketItems = require("./json/market-items.json");

async function setupDatabase(db) {
    console.log("[Database] Starting Cloud Integrity Check...");

    const tables = [
        // جدول المستويات - تم التأكد من توافقه مع db-manager.js
        `CREATE TABLE IF NOT EXISTS levels (
            "user" TEXT NOT NULL, 
            guild TEXT NOT NULL, 
            xp BIGINT DEFAULT 0, 
            level BIGINT DEFAULT 1, 
            totalxp BIGINT DEFAULT 0, 
            mora BIGINT DEFAULT 0, 
            lastwork BIGINT DEFAULT 0, 
            lastdaily BIGINT DEFAULT 0, 
            dailystreak BIGINT DEFAULT 0, 
            bank BIGINT DEFAULT 0, 
            lastinterest BIGINT DEFAULT 0, 
            totalinterestearned BIGINT DEFAULT 0, 
            hasguard BIGINT DEFAULT 0, 
            guardexpires BIGINT DEFAULT 0, 
            totalvctime BIGINT DEFAULT 0, 
            lastcollected BIGINT DEFAULT 0, 
            lastrob BIGINT DEFAULT 0, 
            last_rob_pardon TEXT DEFAULT '', 
            lastguess BIGINT DEFAULT 0, 
            lastrps BIGINT DEFAULT 0, 
            lastroulette BIGINT DEFAULT 0, 
            lasttransfer BIGINT DEFAULT 0, 
            lastdeposit BIGINT DEFAULT 0, 
            shop_purchases BIGINT DEFAULT 0, 
            total_meow_count BIGINT DEFAULT 0, 
            boost_count BIGINT DEFAULT 0, 
            lastpvp BIGINT DEFAULT 0, 
            lastfarmyield BIGINT DEFAULT 0, 
            lastfish BIGINT DEFAULT 0, 
            rodlevel BIGINT DEFAULT 1, 
            boatlevel BIGINT DEFAULT 1, 
            currentlocation TEXT DEFAULT 'beach', 
            lastmemory BIGINT DEFAULT 0, 
            lastarrange BIGINT DEFAULT 0, 
            last_dungeon BIGINT DEFAULT 0, 
            dungeon_tickets BIGINT DEFAULT 0, 
            last_ticket_reset TEXT DEFAULT '', 
            dungeon_gate_level BIGINT DEFAULT 1, 
            max_dungeon_floor BIGINT DEFAULT 0, 
            dungeon_wins BIGINT DEFAULT 0, 
            dungeon_join_count BIGINT DEFAULT 0, 
            last_join_reset BIGINT DEFAULT 0, 
            lastrace BIGINT DEFAULT 0, 
            lasttransferdate TEXT DEFAULT '',
            dailytransfercount BIGINT DEFAULT 0,
            PRIMARY KEY ("user", guild)
        )`,
        
        "CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, prefix TEXT DEFAULT '-', voiceXP BIGINT DEFAULT 0, voiceCooldown BIGINT DEFAULT 60000, customXP BIGINT DEFAULT 25, customCooldown BIGINT DEFAULT 60000, levelUpMessage TEXT, lvlUpTitle TEXT, lvlUpDesc TEXT, lvlUpImage TEXT, lvlUpColor TEXT, lvlUpMention BIGINT DEFAULT 1, streakEmoji TEXT DEFAULT '🔥', questChannelID TEXT, treeBotID TEXT, treeChannelID TEXT, treeMessageID TEXT, countingChannelID TEXT, vipRoleID TEXT, casinoChannelID TEXT, casinoChannelID2 TEXT, dropGiveawayChannelID TEXT, dropTitle TEXT, dropDescription TEXT, dropColor TEXT, dropFooter TEXT, dropButtonLabel TEXT, dropButtonEmoji TEXT, dropMessageContent TEXT, lastMediaUpdateSent TEXT, lastMediaUpdateMessageID TEXT, lastMediaUpdateChannelID TEXT, shopChannelID TEXT, bumpChannelID TEXT, customRoleAnchorID TEXT, customRolePanelTitle TEXT, customRolePanelDescription TEXT, customRolePanelImage TEXT, customRolePanelColor TEXT, lastQuestPanelChannelID TEXT, streakTimerChannelID TEXT, dailyTimerChannelID TEXT, weeklyTimerChannelID TEXT, img_level TEXT, img_mora TEXT, img_streak TEXT, img_media_streak TEXT, img_strongest TEXT, img_weekly_xp TEXT, img_daily_xp TEXT, img_achievements TEXT, voiceChannelID TEXT, savedStatusType TEXT, savedStatusText TEXT, marketStatus TEXT DEFAULT 'normal', boostChannelID TEXT, shopLogChannelID TEXT, serverTag TEXT, levelChannel TEXT, modLogChannelID TEXT, bumpNotifyRoleID TEXT, transactionLogChannelID TEXT, guildBoardChannelID TEXT, guildBoardMessageID TEXT, kingsBoardMessageID TEXT, guildAnnounceChannelID TEXT, roleCasinoKing TEXT, roleMerchant TEXT, rolePhilanthropist TEXT, roleAdvisor TEXT, roleAbyss TEXT, roleChatter TEXT, roleKnightSlayer TEXT, roleFisherKing TEXT, rolePvPKing TEXT, roleFarmKing TEXT, roleDailyQuester TEXT, roleWeeklyQuester TEXT, roleRankSS TEXT, roleRankS TEXT, roleRankA TEXT, roleRankB TEXT, roleRankC TEXT, roleRankD TEXT)", 
        "CREATE TABLE IF NOT EXISTS report_settings (guildID TEXT PRIMARY KEY, logChannelID TEXT, reportChannelID TEXT, jailRoleID TEXT, arenaRoleID TEXT, unlimitedRoleID TEXT, testRoleID TEXT)",
        "CREATE TABLE IF NOT EXISTS report_permissions (guildID TEXT NOT NULL, roleID TEXT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS active_reports (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, targetID TEXT NOT NULL, reporterID TEXT NOT NULL, timestamp BIGINT NOT NULL, UNIQUE(guildID, targetID, reporterID))",
        "CREATE TABLE IF NOT EXISTS jailed_members (guildID TEXT NOT NULL, userID TEXT NOT NULL, unjailTime BIGINT NOT NULL, PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS quest_achievement_roles (guildID TEXT NOT NULL, roleID TEXT NOT NULL, achievementID TEXT NOT NULL, PRIMARY KEY (guildID, roleID, achievementID))",
        "CREATE TABLE IF NOT EXISTS race_roles (guildID TEXT NOT NULL, roleID TEXT PRIMARY KEY, raceName TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS role_buffs (guildID TEXT NOT NULL, roleID TEXT NOT NULL, buffPercent BIGINT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS role_mora_buffs (guildID TEXT NOT NULL, roleID TEXT NOT NULL, buffPercent BIGINT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS user_buffs (id BIGSERIAL PRIMARY KEY, guildID TEXT, userID TEXT, buffPercent BIGINT, expiresAt BIGINT, buffType TEXT, multiplier REAL DEFAULT 0.0)",
        "CREATE TABLE IF NOT EXISTS streaks (id TEXT PRIMARY KEY, guildID TEXT, userID TEXT, streakCount BIGINT, lastMessageTimestamp BIGINT, hasGracePeriod BIGINT, hasItemShield BIGINT, nicknameActive BIGINT DEFAULT 1, hasReceivedFreeShield BIGINT DEFAULT 0, separator TEXT DEFAULT '|', dmNotify BIGINT DEFAULT 1, highestStreak BIGINT DEFAULT 0, has12hWarning BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS market_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, currentPrice BIGINT DEFAULT 0, lastChangePercent REAL DEFAULT 0.0, lastChange BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_portfolio (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, itemID TEXT NOT NULL, quantity BIGINT DEFAULT 0, purchasePrice BIGINT DEFAULT 0, FOREIGN KEY (itemID) REFERENCES market_items(id), UNIQUE(guildID, userID, itemID))",
        "CREATE TABLE IF NOT EXISTS user_inventory (id BIGSERIAL PRIMARY KEY, guildID TEXT, userID TEXT, itemID TEXT, quantity BIGINT DEFAULT 0, UNIQUE(guildID, userID, itemID))",
        "CREATE TABLE IF NOT EXISTS dungeon_stats (guildID TEXT, userID TEXT, tickets BIGINT DEFAULT 0, last_reset TEXT DEFAULT '', campfires BIGINT DEFAULT 1, last_campfire_reset TEXT DEFAULT '', PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS user_farm (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, animalID TEXT NOT NULL, quantity BIGINT DEFAULT 1, purchaseTimestamp BIGINT DEFAULT 0, lastCollected BIGINT DEFAULT 0, lastFedTimestamp BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_daily_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, date TEXT NOT NULL, messages BIGINT DEFAULT 0, images BIGINT DEFAULT 0, stickers BIGINT DEFAULT 0, emojis_sent BIGINT DEFAULT 0, reactions_added BIGINT DEFAULT 0, replies_sent BIGINT DEFAULT 0, mentions_received BIGINT DEFAULT 0, vc_minutes BIGINT DEFAULT 0, water_tree BIGINT DEFAULT 0, counting_channel BIGINT DEFAULT 0, meow_count BIGINT DEFAULT 0, streaming_minutes BIGINT DEFAULT 0, disboard_bumps BIGINT DEFAULT 0, boost_channel_reactions BIGINT DEFAULT 0, ai_interactions BIGINT DEFAULT 0, casino_profit BIGINT DEFAULT 0, mora_earned BIGINT DEFAULT 0, mora_donated BIGINT DEFAULT 0, knights_defeated BIGINT DEFAULT 0, fish_caught BIGINT DEFAULT 0, pvp_wins BIGINT DEFAULT 0, crops_harvested BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_achievements (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, achievementID TEXT NOT NULL, timestamp BIGINT NOT NULL, UNIQUE(userID, guildID, achievementID))",
        "CREATE TABLE IF NOT EXISTS user_quest_claims (claimID TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, questID TEXT NOT NULL, dateStr TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS user_weekly_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, weekStartDate TEXT NOT NULL, messages BIGINT DEFAULT 0, images BIGINT DEFAULT 0, stickers BIGINT DEFAULT 0, emojis_sent BIGINT DEFAULT 0, reactions_added BIGINT DEFAULT 0, replies_sent BIGINT DEFAULT 0, mentions_received BIGINT DEFAULT 0, vc_minutes BIGINT DEFAULT 0, water_tree BIGINT DEFAULT 0, counting_channel BIGINT DEFAULT 0, meow_count BIGINT DEFAULT 0, streaming_minutes BIGINT DEFAULT 0, disboard_bumps BIGINT DEFAULT 0, ai_interactions BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_total_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, total_messages BIGINT DEFAULT 0, total_images BIGINT DEFAULT 0, total_stickers BIGINT DEFAULT 0, total_emojis_sent BIGINT DEFAULT 0, total_reactions_added BIGINT DEFAULT 0, total_replies_sent BIGINT DEFAULT 0, total_mentions_received BIGINT DEFAULT 0, total_vc_minutes BIGINT DEFAULT 0, total_disboard_bumps BIGINT DEFAULT 0, total_ai_interactions BIGINT DEFAULT 0, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS quest_notifications (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, dailyNotif BIGINT DEFAULT 1, weeklyNotif BIGINT DEFAULT 1, achievementsNotif BIGINT DEFAULT 1, levelNotif BIGINT DEFAULT 1, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS user_weapons (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, raceName TEXT NOT NULL, weaponLevel BIGINT DEFAULT 1, UNIQUE(userID, guildID, raceName))",
        "CREATE TABLE IF NOT EXISTS user_skills (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, skillID TEXT NOT NULL, skillLevel BIGINT DEFAULT 1, UNIQUE(userID, guildID, skillID))",
        "CREATE TABLE IF NOT EXISTS user_loans (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, loanAmount BIGINT DEFAULT 0, remainingAmount BIGINT DEFAULT 0, dailyPayment BIGINT DEFAULT 0, lastPaymentDate BIGINT DEFAULT 0, missedPayments BIGINT DEFAULT 0, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS active_giveaways (messageID TEXT PRIMARY KEY, guildID TEXT NOT NULL, channelID TEXT NOT NULL, prize TEXT NOT NULL, endsAt BIGINT NOT NULL, winnerCount BIGINT NOT NULL, xpReward BIGINT DEFAULT 0, moraReward BIGINT DEFAULT 0, isFinished BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS giveaway_entries (id BIGSERIAL PRIMARY KEY, giveawayID TEXT NOT NULL, userID TEXT NOT NULL, weight BIGINT NOT NULL, UNIQUE(giveawayID, userID))",
        "CREATE TABLE IF NOT EXISTS media_streaks (id TEXT PRIMARY KEY, guildID TEXT, userID TEXT, streakCount BIGINT DEFAULT 0, lastMediaTimestamp BIGINT DEFAULT 0, hasGracePeriod BIGINT DEFAULT 1, hasItemShield BIGINT DEFAULT 0, hasReceivedFreeShield BIGINT DEFAULT 1, dmNotify BIGINT DEFAULT 1, highestStreak BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS media_streak_channels (guildID TEXT, channelID TEXT, lastReminderMessageID TEXT, PRIMARY KEY (guildID, channelID))",
        "CREATE TABLE IF NOT EXISTS custom_roles (id TEXT PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, roleID TEXT NOT NULL, UNIQUE(guildID, userID))",
        "CREATE TABLE IF NOT EXISTS ai_channels (channelID TEXT PRIMARY KEY, guildID TEXT, isnsfw BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS ai_blacklist (userid TEXT PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS ai_restricted_categories (guildID TEXT, categoryID TEXT PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS ai_paid_channels (channelid TEXT PRIMARY KEY, guildid TEXT, mode TEXT, expiresat BIGINT)",
        "CREATE TABLE IF NOT EXISTS marriages (id BIGSERIAL PRIMARY KEY, userid TEXT, partnerid TEXT, marriagedate BIGINT, guildid TEXT)",
        "CREATE TABLE IF NOT EXISTS children (parentid TEXT, childid TEXT, adoptdate BIGINT, guildid TEXT)",
        "CREATE TABLE IF NOT EXISTS afk (userID TEXT, guildID TEXT, reason TEXT, timestamp BIGINT, mentionsCount BIGINT DEFAULT 0, subscribers TEXT DEFAULT '[]', messages TEXT DEFAULT '[]', PRIMARY KEY (userID, guildID))",
        "CREATE TABLE IF NOT EXISTS user_reputation (userID TEXT, guildID TEXT, rep_points BIGINT DEFAULT 0, last_rep_given BIGINT DEFAULT 0, weekly_reps_given BIGINT DEFAULT 0, PRIMARY KEY (userID, guildID))",
        "CREATE TABLE IF NOT EXISTS active_auctions (messageID TEXT PRIMARY KEY, channelID TEXT, hostID TEXT, item_name TEXT, current_bid BIGINT, highest_bidder TEXT, min_increment BIGINT, end_time BIGINT, image_url TEXT, buy_now_price BIGINT DEFAULT 0)"
    ];

    try {
        await db.query('BEGIN');
        for (const t of tables) {
            await db.query(t);
        }
        await db.query('COMMIT');
        console.log("[Database] ✅ Core tables created successfully.");
    } catch (e) {
        await db.query('ROLLBACK');
        console.error("[Database] ❌ Error in table creation:", e);
    }

    // إدخال عناصر المتجر الافتراضية
    try {
        await db.query('BEGIN');
        for (const item of defaultMarketItems) {
            await db.query(
                "INSERT INTO market_items (id, name, description, currentPrice) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING",
                [item.id, item.name, item.description, item.price]
            );
        }
        await db.query('COMMIT');
        console.log("[Database] ✅ Market items synchronized.");
    } catch (e) {
        await db.query('ROLLBACK');
    }

    console.log("[Database] ✅ All systems ready.");
}

module.exports = { setupDatabase };
