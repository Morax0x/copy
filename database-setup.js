const defaultMarketItems = require("./json/market-items.json");

async function setupDatabase(db) {
    console.log("[Database] Starting Cloud Integrity & Schema Check...");

    // 🔥 جميع الجداول السحابية محدثة لتتوافق مع PostgreSQL 🔥
    const tables = [
        "CREATE TABLE IF NOT EXISTS levels (\"user\" TEXT NOT NULL, guild TEXT NOT NULL, xp BIGINT DEFAULT 0, level BIGINT DEFAULT 1, totalXP BIGINT DEFAULT 0, mora BIGINT DEFAULT 0, lastWork BIGINT DEFAULT 0, lastDaily BIGINT DEFAULT 0, dailyStreak BIGINT DEFAULT 0, bank BIGINT DEFAULT 0, lastInterest BIGINT DEFAULT 0, totalInterestEarned BIGINT DEFAULT 0, hasGuard BIGINT DEFAULT 0, guardExpires BIGINT DEFAULT 0, totalVCTime BIGINT DEFAULT 0, lastCollected BIGINT DEFAULT 0, lastRob BIGINT DEFAULT 0, last_rob_pardon TEXT DEFAULT '', lastGuess BIGINT DEFAULT 0, lastRPS BIGINT DEFAULT 0, lastRoulette BIGINT DEFAULT 0, lastTransfer BIGINT DEFAULT 0, lastDeposit BIGINT DEFAULT 0, shop_purchases BIGINT DEFAULT 0, total_meow_count BIGINT DEFAULT 0, boost_count BIGINT DEFAULT 0, lastPVP BIGINT DEFAULT 0, lastFarmYield BIGINT DEFAULT 0, lastFish BIGINT DEFAULT 0, rodLevel BIGINT DEFAULT 1, boatLevel BIGINT DEFAULT 1, currentLocation TEXT DEFAULT 'beach', lastMemory BIGINT DEFAULT 0, lastArrange BIGINT DEFAULT 0, last_dungeon BIGINT DEFAULT 0, dungeon_tickets BIGINT DEFAULT 0, last_ticket_reset TEXT DEFAULT '', dungeon_gate_level BIGINT DEFAULT 1, max_dungeon_floor BIGINT DEFAULT 0, dungeon_wins BIGINT DEFAULT 0, dungeon_join_count BIGINT DEFAULT 0, last_join_reset BIGINT DEFAULT 0, lastRace BIGINT DEFAULT 0, PRIMARY KEY (\"user\", guild))",
        
        "CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, prefix TEXT DEFAULT '-', voiceXP BIGINT DEFAULT 0, voiceCooldown BIGINT DEFAULT 60000, customXP BIGINT DEFAULT 25, customCooldown BIGINT DEFAULT 60000, levelUpMessage TEXT, lvlUpTitle TEXT, lvlUpDesc TEXT, lvlUpImage TEXT, lvlUpColor TEXT, lvlUpMention BIGINT DEFAULT 1, streakEmoji TEXT DEFAULT '🔥', questChannelID TEXT, treeBotID TEXT, treeChannelID TEXT, treeMessageID TEXT, countingChannelID TEXT, vipRoleID TEXT, casinoChannelID TEXT, casinoChannelID2 TEXT, dropGiveawayChannelID TEXT, dropTitle TEXT, dropDescription TEXT, dropColor TEXT, dropFooter TEXT, dropButtonLabel TEXT, dropButtonEmoji TEXT, dropMessageContent TEXT, lastMediaUpdateSent TEXT, lastMediaUpdateMessageID TEXT, lastMediaUpdateChannelID TEXT, shopChannelID TEXT, bumpChannelID TEXT, customRoleAnchorID TEXT, customRolePanelTitle TEXT, customRolePanelDescription TEXT, customRolePanelImage TEXT, customRolePanelColor TEXT, lastQuestPanelChannelID TEXT, streakTimerChannelID TEXT, dailyTimerChannelID TEXT, weeklyTimerChannelID TEXT, img_level TEXT, img_mora TEXT, img_streak TEXT, img_media_streak TEXT, img_strongest TEXT, img_weekly_xp TEXT, img_daily_xp TEXT, img_achievements TEXT, voiceChannelID TEXT, savedStatusType TEXT, savedStatusText TEXT, marketStatus TEXT DEFAULT 'normal', boostChannelID TEXT, shopLogChannelID TEXT, serverTag TEXT, levelChannel TEXT, modLogChannelID TEXT, bumpNotifyRoleID TEXT, transactionLogChannelID TEXT, guildBoardChannelID TEXT, guildBoardMessageID TEXT, kingsBoardMessageID TEXT, guildAnnounceChannelID TEXT, roleCasinoKing TEXT, roleMerchant TEXT, rolePhilanthropist TEXT, roleAdvisor TEXT, roleAbyss TEXT, roleChatter TEXT, roleKnightSlayer TEXT, roleFisherKing TEXT, rolePvPKing TEXT, roleFarmKing TEXT, roleDailyQuester TEXT, roleWeeklyQuester TEXT, roleRankSS TEXT, roleRankS TEXT, roleRankA TEXT, roleRankB TEXT, roleRankC TEXT, roleRankD TEXT)", 
        
        "CREATE TABLE IF NOT EXISTS report_settings (guildID TEXT PRIMARY KEY, logChannelID TEXT, reportChannelID TEXT, jailRoleID TEXT, arenaRoleID TEXT, unlimitedRoleID TEXT, testRoleID TEXT)",
        "CREATE TABLE IF NOT EXISTS report_permissions (guildID TEXT NOT NULL, roleID TEXT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS active_reports (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, targetID TEXT NOT NULL, reporterID TEXT NOT NULL, timestamp BIGINT NOT NULL, UNIQUE(guildID, targetID, reporterID))",
        "CREATE TABLE IF NOT EXISTS jailed_members (guildID TEXT NOT NULL, userID TEXT NOT NULL, unjailTime BIGINT NOT NULL, PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS quest_achievement_roles (guildID TEXT NOT NULL, roleID TEXT NOT NULL, achievementID TEXT NOT NULL, PRIMARY KEY (guildID, roleID, achievementID))",
        "CREATE TABLE IF NOT EXISTS race_roles (guildID TEXT NOT NULL, roleID TEXT PRIMARY KEY, raceName TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS prefix (serverprefix TEXT, guild TEXT PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS role_buffs (guildID TEXT NOT NULL, roleID TEXT NOT NULL, buffPercent BIGINT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS role_mora_buffs (guildID TEXT NOT NULL, roleID TEXT NOT NULL, buffPercent BIGINT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS user_buffs (id BIGSERIAL PRIMARY KEY, guildID TEXT, userID TEXT, buffPercent BIGINT, expiresAt BIGINT, buffType TEXT, multiplier REAL DEFAULT 0.0)",
        "CREATE TABLE IF NOT EXISTS streaks (id TEXT PRIMARY KEY, guildID TEXT, userID TEXT, streakCount BIGINT, lastMessageTimestamp BIGINT, hasGracePeriod BIGINT, hasItemShield BIGINT, nicknameActive BIGINT DEFAULT 1, hasReceivedFreeShield BIGINT DEFAULT 0, separator TEXT DEFAULT '|', dmNotify BIGINT DEFAULT 1, highestStreak BIGINT DEFAULT 0, has12hWarning BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS rankCardTable (id TEXT PRIMARY KEY, barColor TEXT, textColor TEXT, backgroundColor TEXT)",
        "CREATE TABLE IF NOT EXISTS market_items (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, currentPrice BIGINT DEFAULT 0, lastChangePercent REAL DEFAULT 0.0, lastChange BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_portfolio (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, itemID TEXT NOT NULL, quantity BIGINT DEFAULT 0, purchasePrice BIGINT DEFAULT 0, FOREIGN KEY (itemID) REFERENCES market_items(id), UNIQUE(guildID, userID, itemID))",
        "CREATE TABLE IF NOT EXISTS user_inventory (id BIGSERIAL PRIMARY KEY, guildID TEXT, userID TEXT, itemID TEXT, quantity BIGINT DEFAULT 0, UNIQUE(guildID, userID, itemID))",
        "CREATE TABLE IF NOT EXISTS dungeon_stats (guildID TEXT, userID TEXT, tickets BIGINT DEFAULT 0, last_reset TEXT DEFAULT '', campfires BIGINT DEFAULT 1, last_campfire_reset TEXT DEFAULT '', PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS blacklistTable (id TEXT PRIMARY KEY, guild TEXT, typeId TEXT, type TEXT)",
        "CREATE TABLE IF NOT EXISTS channel (guild TEXT PRIMARY KEY, channel TEXT)",
        "CREATE TABLE IF NOT EXISTS user_farm (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, animalID TEXT NOT NULL, quantity BIGINT DEFAULT 1, purchaseTimestamp BIGINT DEFAULT 0, lastCollected BIGINT DEFAULT 0, lastFedTimestamp BIGINT DEFAULT 0)",
        "CREATE INDEX IF NOT EXISTS idx_user_farm_lookup ON user_farm (guildID, userID)",
        
        // 🔥 تم إضافة جدول user_lands المفقود لحل المشكلة 🔥
        "CREATE TABLE IF NOT EXISTS user_lands (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, landType TEXT NOT NULL, quantity BIGINT DEFAULT 1, purchaseTimestamp BIGINT DEFAULT 0, lastHarvested BIGINT DEFAULT 0, UNIQUE(guildID, userID, landType))",
        
        "CREATE TABLE IF NOT EXISTS user_daily_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, date TEXT NOT NULL, messages BIGINT DEFAULT 0, images BIGINT DEFAULT 0, stickers BIGINT DEFAULT 0, emojis_sent BIGINT DEFAULT 0, reactions_added BIGINT DEFAULT 0, replies_sent BIGINT DEFAULT 0, mentions_received BIGINT DEFAULT 0, vc_minutes BIGINT DEFAULT 0, water_tree BIGINT DEFAULT 0, counting_channel BIGINT DEFAULT 0, meow_count BIGINT DEFAULT 0, streaming_minutes BIGINT DEFAULT 0, disboard_bumps BIGINT DEFAULT 0, boost_channel_reactions BIGINT DEFAULT 0, ai_interactions BIGINT DEFAULT 0, casino_profit BIGINT DEFAULT 0, mora_earned BIGINT DEFAULT 0, mora_donated BIGINT DEFAULT 0, knights_defeated BIGINT DEFAULT 0, fish_caught BIGINT DEFAULT 0, pvp_wins BIGINT DEFAULT 0, crops_harvested BIGINT DEFAULT 0)",
        
        "CREATE TABLE IF NOT EXISTS user_achievements (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, achievementID TEXT NOT NULL, timestamp BIGINT NOT NULL, UNIQUE(userID, guildID, achievementID))",
        "CREATE TABLE IF NOT EXISTS user_quest_claims (claimID TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, questID TEXT NOT NULL, dateStr TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS user_weekly_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, weekStartDate TEXT NOT NULL, messages BIGINT DEFAULT 0, images BIGINT DEFAULT 0, stickers BIGINT DEFAULT 0, emojis_sent BIGINT DEFAULT 0, reactions_added BIGINT DEFAULT 0, replies_sent BIGINT DEFAULT 0, mentions_received BIGINT DEFAULT 0, vc_minutes BIGINT DEFAULT 0, water_tree BIGINT DEFAULT 0, counting_channel BIGINT DEFAULT 0, meow_count BIGINT DEFAULT 0, streaming_minutes BIGINT DEFAULT 0, disboard_bumps BIGINT DEFAULT 0, ai_interactions BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS user_total_stats (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, total_messages BIGINT DEFAULT 0, total_images BIGINT DEFAULT 0, total_stickers BIGINT DEFAULT 0, total_emojis_sent BIGINT DEFAULT 0, total_reactions_added BIGINT DEFAULT 0, total_replies_sent BIGINT DEFAULT 0, total_mentions_received BIGINT DEFAULT 0, total_vc_minutes BIGINT DEFAULT 0, total_disboard_bumps BIGINT DEFAULT 0, total_ai_interactions BIGINT DEFAULT 0, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS quest_notifications (id TEXT PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, dailyNotif BIGINT DEFAULT 1, weeklyNotif BIGINT DEFAULT 1, achievementsNotif BIGINT DEFAULT 1, levelNotif BIGINT DEFAULT 1, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS user_weapons (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, raceName TEXT NOT NULL, weaponLevel BIGINT DEFAULT 1, UNIQUE(userID, guildID, raceName))",
        "CREATE TABLE IF NOT EXISTS user_skills (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, skillID TEXT NOT NULL, skillLevel BIGINT DEFAULT 1, UNIQUE(userID, guildID, skillID))",
        "CREATE TABLE IF NOT EXISTS temporary_roles (userID TEXT NOT NULL, guildID TEXT NOT NULL, roleID TEXT NOT NULL, expiresAt BIGINT DEFAULT 0, PRIMARY KEY (userID, guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS command_shortcuts (guildID TEXT NOT NULL, channelID TEXT NOT NULL, shortcutWord TEXT NOT NULL, commandName TEXT NOT NULL, PRIMARY KEY (guildID, channelID, shortcutWord))",
        "CREATE TABLE IF NOT EXISTS command_permissions (guildID TEXT NOT NULL, channelID TEXT NOT NULL, commandName TEXT NOT NULL, PRIMARY KEY (guildID, channelID, commandName))",
        "CREATE TABLE IF NOT EXISTS user_loans (id BIGSERIAL PRIMARY KEY, userID TEXT NOT NULL, guildID TEXT NOT NULL, loanAmount BIGINT DEFAULT 0, remainingAmount BIGINT DEFAULT 0, dailyPayment BIGINT DEFAULT 0, lastPaymentDate BIGINT DEFAULT 0, missedPayments BIGINT DEFAULT 0, UNIQUE(userID, guildID))",
        "CREATE TABLE IF NOT EXISTS giveaway_weights (guildID TEXT NOT NULL, roleID TEXT NOT NULL, weight BIGINT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS active_giveaways (messageID TEXT PRIMARY KEY, guildID TEXT NOT NULL, channelID TEXT NOT NULL, prize TEXT NOT NULL, endsAt BIGINT NOT NULL, winnerCount BIGINT NOT NULL, xpReward BIGINT DEFAULT 0, moraReward BIGINT DEFAULT 0, isFinished BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS giveaway_entries (id BIGSERIAL PRIMARY KEY, giveawayID TEXT NOT NULL, userID TEXT NOT NULL, weight BIGINT NOT NULL, UNIQUE(giveawayID, userID))",
        "CREATE TABLE IF NOT EXISTS media_streaks (id TEXT PRIMARY KEY, guildID TEXT, userID TEXT, streakCount BIGINT DEFAULT 0, lastMediaTimestamp BIGINT DEFAULT 0, hasGracePeriod BIGINT DEFAULT 1, hasItemShield BIGINT DEFAULT 0, hasReceivedFreeShield BIGINT DEFAULT 1, dmNotify BIGINT DEFAULT 1, highestStreak BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS media_streak_channels (guildID TEXT, channelID TEXT, lastReminderMessageID TEXT, PRIMARY KEY (guildID, channelID))",
        "CREATE TABLE IF NOT EXISTS level_roles (guildID TEXT NOT NULL, level BIGINT NOT NULL, roleID TEXT NOT NULL, PRIMARY KEY (guildID, level))",
        "CREATE TABLE IF NOT EXISTS custom_roles (id TEXT PRIMARY KEY, guildID TEXT NOT NULL, userID TEXT NOT NULL, roleID TEXT NOT NULL, UNIQUE(guildID, userID))",
        "CREATE TABLE IF NOT EXISTS custom_role_permissions (guildID TEXT NOT NULL, roleID TEXT NOT NULL, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS role_menus_master (message_id TEXT PRIMARY KEY, custom_id TEXT UNIQUE NOT NULL, is_locked BOOLEAN NOT NULL DEFAULT FALSE)",
        "CREATE TABLE IF NOT EXISTS role_settings (role_id TEXT PRIMARY KEY, anti_roles TEXT, is_removable BOOLEAN NOT NULL DEFAULT TRUE)",
        "CREATE TABLE IF NOT EXISTS role_menu_items (message_id TEXT NOT NULL, value TEXT NOT NULL, role_id TEXT NOT NULL, description TEXT, emoji TEXT, PRIMARY KEY (message_id, value))",
        "CREATE TABLE IF NOT EXISTS rainbow_roles (roleID TEXT PRIMARY KEY, guildID TEXT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS auto_responses (id BIGSERIAL PRIMARY KEY, guildID TEXT NOT NULL, trigger TEXT NOT NULL, response TEXT NOT NULL, images TEXT, matchType TEXT DEFAULT 'exact', cooldown BIGINT DEFAULT 0, allowedChannels TEXT, ignoredChannels TEXT, createdBy TEXT, expiresAt BIGINT, UNIQUE(guildID, trigger))",
        "CREATE TABLE IF NOT EXISTS world_boss (guildID TEXT PRIMARY KEY, currentHP BIGINT, maxHP BIGINT, name TEXT, image TEXT, active BIGINT DEFAULT 0, messageID TEXT, channelID TEXT, lastLog TEXT DEFAULT '[]', totalHits BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS boss_cooldowns (guildID TEXT, userID TEXT, lastHit BIGINT, PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS user_coupons (id BIGSERIAL PRIMARY KEY, guildID TEXT, userID TEXT, discountPercent BIGINT, isUsed BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS boss_leaderboard (guildID TEXT, userID TEXT, totalDamage BIGINT DEFAULT 0, PRIMARY KEY(guildID, userID))",
        "CREATE TABLE IF NOT EXISTS role_coupons_config (guildID TEXT, roleID TEXT, discountPercent BIGINT, PRIMARY KEY (guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS user_role_coupon_usage (guildID TEXT, userID TEXT, lastUsedTimestamp BIGINT, PRIMARY KEY (guildID, userID))",
        "CREATE TABLE IF NOT EXISTS mod_cases (id TEXT PRIMARY KEY, guildID TEXT, caseID BIGINT, type TEXT, targetID TEXT, moderatorID TEXT, reason TEXT, timestamp BIGINT)",
        "CREATE TABLE IF NOT EXISTS active_dungeons (channelID TEXT PRIMARY KEY, guildID TEXT, hostID TEXT, data TEXT)",
        
        // --- 🔥 جداول الذكاء الاصطناعي 🔥 ---
        "CREATE TABLE IF NOT EXISTS ai_channels (channelID TEXT PRIMARY KEY, guildID TEXT, isNsfw BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS ai_blacklist (userID TEXT PRIMARY KEY)",
        "CREATE TABLE IF NOT EXISTS ai_role_limits (guildID TEXT, roleID TEXT, limitCount BIGINT, PRIMARY KEY(guildID, roleID))",
        "CREATE TABLE IF NOT EXISTS ai_user_usage (userID TEXT PRIMARY KEY, guildID TEXT, dailyUsage BIGINT DEFAULT 0, purchasedBalance BIGINT DEFAULT 0, lastResetDate TEXT)",
        "CREATE TABLE IF NOT EXISTS ai_restricted_categories (guildID TEXT, categoryID TEXT, PRIMARY KEY (categoryID))",
        "CREATE TABLE IF NOT EXISTS ai_paid_channels (channelID TEXT, guildID TEXT, mode TEXT, expiresAt BIGINT, PRIMARY KEY (channelID))",

        // --- 🔥 جداول نظام العائلة 🔥 ---
        "CREATE TABLE IF NOT EXISTS family_config (guildID TEXT PRIMARY KEY, maleRole TEXT, femaleRole TEXT, divorceFee BIGINT DEFAULT 5000, adoptFee BIGINT DEFAULT 2000)",
        "CREATE TABLE IF NOT EXISTS marriages (id BIGSERIAL PRIMARY KEY, userID TEXT, partnerID TEXT, marriageDate BIGINT, guildID TEXT)",
        "CREATE TABLE IF NOT EXISTS children (parentID TEXT, childID TEXT, adoptDate BIGINT, guildID TEXT)",

        // --- 🔥 جدول نظام الـ AFK المطور 🔥 ---
        "CREATE TABLE IF NOT EXISTS afk (userID TEXT, guildID TEXT, reason TEXT, timestamp BIGINT, mentionsCount BIGINT DEFAULT 0, subscribers TEXT DEFAULT '[]', messages TEXT DEFAULT '[]', PRIMARY KEY (userID, guildID))",

        // --- 🔥 جداول نظام السمعة (Reputation) 🔥 ---
        "CREATE TABLE IF NOT EXISTS user_reputation (userID TEXT, guildID TEXT, rep_points BIGINT DEFAULT 0, last_rep_given BIGINT DEFAULT 0, weekly_reps_given BIGINT DEFAULT 0, PRIMARY KEY (userID, guildID))",

        // --- جداول أخرى ---
        "CREATE TABLE IF NOT EXISTS race_dungeon_buffs (guildID TEXT, roleID TEXT, dungeonKey TEXT, statType TEXT, buffValue REAL, PRIMARY KEY (guildID, roleID, dungeonKey))",
        "CREATE TABLE IF NOT EXISTS active_auctions (messageID TEXT PRIMARY KEY, channelID TEXT, hostID TEXT, item_name TEXT, current_bid BIGINT, highest_bidder TEXT, min_increment BIGINT, end_time BIGINT, image_url TEXT, buy_now_price BIGINT DEFAULT 0)",
        "CREATE TABLE IF NOT EXISTS dungeon_saves (hostID TEXT, guildID TEXT, floor BIGINT, timestamp BIGINT, PRIMARY KEY (hostID, guildID))",
        "CREATE TABLE IF NOT EXISTS role_campfire_limits (guildID TEXT, roleID TEXT, limitCount BIGINT, PRIMARY KEY (guildID, roleID))"
    ];

    try {
        await db.query('BEGIN');
        for (const t of tables) {
            await db.query(t);
        }
        await db.query('COMMIT');
    } catch (e) {
        await db.query('ROLLBACK');
        console.error("[Database] ❌ Error in table creation:", e);
    }

    await db.query("DROP TABLE IF EXISTS command_channels").catch(() => {});

    async function ensureColumn(table, column, typeDef) {
        try {
            let pgTypeDef = typeDef.replace(/INTEGER/g, 'BIGINT');
            let safeColumn = column.toLowerCase() === 'user' ? '"user"' : column;
            await db.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${safeColumn} ${pgTypeDef}`);
        } catch (e) { }
    }

    await ensureColumn('levels', 'id', 'TEXT UNIQUE'); 

    const levelsCols = ['mora', 'lastWork', 'lastDaily', 'dailyStreak', 'bank', 'lastInterest', 'totalInterestEarned', 'hasGuard', 'guardExpires', 'lastCollected', 'totalVCTime', 'lastRob', 'lastGuess', 'lastRPS', 'lastRoulette', 'lastTransfer', 'lastDeposit', 'shop_purchases', 'total_meow_count', 'boost_count', 'lastPVP', 'lastFarmYield', 'lastFish', 'rodLevel', 'boatLevel', 'lastMemory', 'lastArrange', 'last_dungeon', 'lastRace'];
    for (const col of levelsCols) {
        await ensureColumn('levels', col, 'BIGINT DEFAULT 0');
    }
      
    await ensureColumn('levels', 'dungeon_tickets', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'last_ticket_reset', "TEXT DEFAULT ''");
    await ensureColumn('levels', 'last_rob_pardon', "TEXT DEFAULT ''");
    await ensureColumn('levels', 'currentLocation', "TEXT DEFAULT 'beach'");

    // 🔥 حل مشكلة أمر مستويات الأعضاء والتحويل
    await ensureColumn('levels', 'lastTransferDate', "TEXT DEFAULT ''");
    await ensureColumn('levels', 'dailyTransferCount', 'BIGINT DEFAULT 0');

    await ensureColumn('levels', 'dungeon_gate_level', 'BIGINT DEFAULT 1');
    await ensureColumn('levels', 'max_dungeon_floor', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'dungeon_wins', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'dungeon_join_count', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'last_join_reset', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'last_dungeon', 'BIGINT DEFAULT 0'); 
    await ensureColumn('levels', 'lastRace', 'BIGINT DEFAULT 0');
    await ensureColumn('levels', 'lastdungeon', 'BIGINT DEFAULT 0'); // 🔥 العمود المفقود 1

    // 🔥 حل مشكلة الإحصائيات والتصويت والأوسمة
    const dailyCols = ['water_tree', 'counting_channel', 'meow_count', 'streaming_minutes', 'disboard_bumps', 'emojis_sent', 'boost_channel_reactions', 'casino_profit', 'mora_earned', 'mora_donated', 'knights_defeated', 'fish_caught', 'pvp_wins', 'crops_harvested', 'topgg_votes', 'main_chat_messages', 'chatter_badge_given', 'daily_badge_given', 'knight_badge_given'];
    for (const col of dailyCols) {
        await ensureColumn('user_daily_stats', col, 'BIGINT DEFAULT 0'); // 🔥 تم دمج الأعمدة المفقودة 2-5
    }
    
    await ensureColumn('user_weekly_stats', 'emojis_sent', 'BIGINT DEFAULT 0');
    await ensureColumn('user_weekly_stats', 'topgg_votes', 'BIGINT DEFAULT 0'); 
    await ensureColumn('user_weekly_stats', 'weekly_badge_given', 'BIGINT DEFAULT 0'); // 🔥 العمود المفقود 6
      
    await ensureColumn('user_total_stats', 'total_vc_minutes', 'BIGINT DEFAULT 0');
    await ensureColumn('user_total_stats', 'total_disboard_bumps', 'BIGINT DEFAULT 0');
    await ensureColumn('user_total_stats', 'total_emojis_sent', 'BIGINT DEFAULT 0');
    await ensureColumn('user_total_stats', 'total_topgg_votes', 'BIGINT DEFAULT 0'); 

    await ensureColumn('user_daily_stats', 'ai_interactions', 'BIGINT DEFAULT 0');
    await ensureColumn('user_weekly_stats', 'ai_interactions', 'BIGINT DEFAULT 0');
    await ensureColumn('user_total_stats', 'total_ai_interactions', 'BIGINT DEFAULT 0');

    await ensureColumn('user_buffs', 'buffType', 'TEXT');
    await ensureColumn('user_buffs', 'multiplier', 'REAL DEFAULT 0.0');
    await ensureColumn('streaks', 'hasReceivedFreeShield', 'BIGINT DEFAULT 0');
    await ensureColumn('streaks', 'separator', "TEXT DEFAULT '|'");
    await ensureColumn('streaks', 'dmNotify', 'BIGINT DEFAULT 1');
    await ensureColumn('streaks', 'highestStreak', 'BIGINT DEFAULT 0');
    await ensureColumn('streaks', 'has12hWarning', 'BIGINT DEFAULT 0');
      
    const settingsCols = [
        "questChannelID", "treeBotID", "treeChannelID", "treeMessageID", "countingChannelID", "vipRoleID", 
        "casinoChannelID", "casinoChannelID2", "dropGiveawayChannelID", "dropTitle", "dropDescription", 
        "dropColor", "dropFooter", "dropButtonLabel", "dropButtonEmoji", "dropMessageContent", 
        "lastMediaUpdateSent", "lastMediaUpdateMessageID", "lastMediaUpdateChannelID", "shopChannelID", 
        "bumpChannelID", "customRoleAnchorID", "customRolePanelTitle", "customRolePanelDescription", 
        "customRolePanelImage", "customRolePanelColor", "lastQuestPanelChannelID", "streakTimerChannelID", 
        "dailyTimerChannelID", "weeklyTimerChannelID", "img_level", "img_mora", "img_streak", "img_media_streak", 
        "img_strongest", "img_weekly_xp", "img_daily_xp", "img_achievements", "voiceChannelID", "savedStatusType", 
        "savedStatusText", "marketStatus", "boostChannelID", "shopLogChannelID", "serverTag", "levelChannel", 
        "modLogChannelID", "bumpNotifyRoleID", "transactionLogChannelID",
        "guildBoardChannelID", "guildBoardMessageID", "kingsBoardMessageID", "guildAnnounceChannelID", 
        "roleCasinoKing", "roleMerchant", "rolePhilanthropist", "roleAdvisor", "roleAbyss", 
        "roleChatter", "roleKnightSlayer", "roleFisherKing", "rolePvPKing", "roleFarmKing",
        "roleDailyQuester", "roleWeeklyQuester",
        "roleRankSS", "roleRankS", "roleRankA", "roleRankB", "roleRankC", "roleRankD",
        "chatchannelid", "lastbumperid", "chatterchannelid", "rolechatterbadge", "roledailybadge", "roleweeklybadge" // 🔥 الأعمدة المفقودة 7-12
    ]; 
    for (const col of settingsCols) {
        await ensureColumn('settings', col, 'TEXT');
    }
    await ensureColumn('settings', 'prefix', "TEXT DEFAULT '-'");
    await ensureColumn('settings', 'nextbumptime', 'BIGINT DEFAULT 0'); // 🔥 العمود المفقود 13

    await ensureColumn('marriages', 'partnerID', 'TEXT');
    await ensureColumn('marriages', 'userID', 'TEXT');
    await ensureColumn('marriages', 'guildID', 'TEXT');
    await ensureColumn('marriages', 'marriageDate', 'BIGINT');
    await ensureColumn('marriages', 'dowry', 'BIGINT DEFAULT 0'); // 🔥 العمود المفقود 14

    await ensureColumn('children', 'parentID', 'TEXT');
    await ensureColumn('children', 'childID', 'TEXT');
    await ensureColumn('children', 'guildID', 'TEXT');
    await ensureColumn('children', 'adoptDate', 'BIGINT');

    await ensureColumn('family_config', 'maleRole', 'TEXT');
    await ensureColumn('family_config', 'femaleRole', 'TEXT');
    await ensureColumn('family_config', 'divorceFee', 'BIGINT DEFAULT 5000');
    await ensureColumn('family_config', 'adoptFee', 'BIGINT DEFAULT 2000');

    await ensureColumn('afk', 'mentionsCount', 'BIGINT DEFAULT 0');
    await ensureColumn('afk', 'subscribers', "TEXT DEFAULT '[]'");
    await ensureColumn('afk', 'messages', "TEXT DEFAULT '[]'");

    await ensureColumn('dungeon_stats', 'campfires', 'BIGINT DEFAULT 1');
    await ensureColumn('dungeon_stats', 'last_campfire_reset', "TEXT DEFAULT ''");

    await ensureColumn('user_portfolio', 'purchasePrice', 'BIGINT DEFAULT 0');
    await ensureColumn('user_farm', 'quantity', 'BIGINT DEFAULT 1');
    await ensureColumn('user_farm', 'lastFedTimestamp', `BIGINT DEFAULT ${Date.now()}`); 
    await ensureColumn('quest_notifications', 'levelNotif', 'BIGINT DEFAULT 1');
    await ensureColumn('quest_notifications', 'kingsnotif', 'BIGINT DEFAULT 1'); 
    await ensureColumn('quest_notifications', 'badgesnotif', 'BIGINT DEFAULT 1'); 
    await ensureColumn('active_giveaways', 'xpReward', 'BIGINT DEFAULT 0');
    await ensureColumn('active_giveaways', 'moraReward', 'BIGINT DEFAULT 0');
    await ensureColumn('active_giveaways', 'isFinished', 'BIGINT DEFAULT 0');
    await ensureColumn('media_streak_channels', 'lastReminderMessageID', 'TEXT');
    await ensureColumn('user_reputation', 'daily_reps_given', 'BIGINT DEFAULT 0'); // 🔥 العمود المفقود 15

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
        console.log("[Database] ⚠️ Error syncing market items:", e.message);
    }

    console.log("[Database] ✅ All tables checked, updated, and ready.");
}

module.exports = {
    setupDatabase
};
