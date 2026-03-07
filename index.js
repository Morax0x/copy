const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionsBitField, Events, Colors, MessageFlags, ChannelType, REST, Routes, Partials, AttachmentBuilder } = require("discord.js");
const db = require('./database.js');
const fs = require('fs');
const path = require('path');

const Topgg = require('@top-gg/sdk');
const express = require('express');

const aiConfig = require('./utils/aiConfig');

const MAIN_GUILD_ID = "952732360074494003"; 

try {
    const dbSetupModule = require("./database-setup.js");
    const setupDatabase = dbSetupModule.setupDatabase || dbSetupModule;

    if (typeof setupDatabase !== 'function') {
        throw new Error("Missing setupDatabase function in database-setup.js");
    }

    setupDatabase(db);

    if (aiConfig && typeof aiConfig.init === 'function') {
        aiConfig.init();
    }

} catch (err) {
    console.error("!!! Database Setup Fatal Error !!!");
    console.error(err);
    process.exit(1);
}

try {
    const { registerFont } = require('canvas');
    const beinPath = path.join(__dirname, 'fonts', 'bein-ar-normal.ttf');
      
    if (fs.existsSync(beinPath)) {
        registerFont(beinPath, { family: 'Bein' });
    } else {
        const beinPathAlt = path.join(__dirname, 'fonts', 'Bein-Normal.ttf');
        if (fs.existsSync(beinPathAlt)) {
            registerFont(beinPathAlt, { family: 'Bein' });
        } 
    }

    const emojiPath = path.join(__dirname, 'efonts', 'NotoEmoji.ttf');
    if (fs.existsSync(emojiPath)) {
        registerFont(emojiPath, { family: 'NotoEmoji' });
    }
} catch (e) {
}

const { handleStreakMessage, calculateBuffMultiplier, checkDailyStreaks, updateNickname, calculateMoraBuff, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("./streak-handler.js");
const { checkPermissions, checkCooldown } = require("./permission-handler.js");
const { checkLoanPayments } = require('./handlers/loan-handler.js'); 
const questsConfig = require('./json/quests-config.json');
const farmAnimals = require('./json/farm-animals.json');

const { generateQuestAlert } = require('./generators/achievement-generator.js'); 
const { generateAchievementCard } = require('./generators/achievement-card-generator.js'); 

const { createRandomDropGiveaway, endGiveaway, getUserWeight, initGiveaways } = require('./handlers/giveaway-handler.js');
const { checkUnjailTask } = require('./handlers/report-handler.js'); 
const { loadRoleSettings } = require('./handlers/reaction-role-handler.js');

const { handleShopInteractions } = require('./handlers/shop-handler.js'); 
const { checkFarmIncome } = require('./handlers/farm-handler.js');
const autoJoin = require('./handlers/auto-join.js'); 
const handleMarketCrash = require('./handlers/market-crash-handler.js');

const { startAuctionSystem } = require('./handlers/auction-handler.js');
const { autoUpdateKingsBoard, rewardDailyKings } = require('./handlers/guild-board-handler.js'); 

const { startAutoChat } = require('./handlers/ai/auto-chat.js');

const announcementsTexts = require('./json/announcements-texts.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction] 
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.talkedRecently = new Map();
const voiceXPCooldowns = new Map();
client.recentMessageTimestamps = new Collection(); 
const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 
const botToken = process.env.DISCORD_BOT_TOKEN;

client.EMOJI_MORA = '<:mora:1435647151349698621>';
client.EMOJI_STAR = '⭐';
client.EMOJI_WI = '<a:wi:1435572304988868769>';
client.EMOJI_WII = '<a:wii:1435572329039007889>';
client.EMOJI_FASTER = '<a:JaFaster:1435572430042042409>';
client.EMOJI_PRAY = '<:0Pray:1437067281493524502>';
client.EMOJI_COOL = '<a:NekoCool:1435572459276337245>';
const EMOJI_XP_ANIM = '<a:levelup:1437805366048985290>';

client.sql = db;
client.generateQuestAlert = generateQuestAlert;
client.generateAchievementCard = generateAchievementCard; 

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
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23,
                $24, $25, $26, $27, $28, $29, $30,
                $31, $32, $33, $34, $35, $36, $37,
                $38, $39, $40
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

client.defaultData = { 
    user: null, guild: null, xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, 
    lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, 
    lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, 
    total_meow_count: 0, boost_count: 0, lastPVP: 0, lastFarmYield: 0,
    lastFish: 0, rodLevel: 1, boatLevel: 1, currentLocation: 'beach',
    lastMemory: 0, lastArrange: 0,
    last_dungeon: 0, dungeon_gate_level: 1, max_dungeon_floor: 0, dungeon_wins: 0,
    lastRace: 0,
    lastTransferDate: '',
    dailyTransferCount: 0 
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

try { require('./handlers/backup-scheduler.js')(client, db); } catch(e) {}

const defaultDailyStats = { messages: 0, images: 0, stickers: 0, emojis_sent: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0, boost_channel_reactions: 0, topgg_votes: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_emojis_sent: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0, total_topgg_votes: 0 };

client.safeMerge = function(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined) result[key] = defaults[key];
    }
    return result;
};

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

async function updateMarketPrices() {
    try {
        if (!client.marketLocks) client.marketLocks = new Set();
        const res = await db.query("SELECT * FROM market_items");
        const allItems = res.rows;
        if (allItems.length === 0) return;

        await db.query('BEGIN');
        const CRASH_PRICE = 10; 

        for (const item of allItems) {
            if (client.marketLocks.has(item.id)) continue;

            const resOwned = await db.query("SELECT SUM(quantity) as total FROM user_portfolio WHERE itemID = $1", [item.id]);
            const totalOwned = resOwned.rows[0].total || 0;

            let randomPercent = (Math.random() * 0.20) - 0.10;
            const saturationPenalty = (totalOwned / 2000) * 0.02;
            let finalChangePercent = randomPercent - saturationPenalty;

            const oldPrice = item.currentprice || item.currentPrice;
            if (oldPrice > 5000 && finalChangePercent > 0) finalChangePercent /= 2;
            if (finalChangePercent < -0.30) finalChangePercent = -0.30;

            let newPrice = Math.floor(oldPrice * (1 + finalChangePercent));

            if (newPrice <= CRASH_PRICE) {
                setTimeout(() => handleMarketCrash(client, db, item), 0); 
                continue; 
            }
            
            if (newPrice > 50000) newPrice = 50000;

            const changeAmount = newPrice - oldPrice;
            const displayPercent = oldPrice > 0 ? ((changeAmount / oldPrice) * 100).toFixed(2) : 0;
            
            await db.query(`UPDATE market_items SET currentPrice = $1, lastChangePercent = $2, lastChange = $3 WHERE id = $4`, [newPrice, displayPercent, changeAmount, item.id]);
        }
        await db.query('COMMIT');
    } catch (err) {
        await db.query('ROLLBACK');
    }
}

async function checkTemporaryRoles(client) {
    const now = Date.now();
    try {
        const expiredRoles = (await db.query("SELECT * FROM temporary_roles WHERE expiresAt <= $1", [now])).rows;
        if (expiredRoles.length === 0) return;

        await db.query('BEGIN');
        for (const record of expiredRoles) {
            await db.query("DELETE FROM temporary_roles WHERE userID = $1 AND guildID = $2 AND roleID = $3", [record.userid || record.userID, record.guildid || record.guildID, record.roleid || record.roleID]);
        }
        await db.query('COMMIT');

        for (const record of expiredRoles) {
            const guild = client.guilds.cache.get(record.guildid || record.guildID);
            if (!guild) continue;
            const member = await guild.members.fetch(record.userid || record.userID).catch(() => null);
            const role = guild.roles.cache.get(record.roleid || record.roleID);
            if (member && role) {
                member.roles.remove(role).catch(() => {});
            }
        }
    } catch (err) {
        await db.query('ROLLBACK');
    }
}

const calculateInterest = async () => {
    const now = Date.now();
    const INTEREST_RATE = 0.0005; 
    const COOLDOWN = 24 * 60 * 60 * 1000; 
    const INACTIVITY_LIMIT = 7 * 24 * 60 * 60 * 1000; 
    
    try {
        const allUsers = (await db.query("SELECT * FROM levels WHERE bank > 0")).rows;
        
        await db.query('BEGIN');
        for (const user of allUsers) {
            const lastInterest = user.lastinterest || user.lastInterest || 0;
            const lastDaily = user.lastdaily || user.lastDaily || 0;
            const lastWork = user.lastwork || user.lastWork || 0;

            if ((now - lastInterest) >= COOLDOWN) {
                const timeSinceDaily = now - lastDaily;
                const timeSinceWork = now - lastWork;
                
                if (timeSinceDaily > INACTIVITY_LIMIT && timeSinceWork > INACTIVITY_LIMIT) {
                    await db.query('UPDATE levels SET lastInterest = $1 WHERE "user" = $2 AND guild = $3', [now, user.user, user.guild]);
                } else {
                    const interestAmount = Math.floor(user.bank * INTEREST_RATE);
                    if (interestAmount > 0) {
                        await db.query('UPDATE levels SET bank = bank + $1, lastInterest = $2, totalInterestEarned = totalInterestEarned + $3 WHERE "user" = $4 AND guild = $5', [interestAmount, now, interestAmount, user.user, user.guild]);
                    } else {
                        await db.query('UPDATE levels SET lastInterest = $1 WHERE "user" = $2 AND guild = $3', [now, user.user, user.guild]);
                    }
                }
            }
        }
        await db.query('COMMIT');
    } catch (err) {
        await db.query('ROLLBACK');
    }
};

client.checkAndAwardLevelRoles = async function(member, newLevel) {
    try {
        const guild = member.guild;
        const botMember = guild.members.me;

        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return;
        }

        const allLevelRolesConfig = (await db.query("SELECT level, roleID FROM level_roles WHERE guildID = $1 ORDER BY level DESC", [guild.id])).rows;
        
        if (allLevelRolesConfig.length === 0) return;

        member = await member.fetch().catch(() => null);
        if (!member) return;

        let targetRoleID = null;
        for (const row of allLevelRolesConfig) {
            if (newLevel >= row.level) {
                targetRoleID = row.roleid || row.roleID;
                break; 
            }
        }

        let roleToAdd = null;
        const rolesToRemove = [];

        for (const row of allLevelRolesConfig) {
            const rowRoleID = row.roleid || row.roleID;
            const role = guild.roles.cache.get(rowRoleID);
            
            if (!role) continue;

            if (role.position >= botMember.roles.highest.position) {
                continue; 
            }

            if (targetRoleID && rowRoleID === targetRoleID) {
                if (!member.roles.cache.has(role.id)) {
                    roleToAdd = role;
                }
            } else {
                if (member.roles.cache.has(role.id)) {
                    rolesToRemove.push(role);
                }
            }
        }

        if (rolesToRemove.length > 0) {
            await member.roles.remove(rolesToRemove).catch(()=>{});
        }

        if (roleToAdd) {
            await member.roles.add(roleToAdd).catch(()=>{});
        }

    } catch (err) {}
}

client.sendLevelUpMessage = async function(messageOrInteraction, member, newLevel, oldLevel, xpData) {
    try {
        await client.checkAndAwardLevelRoles(member, newLevel);
        const guild = member.guild;
          
        let customSettings = (await db.query("SELECT * FROM settings WHERE guild = $1", [guild.id]))?.rows[0] || {};
          
        let channelToSend = null;
          
        try {
            let channelData = (await db.query("SELECT channel FROM channel WHERE guild = $1", [guild.id]))?.rows[0];
            if (channelData && channelData.channel && channelData.channel !== 'Default') {
                const fetchedChannel = guild.channels.cache.get(channelData.channel);
                if (fetchedChannel) channelToSend = fetchedChannel;
            }
        } catch(e) {}

        const c1 = customSettings.casinochannelid || customSettings.casinoChannelID;
        const c2 = customSettings.casinochannelid2 || customSettings.casinoChannelID2;

        if (!channelToSend) {
            if (messageOrInteraction && messageOrInteraction.channel) {
                if (c2 && c1 && messageOrInteraction.channel.id === c2) {
                      const mainCasino = guild.channels.cache.get(c1);
                      if (mainCasino) {
                          channelToSend = mainCasino;
                      } else {
                          channelToSend = messageOrInteraction.channel;
                      }
                } else {
                    channelToSend = messageOrInteraction.channel;
                }
            } else {
                return;
            }
        }
          
        let levelUpContent = null;
        let embed;
        
        const id = `${member.id}-${guild.id}`; 
        let notifSettings = await client.getQuestNotif(id);
        const lNotif = notifSettings ? (notifSettings.levelnotif !== undefined ? notifSettings.levelnotif : notifSettings.levelNotif) : 1;
        if (lNotif === 0) return; 

        const lvlUpTitle = customSettings.lvluptitle || customSettings.lvlUpTitle;
        const lvlUpDesc = customSettings.lvlupdesc || customSettings.lvlUpDesc;
        const lvlUpColor = customSettings.lvlupcolor || customSettings.lvlUpColor;
        const lvlUpImage = customSettings.lvlupimage || customSettings.lvlUpImage;
        const lvlUpMention = customSettings.lvlupmention || customSettings.lvlUpMention;

        if (lvlUpTitle) {
            function antonymsLevelUp(string) { return string.replace(/{member}/gi, `${member}`).replace(/{level}/gi, `${newLevel}`).replace(/{level_old}/gi, `${oldLevel}`).replace(/{xp}/gi, `${xpData.xp}`).replace(/{totalXP}/gi, `${xpData.totalXP}`); }
            embed = new EmbedBuilder().setTitle(antonymsLevelUp(lvlUpTitle)).setDescription(antonymsLevelUp(lvlUpDesc.replace(/\\n/g, '\n'))).setColor(lvlUpColor || "Random").setTimestamp();
            if (lvlUpImage) { embed.setImage(antonymsLevelUp(lvlUpImage)); }
            if (lvlUpMention == 1) { levelUpContent = `${member}`; }
        } else {
            embed = new EmbedBuilder().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) }).setColor("Random").setDescription(`**Congratulations** ${member}! You have now leveled up to **level ${newLevel}**`);
        }
        
        const perms = channelToSend.permissionsFor(guild.members.me);
        if (perms.has(PermissionsBitField.Flags.SendMessages) && perms.has(PermissionsBitField.Flags.ViewChannel)) {
            await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(() => {});
        }
    } catch (err) {}
}

client.sendQuestAnnouncement = async function(guild, member, quest, questType = 'achievement') { 
    try { 
        const id = `${member.id}-${guild.id}`; 
        let notifSettings = await client.getQuestNotif(id); 
        if (!notifSettings) { 
            notifSettings = { id: id, userID: member.id, guildID: guild.id, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1, kingsNotif: 1, badgesNotif: 1 }; 
            await client.setQuestNotif(notifSettings); 
        } 
        
        const dNotif = notifSettings.dailynotif !== undefined ? notifSettings.dailynotif : notifSettings.dailyNotif;
        const wNotif = notifSettings.weeklynotif !== undefined ? notifSettings.weeklynotif : notifSettings.weeklyNotif;
        const aNotif = notifSettings.achievementsnotif !== undefined ? notifSettings.achievementsnotif : notifSettings.achievementsNotif;

        let sendMention = false; 
        if (questType === 'daily') {
            if (dNotif === 0) return; 
            sendMention = true; 
        }
        if (questType === 'weekly') {
            if (wNotif === 0) return; 
            sendMention = true; 
        }
        if (questType === 'achievement') {
            if (aNotif === 0) return; 
            sendMention = true; 
        }
        
        const userIdentifier = sendMention ? `${member}` : `**${member.displayName}**`; 
        
        const settings = (await db.query("SELECT questChannelID, lastQuestPanelChannelID FROM settings WHERE guild = $1", [guild.id]))?.rows[0]; 
        const qChannel = settings ? (settings.questchannelid || settings.questChannelID) : null;
        if (!qChannel) return; 
        const channel = guild.channels.cache.get(qChannel); 
        if (!channel) return; 
        const perms = channel.permissionsFor(guild.members.me); 
        if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) return; 
        
        const canAttachFiles = perms.has(PermissionsBitField.Flags.AttachFiles); 
        const questName = quest.name; 
        const reward = quest.reward; 
        let message = ''; 
        let files = []; 
        const rewardDetails = `\n- **حصـلـت عـلـى:**\nMora: \`${reward.mora.toLocaleString()}\` ${client.EMOJI_MORA} | XP: \`${reward.xp.toLocaleString()}\` ${EMOJI_XP_ANIM}`; 
        
        const pChannel = settings ? (settings.lastquestpanelchannelid || settings.lastQuestPanelChannelID) : null;
        const panelChannelLink = pChannel ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${pChannel}>` : ""; 
        
        if (canAttachFiles) { 
            try { 
                let attachment; 
                if (questType === 'achievement') { 
                    const userAvatar = member.user.displayAvatarURL({ extension: 'png', size: 256 });
                    const userName = member.displayName || member.user.username;
                    const buffer = await client.generateAchievementCard(userAvatar, userName, quest.name, quest.description, quest.reward.mora, quest.reward.xp, quest.repReward || 0);
                    attachment = new AttachmentBuilder(buffer, { name: 'achievement.png' });
                } else { 
                    const typeForAlert = questType === 'weekly' ? 'rare' : 'daily'; 
                    attachment = await client.generateQuestAlert(member, quest, typeForAlert); 
                } 
                if(attachment) files.push(attachment); 
            } catch (imgErr) {} 
        } 
        
        message = announcementsTexts.getQuestMessage(questType, userIdentifier, questName, rewardDetails, panelChannelLink, client);

        await channel.send({ content: message, files: files, allowedMentions: { users: sendMention ? [member.id] : [] } }).catch(()=>{}); 
    } catch (err) {} 
}

client.checkQuests = async function(client, member, stats, questType, dateKey) {
    const questsToCheck = questsConfig[questType] || [];
    let newlyCompleted = 0;

    for (const quest of questsToCheck) {
        const currentProgress = stats[quest.stat] || 0;
        if (currentProgress >= quest.goal) {
            const claimID = `${member.id}-${member.guild.id}-${quest.id}-${dateKey}`;
            const existingClaim = (await db.query("SELECT * FROM user_quest_claims WHERE claimID = $1", [claimID]))?.rows[0];
            if (!existingClaim) {
                await db.query("INSERT INTO user_quest_claims (claimID, userID, guildID, questID, dateStr) VALUES ($1, $2, $3, $4, $5)", [claimID, member.id, member.guild.id, quest.id, dateKey]);
                let levelData = await client.getLevel(member.id, member.guild.id);
                if (!levelData) levelData = { ...client.defaultData, user: member.id, guild: member.guild.id };
                levelData.mora = (levelData.mora || 0) + quest.reward.mora;
                levelData.xp += quest.reward.xp;
                levelData.totalXP += quest.reward.xp;
                const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                if (levelData.xp >= nextXP) {
                    levelData.xp -= nextXP;
                    levelData.level += 1;
                }
                await client.setLevel(levelData);
                await client.sendQuestAnnouncement(member.guild, member, quest, questType);
                newlyCompleted++;
            }
        }
    }

    if (newlyCompleted > 0 && questsToCheck.length > 0) {
        const countData = (await db.query("SELECT COUNT(*) as cnt FROM user_quest_claims WHERE userID = $1 AND guildID = $2 AND dateStr = $3", [member.id, member.guild.id, dateKey]))?.rows[0];
        const completedCount = countData ? (countData.cnt || countData.count) : 0;
        const threshold = Math.max(1, questsToCheck.length - 1); 

        if (completedCount >= threshold) {
            const settings = (await db.query("SELECT questChannelID, roleDailyBadge, roleWeeklyBadge, lastQuestPanelChannelID FROM settings WHERE guild = $1", [member.guild.id]))?.rows[0];
            const qChannel = settings ? (settings.questchannelid || settings.questChannelID) : null;
            const announceChannel = qChannel ? member.guild.channels.cache.get(qChannel) : null;
            const notifSettings = (await db.query("SELECT badgesNotif FROM quest_notifications WHERE id = $1", [`${member.id}-${member.guild.id}`]))?.rows[0];
            const bNotif = notifSettings ? (notifSettings.badgesnotif !== undefined ? notifSettings.badgesnotif : notifSettings.badgesNotif) : 1;
            const pChannel = settings ? (settings.lastquestpanelchannelid || settings.lastQuestPanelChannelID) : null;
            const panelChannelLink = pChannel ? `\n\n✶ قـاعـة الانجـازات والمـهام والاشعـارات:\n<#${pChannel}>` : "";

            if (questType === 'daily') {
                try { await db.query("ALTER TABLE user_daily_stats ADD COLUMN IF NOT EXISTS daily_badge_given BIGINT DEFAULT 0"); } catch(e){}
                const dailyId = `${member.id}-${member.guild.id}-${dateKey}`;
                let dailyData = (await db.query("SELECT daily_badge_given FROM user_daily_stats WHERE id = $1", [dailyId]))?.rows[0];
                const dBadgeGiven = dailyData ? dailyData.daily_badge_given : 0;

                if (dBadgeGiven == 0) {
                    await db.query("UPDATE user_daily_stats SET daily_badge_given = 1 WHERE id = $1", [dailyId]);
                    const rDailyBadge = settings ? (settings.roledailybadge || settings.roleDailyBadge) : null;
                    if (rDailyBadge) member.roles.add(rDailyBadge).catch(()=>{});

                    if (announceChannel && bNotif === 1) {
                        let files = [];
                        if (announceChannel.permissionsFor(member.guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                            try {
                                const { generateEpicAnnouncement } = require('./generators/announcement-generator.js'); 
                                const buffer = await generateEpicAnnouncement(member.user, '✨ انـجـاز يـومـي ✨', 'ختم المهام اليومية', 'لم يترك مهمة إلا وأنجزها بكل شجاعة!', 'اكتملت جميع المهام', '#00BFFF');
                                files.push(new AttachmentBuilder(buffer, { name: `daily-badge-${Date.now()}.png` }));
                            } catch(e) {}
                        }
                        const badgeMsg = announcementsTexts.getBadgeMessage('daily', `<@${member.id}>`, client, panelChannelLink);
                        await announceChannel.send({ content: badgeMsg, files: files }).catch(()=>{});
                    }
                }
            } 
            else if (questType === 'weekly') {
                try { await db.query("ALTER TABLE user_weekly_stats ADD COLUMN IF NOT EXISTS weekly_badge_given BIGINT DEFAULT 0"); } catch(e){}
                const weeklyId = `${member.id}-${member.guild.id}-${dateKey}`;
                let weeklyData = (await db.query("SELECT weekly_badge_given FROM user_weekly_stats WHERE id = $1", [weeklyId]))?.rows[0];
                const wBadgeGiven = weeklyData ? weeklyData.weekly_badge_given : 0;

                if (wBadgeGiven == 0) {
                    await db.query("UPDATE user_weekly_stats SET weekly_badge_given = 1 WHERE id = $1", [weeklyId]);
                    const rWeeklyBadge = settings ? (settings.roleweeklybadge || settings.roleWeeklyBadge) : null;
                    if (rWeeklyBadge) member.roles.add(rWeeklyBadge).catch(()=>{});

                    if (announceChannel && bNotif === 1) {
                        let files = [];
                        if (announceChannel.permissionsFor(member.guild.members.me)?.has(PermissionsBitField.Flags.AttachFiles)) {
                            try {
                                const { generateEpicAnnouncement } = require('./generators/announcement-generator.js'); 
                                const buffer = await generateEpicAnnouncement(member.user, '🌟 انـجـاز أسـبـوعـي 🌟', 'أسطورة المهام الأسبوعية', 'تحدى المستحيل وختم الأسبوع بأكمله!', 'اكتملت جميع المهام', '#FF8C00');
                                files.push(new AttachmentBuilder(buffer, { name: `weekly-badge-${Date.now()}.png` }));
                            } catch(e) {}
                        }
                        const badgeMsg = announcementsTexts.getBadgeMessage('weekly', `<@${member.id}>`, client, panelChannelLink);
                        await announceChannel.send({ content: badgeMsg, files: files }).catch(()=>{});
                    }
                }
            }
        }
    }
}

client.checkAchievements = async function(client, member, levelData, totalStatsData) {
    for (const ach of questsConfig.achievements) {
        let currentProgress = 0;
        const streakData = (await db.query("SELECT * FROM streaks WHERE guildID = $1 AND userID = $2", [member.guild.id, member.id]))?.rows[0];
        const mediaStreakData = (await db.query("SELECT * FROM media_streaks WHERE guildID = $1 AND userID = $2", [member.guild.id, member.id]))?.rows[0];
          
        if (!totalStatsData) totalStatsData = await client.getTotalStats(`${member.id}-${member.guild.id}`) || {};
        totalStatsData = client.safeMerge(totalStatsData, defaultTotalStats); 

        if (ach.stat === 'messages') currentProgress = totalStatsData.total_messages || 0;
        else if (ach.stat === 'total_messages') currentProgress = totalStatsData.total_messages || 0; 
        else if (ach.stat === 'images') currentProgress = totalStatsData.total_images || 0;
        else if (ach.stat === 'stickers') currentProgress = totalStatsData.total_stickers || 0;
        else if (ach.stat === 'emojis_sent') currentProgress = totalStatsData.total_emojis_sent || 0; 
        else if (ach.stat === 'reactions_added') currentProgress = totalStatsData.total_reactions_added || 0;
        else if (ach.stat === 'total_reactions_added') currentProgress = totalStatsData.total_reactions_added || 0;
        else if (ach.stat === 'replies_sent') currentProgress = totalStatsData.total_replies_sent || 0;
        else if (ach.stat === 'vc_minutes') currentProgress = totalStatsData.total_vc_minutes || 0;
        else if (ach.stat === 'totalVCTime') currentProgress = totalStatsData.total_vc_minutes || 0;
        else if (ach.stat === 'disboard_bumps') currentProgress = totalStatsData.total_disboard_bumps || 0;
        else if (ach.stat === 'topgg_votes') currentProgress = totalStatsData.total_topgg_votes || 0;
        else if (ach.stat === 'meow_count' || ach.stat === 'total_meow_count') {
             let ld = levelData || await client.getLevel(member.id, member.guild.id);
             currentProgress = ld ? (ld.total_meow_count || 0) : 0;
        }
        else if (ach.stat === 'boost_count') {
             let ld = levelData || await client.getLevel(member.id, member.guild.id);
             currentProgress = ld ? (ld.boost_count || 0) : 0;
        }
        else if (levelData && levelData.hasOwnProperty(ach.stat)) currentProgress = levelData[ach.stat];
        else if (totalStatsData.hasOwnProperty(ach.stat)) currentProgress = totalStatsData[ach.stat];
        else if (ach.stat === 'highestStreak' && streakData) currentProgress = streakData.higheststreak || streakData.highestStreak || 0;
        else if (ach.stat === 'highestMediaStreak' && mediaStreakData) currentProgress = mediaStreakData.higheststreak || mediaStreakData.highestStreak || 0;
        else if (streakData && streakData.hasOwnProperty(ach.stat)) currentProgress = streakData[ach.stat];
        else {
             if (['has_caesar_role', 'has_race_role', 'has_tree_role', 'has_tag_role'].includes(ach.stat)) continue;
            continue;
        }

        if (currentProgress >= ach.goal) {
            const existingAch = (await db.query("SELECT * FROM user_achievements WHERE userID = $1 AND guildID = $2 AND achievementID = $3", [member.id, member.guild.id, ach.id]))?.rows[0];
            if (!existingAch) {
                await db.query("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES ($1, $2, $3, $4)", [member.id, member.guild.id, ach.id, Date.now()]);
                let ld = levelData || await client.getLevel(member.id, member.guild.id);
                if (!ld) ld = { ...client.defaultData, user: member.id, guild: member.guild.id };
                ld.mora = (ld.mora || 0) + ach.reward.mora;
                ld.xp += ach.reward.xp;
                ld.totalXP += ach.reward.xp;
                await client.setLevel(ld);
                await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
            }
        }
    }
}

client.incrementQuestStats = async function(userID, guildID, stat, amount = 1) {
    if (stat === 'messages') {
        if (!client.recentMessageTimestamps.has(guildID)) client.recentMessageTimestamps.set(guildID, []);
        const guildTimestamps = client.recentMessageTimestamps.get(guildID);
        const now = Date.now();
        for (let i = 0; i < amount; i++) { guildTimestamps.push(now); }
        while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); }
    }
    try {
        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();
        const dailyStatsId = `${userID}-${guildID}-${dateStr}`;
        const weeklyStatsId = `${userID}-${guildID}-${weekStartDateStr}`;
        const totalStatsId = `${userID}-${guildID}`;

        let dailyStats = await client.getDailyStats(dailyStatsId) || { id: dailyStatsId, userID, guildID, date: dateStr };
        let weeklyStats = await client.getWeeklyStats(weeklyStatsId) || { id: weeklyStatsId, userID, guildID, weekStartDate: weekStartDateStr };
        let totalStats = await client.getTotalStats(totalStatsId) || { id: totalStatsId, userID, guildID };

        dailyStats = client.safeMerge(dailyStats, defaultDailyStats);
        weeklyStats = client.safeMerge(weeklyStats, defaultDailyStats);
        totalStats = client.safeMerge(totalStats, defaultTotalStats);

        if (dailyStats.hasOwnProperty(stat)) dailyStats[stat] = (dailyStats[stat] || 0) + amount;
        if (weeklyStats.hasOwnProperty(stat)) weeklyStats[stat] = (weeklyStats[stat] || 0) + amount;
          
        if (stat === 'disboard_bumps') totalStats.total_disboard_bumps = (totalStats.total_disboard_bumps || 0) + amount;
        if (stat === 'messages') totalStats.total_messages = (totalStats.total_messages || 0) + amount;
        if (stat === 'images') totalStats.total_images = (totalStats.total_images || 0) + amount;
        if (stat === 'stickers') totalStats.total_stickers = (totalStats.total_stickers || 0) + amount;
        if (stat === 'emojis_sent') totalStats.total_emojis_sent = (totalStats.total_emojis_sent || 0) + amount;

        if (stat === 'replies_sent') totalStats.total_replies_sent = (totalStats.total_replies_sent || 0) + amount;
        if (stat === 'mentions_received') totalStats.total_mentions_received = (totalStats.total_mentions_received || 0) + amount;
        if (stat === 'vc_minutes') totalStats.total_vc_minutes = (totalStats.total_vc_minutes || 0) + amount;
        
        if (stat === 'topgg_votes') totalStats.total_topgg_votes = (totalStats.total_topgg_votes || 0) + amount;
                  
        await client.setDailyStats(dailyStats);
        await client.setWeeklyStats(weeklyStats);
        
        await client.setTotalStats({
            id: totalStatsId, userID, guildID,
            total_messages: totalStats.total_messages, total_images: totalStats.total_images, total_stickers: totalStats.total_stickers,
            total_emojis_sent: totalStats.total_emojis_sent,
            total_reactions_added: totalStats.total_reactions_added, total_replies_sent: totalStats.total_replies_sent, total_mentions_received: totalStats.total_mentions_received,
            total_vc_minutes: totalStats.total_vc_minutes, total_disboard_bumps: totalStats.total_disboard_bumps,
            total_topgg_votes: totalStats.total_topgg_votes
        });

        const member = client.guilds.cache.get(guildID)?.members.cache.get(userID);
        if (member) {
            await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
            await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
            await client.checkAchievements(client, member, null, totalStats);
            
             if (stat === 'meow_count') {
                 let levelData = await client.getLevel(userID, guildID);
                 if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
            }
            if (stat === 'water_tree') {
                 let levelData = await client.getLevel(userID, guildID);
                 if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
            }
        }
    } catch (err) {}
}

client.checkRoleAchievement = async function(member, roleId, achievementId) {
    try {
        const guildID = member.guild.id;
        const userID = member.id;
        const existingAch = (await db.query("SELECT * FROM user_achievements WHERE userID = $1 AND guildID = $2 AND achievementID = $3", [userID, guildID, achievementId]))?.rows[0];
        const ach = questsConfig.achievements.find(a => a.id === achievementId);
        if (!ach) return;
        
        let hasRole = false;
        if (achievementId === 'ach_race_role') {
            const raceRoles = (await db.query("SELECT roleID FROM race_roles WHERE guildID = $1", [guildID])).rows;
            const raceRoleIDs = raceRoles.map(r => r.roleid || r.roleID);
            hasRole = member.roles.cache.some(role => raceRoleIDs.includes(role.id));
        } else { hasRole = member.roles.cache.has(roleId); }
        
        if (hasRole) {
            if (existingAch) return; 
            await db.query("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES ($1, $2, $3, $4)", [userID, guildID, ach.id, Date.now()]);
            let ld = await client.getLevel(userID, guildID);
            if (!ld) ld = { ...client.defaultData, user: userID, guild: guildID };
            ld.mora = (ld.mora || 0) + ach.reward.mora;
            ld.xp += ach.reward.xp;
            ld.totalXP += ach.reward.xp;
            await client.setLevel(ld);
            await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
        } 
    } catch (err) {}
}

async function updateTimerChannels(client) {
    const guilds = client.guilds.cache.values();
    const KSA_OFFSET = 3 * 60 * 60 * 1000; 
    for (const guild of guilds) {
        const settings = (await db.query("SELECT streakTimerChannelID, dailyTimerChannelID, weeklyTimerChannelID FROM settings WHERE guild = $1", [guild.id]))?.rows[0];
        if (!settings) continue;
        const now = new Date();
        const nowKSA = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + KSA_OFFSET);

        const endOfDay = new Date(nowKSA); endOfDay.setHours(24, 0, 0, 0);
        const msUntilDaily = endOfDay - nowKSA;
        const hDaily = Math.floor(msUntilDaily / (1000 * 60 * 60));
        const mDaily = Math.floor((msUntilDaily % (1000 * 60 * 60)) / (1000 * 60));
        const dailyText = `${hDaily} سـ ${mDaily} د`;

        const endOfWeek = new Date(nowKSA);
        const dayOfWeek = nowKSA.getDay(); 
        const daysUntilFriday = (5 + 7 - dayOfWeek) % 7; 
        endOfWeek.setDate(nowKSA.getDate() + daysUntilFriday + (daysUntilFriday === 0 && nowKSA.getHours() >= 0 ? 7 : 0));
        endOfWeek.setHours(24, 0, 0, 0); 
        const msUntilWeekly = endOfWeek - nowKSA;
        const dWeekly = Math.floor(msUntilWeekly / (1000 * 60 * 60 * 24));
        const hWeekly = Math.floor((msUntilWeekly % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const weeklyText = `${dWeekly} يـ ${hWeekly} سـ`;

        const updateChannel = async (channelId, prefix, timeText) => {
            if (!channelId) return;
            try {
                const channel = guild.channels.cache.get(channelId);
                if (channel) {
                    const newName = `${prefix} ${timeText}`;
                    if (channel.name !== newName) await channel.setName(newName);
                }
            } catch (e) { }
        };

        const sTimer = settings.streaktimerchannelid || settings.streakTimerChannelID;
        const dTimer = settings.dailytimerchannelid || settings.dailyTimerChannelID;
        const wTimer = settings.weeklytimerchannelid || settings.weeklyTimerChannelID;

        await updateChannel(sTimer, '🔥〢الـستـريـك:', dailyText);
        await updateChannel(dTimer, '🏆〢مهام اليومية:', dailyText);
        await updateChannel(wTimer, '🔮〢مهام اسبوعية:', weeklyText);
    }
}

async function updateRainbowRoles(client) {
    try {
        const rainbowRoles = (await db.query("SELECT roleID, guildID FROM rainbow_roles")).rows;
        if (rainbowRoles.length === 0) return;
        const randomColor = Math.floor(Math.random() * 16777215);
        for (const record of rainbowRoles) {
            const guild = client.guilds.cache.get(record.guildid || record.guildID);
            if (!guild) continue;
            const role = guild.roles.cache.get(record.roleid || record.roleID);
            if (role) await role.edit({ color: randomColor }).catch(() => {});
            else await db.query("DELETE FROM rainbow_roles WHERE roleID = $1", [record.roleid || record.roleID]);
        }
    } catch (e) {}
}

client.on(Events.ClientReady, async () => { 
    console.log(`✅ Logged in as ${client.user.username}`);
      
    await autoJoin(client);
    await initGiveaways(client);

    require('./handlers/voice-timer.js')(client);
    
    startAuctionSystem(client); 
    setTimeout(() => { autoUpdateKingsBoard(client, db).catch(() => {}); }, 5000);

    startAutoChat(client);

    require('./handlers/weekly-role.js')(client);

    client.antiRolesCache = new Map();
    await loadRoleSettings(db, client.antiRolesCache);

    const rest = new REST({ version: '10' }).setToken(botToken);
    const commands = [];
    const loadedCommandNames = new Set();

    function getFiles(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        let commandFiles = [];
        for (const file of files) {
            if (file.isDirectory()) commandFiles = [...commandFiles, ...getFiles(path.join(dir, file.name))];
            else if (file.name.endsWith('.js')) commandFiles.push(path.join(dir, file.name));
        }
        return commandFiles;
    }

    const commandFiles = getFiles(path.join(__dirname, 'commands'));
    for (const file of commandFiles) {
        try {
            const command = require(file);
            const cmdName = command.data ? command.data.name : command.name;
            if (cmdName) {
                if (loadedCommandNames.has(cmdName)) continue;
                loadedCommandNames.add(cmdName);
                if (command.data) commands.push(command.data.toJSON());
                if ('execute' in command) client.commands.set(cmdName, command);
            }
        } catch (err) {}
    }
      
    try { 
        await rest.put(Routes.applicationGuildCommands(client.user.id, MAIN_GUILD_ID), { body: [] });
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (error) {}

    setInterval(calculateInterest, 60 * 60 * 1000); 
    calculateInterest(); 

    setInterval(updateMarketPrices, 60 * 60 * 1000); 
    updateMarketPrices(); 
      
    setInterval(() => checkLoanPayments(client, db), 60 * 60 * 1000); 
    setInterval(() => checkFarmIncome(client, db), 60 * 60 * 1000); 
    checkFarmIncome(client, db); 

    setInterval(() => checkDailyStreaks(client, db), 3600000); 
    checkDailyStreaks(client, db);

    setInterval(() => checkDailyMediaStreaks(client, db), 3600000); 
    checkDailyMediaStreaks(client, db);

    setInterval(() => checkUnjailTask(client), 5 * 60 * 1000); 
    checkUnjailTask(client);

    setInterval(() => checkTemporaryRoles(client), 60000); 
    checkTemporaryRoles(client);

    setInterval(() => updateTimerChannels(client), 5 * 60 * 1000); 
    updateTimerChannels(client); 

    setInterval(() => updateRainbowRoles(client), 180000); 

    setInterval(async () => {
        const now = Date.now();
        try {
            const guildsToNotify = (await db.query("SELECT guild, bumpChannelID, bumpNotifyRoleID, lastBumperID FROM settings WHERE nextBumpTime > 0 AND nextBumpTime <= $1", [now])).rows;

            for (const row of guildsToNotify) {
                try {
                    const guild = client.guilds.cache.get(row.guild);
                    const bChannel = row.bumpchannelid || row.bumpChannelID;
                    if (guild && bChannel) {
                        const channel = guild.channels.cache.get(bChannel);
                        if (channel) {
                            const bRole = row.bumpnotifyroleid || row.bumpNotifyRoleID;
                            const lBumper = row.lastbumperid || row.lastBumperID;
                            const roleMention = bRole ? `<@&${bRole}>` : "";
                            const userMention = lBumper ? `<@${lBumper}>` : " "; 

                            channel.send({
                                content: `✥ ${roleMention} | ${userMention}\n\n❖ أيّها الموقر، <:2Salute:1428340456856490074> \n✶ آن أوان رفع راية الإمبراطورية من جديد السيرفر جاهز للنشر، وكلّ ما ننتظره هو أمرك.\nأرسل الأمر التالي:\n/bump`,
                                files: ["https://i.postimg.cc/KYZ5Ktj6/ump.jpg"]
                            }).catch(() => {});

                            channel.setName('˖✶⁺〢🔥・انشر・الان').catch(()=>{});
                        }
                    }
                } catch (err) {}
                
                await db.query("UPDATE settings SET nextBumpTime = 0 WHERE guild = $1", [row.guild]);
            }
        } catch(e) {}
    }, 60 * 1000); 

    setInterval(async () => {
        const now = Date.now();
        try {
            const expired = (await db.query("SELECT * FROM auto_responses WHERE expiresAt IS NOT NULL AND expiresAt < $1", [now])).rows;
            for (const reply of expired) {
                await db.query("DELETE FROM auto_responses WHERE id = $1", [reply.id]);
            }
        } catch (err) {}
    }, 60 * 60 * 1000);

    let lastReminderSentHour = -1; let lastUpdateSentHour = -1; let lastWarningSentHour = -1; 
    setInterval(() => { 
        const KSA_TIMEZONE = 'Asia/Riyadh'; 
        const nowKSA = new Date().toLocaleString('en-US', { timeZone: KSA_TIMEZONE }); 
        const ksaDate = new Date(nowKSA); 
        const ksaHour = ksaDate.getHours(); 
        
        if (ksaHour === 0 && lastUpdateSentHour !== ksaHour) { 
            sendDailyMediaUpdate(client, db); 
            rewardDailyKings(client, db);
            lastUpdateSentHour = ksaHour; 
        } else if (ksaHour !== 0) lastUpdateSentHour = -1; 
        
        if (ksaHour === 12 && lastWarningSentHour !== ksaHour) { 
            sendStreakWarnings(client, db); 
            lastWarningSentHour = ksaHour; 
        } else if (ksaHour !== 12) lastWarningSentHour = -1; 
        
        if (ksaHour === 15 && lastReminderSentHour !== ksaHour) { 
            sendMediaStreakReminders(client, db); 
            lastReminderSentHour = ksaHour; 
        } else if (ksaHour !== 15) lastReminderSentHour = -1; 
    }, 60000); 
      
    const lastRandomGiveawayDate = new Map(); setInterval(async () => { const today = new Date().toISOString().split('T')[0]; const now = Date.now(); for (const guild of client.guilds.cache.values()) { const guildID = guild.id; if (lastRandomGiveawayDate.get(guildID) === today) continue; const guildTimestamps = client.recentMessageTimestamps.get(guildID) || []; while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); } const totalMessagesLast2Hours = guildTimestamps.length; if (totalMessagesLast2Hours < 200) continue; const roll = Math.random(); if (roll < 0.10) { try { const success = await createRandomDropGiveaway(client, guild); if (success) { lastRandomGiveawayDate.set(guildID, today); } } catch (err) {} } } }, 30 * 60 * 1000); 
      
    setInterval(() => {
        try {
            if (client.activePlayers && client.activePlayers.size > 0) client.activePlayers.clear();
            if (client.activeGames && client.activeGames.size > 0) client.activeGames.clear();
            if (client.raceTimestamps && client.raceTimestamps.size > 0) client.raceTimestamps.clear();
            if (client.marketLocks && client.marketLocks.size > 0) client.marketLocks.clear();
        } catch (e) {}
    }, 30 * 60 * 1000); 

    setInterval(() => {
        autoUpdateKingsBoard(client, db).catch(() => {});
    }, 60 * 1000);

    sendDailyMediaUpdate(client, db);
}); 

require('./interaction-handler.js')(client, db, client.antiRolesCache);

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) { const filePath = path.join(eventsPath, file); const event = require(filePath); if (event.once) { client.once(event.name, (...args) => event.execute(...args)); } else { client.on(event.name, (...args) => event.execute(...args)); } }

try {
    require('./handlers/topgg-handler.js')(client, db);
} catch (err) {}

client.login(botToken);

async function shutdownGracefully(signal) {
    try {
        if (client) {
            client.destroy();
        }
        if (db) {
            await db.end(); 
        }
        process.exit(0);
    } catch (err) {
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdownGracefully('SIGINT'));
process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
