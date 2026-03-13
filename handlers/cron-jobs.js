const { createRandomDropGiveaway } = require('./giveaway-handler.js');
const { autoUpdateKingsBoard, rewardDailyKings } = require('./guild-board-handler.js'); 
const { checkLoanPayments } = require('./loan-handler.js'); 
const { checkFarmIncome } = require('./farm-handler.js');
const handleMarketCrash = require('./market-crash-handler.js');
const { checkDailyStreaks, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("../streak-handler.js");
const { checkUnjailTask } = require('./report-handler.js'); 
const marketConfig = require('../json/market-items.json');

const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 

module.exports = (client, db) => {
    async function updateMarketPrices() {
        try {
            if (!client.marketLocks) client.marketLocks = new Set();
            const res = await db.query("SELECT * FROM market_items");
            const allItems = res.rows;
            if (allItems.length === 0) return;

            await db.query('BEGIN');
            const CRASH_PRICE = 10; 

            for (const item of allItems) {
                const itemId = item.id || item.itemID;
                if (client.marketLocks.has(itemId)) continue;

                // 🔥 تصحيح وضع اسم العمود في علامات تنصيص للاحتياط
                const resOwned = await db.query(`SELECT SUM(quantity) as total FROM user_portfolio WHERE "itemID" = $1`, [itemId]);
                const totalOwned = resOwned.rows[0].total || 0;

                let randomPercent = (Math.random() * 0.20) - 0.10;
                const saturationPenalty = (totalOwned / 2000) * 0.02;
                let finalChangePercent = randomPercent - saturationPenalty;

                const oldPrice = item.currentprice || item.currentPrice || 0;
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
                
                await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = $2, "lastChange" = $3 WHERE "id" = $4`, [newPrice, displayPercent, changeAmount, itemId]);
            }
            await db.query('COMMIT');
        } catch (err) {
            console.error("[Cron - Market Error]:", err);
            await db.query('ROLLBACK').catch(()=>{});
        }
    }

    async function checkTemporaryRoles() {
        const now = Date.now();
        try {
            const expiredRoles = (await db.query(`SELECT * FROM temporary_roles WHERE "expiresAt" <= $1 OR "expiresat" <= $1`, [now])).rows;
            if (expiredRoles.length === 0) return;

            await db.query('BEGIN');
            for (const record of expiredRoles) {
                const uId = record.userid || record.userID;
                const gId = record.guildid || record.guildID;
                const rId = record.roleid || record.roleID;
                await db.query(`DELETE FROM temporary_roles WHERE "userID" = $1 AND "guildID" = $2 AND "roleID" = $3`, [uId, gId, rId]);
            }
            await db.query('COMMIT');

            for (const record of expiredRoles) {
                const gId = record.guildid || record.guildID;
                const uId = record.userid || record.userID;
                const rId = record.roleid || record.roleID;

                const guild = client.guilds.cache.get(gId);
                if (!guild) continue;
                const member = await guild.members.fetch(uId).catch(() => null);
                const role = guild.roles.cache.get(rId);
                if (member && role) {
                    member.roles.remove(role).catch(() => {});
                }
            }
        } catch (err) {
            await db.query('ROLLBACK').catch(()=>{});
        }
    }

    // 🔥 تم تحسين هذه الدالة لتجنب خنق قاعدة البيانات (DbHandler exited)
    const calculateInterest = async () => {
        const now = Date.now();
        const INTEREST_RATE = 0.0005; 
        const COOLDOWN = 24 * 60 * 60 * 1000; 
        const INACTIVITY_LIMIT = 7 * 24 * 60 * 60 * 1000; 
        
        try {
            const allUsersRes = await db.query(`SELECT "user", "guild", "bank", "lastInterest", "lastDaily", "lastWork", "lastinterest", "lastdaily", "lastwork" FROM levels WHERE "bank" > 0`);
            const allUsers = allUsersRes.rows;
            
            if (allUsers.length === 0) return;

            // نظام معالجة على دفعات (Batching) لتخفيف الضغط
            const batchSize = 100; // معالجة 100 يوزر في كل دفعة
            
            for (let i = 0; i < allUsers.length; i += batchSize) {
                const batch = allUsers.slice(i, i + batchSize);
                
                await db.query('BEGIN'); // بدء معاملة الدفعة الحالية
                
                for (const user of batch) {
                    const lastInterest = Number(user.lastinterest || user.lastInterest || 0);
                    const lastDaily = Number(user.lastdaily || user.lastDaily || 0);
                    const lastWork = Number(user.lastwork || user.lastWork || 0);
                    const userId = user.user;
                    const guildId = user.guild;

                    if ((now - lastInterest) >= COOLDOWN) {
                        const timeSinceDaily = now - lastDaily;
                        const timeSinceWork = now - lastWork;
                        
                        if (timeSinceDaily > INACTIVITY_LIMIT && timeSinceWork > INACTIVITY_LIMIT) {
                            await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, userId, guildId]);
                        } else {
                            const bankBalance = Number(user.bank || 0);
                            const interestAmount = Math.floor(bankBalance * INTEREST_RATE);
                            if (interestAmount > 0) {
                                await db.query(`UPDATE levels SET "bank" = "bank" + $1, "lastInterest" = $2, "totalInterestEarned" = COALESCE("totalInterestEarned", 0) + $3 WHERE "user" = $4 AND "guild" = $5`, [interestAmount, now, interestAmount, userId, guildId]);
                            } else {
                                await db.query(`UPDATE levels SET "lastInterest" = $1 WHERE "user" = $2 AND "guild" = $3`, [now, userId, guildId]);
                            }
                        }
                    }
                }
                await db.query('COMMIT'); // حفظ الدفعة الحالية
                
                // استراحة قصيرة جداً للـ Pool بين الدفعات
                if (i + batchSize < allUsers.length) {
                    await new Promise(resolve => setTimeout(resolve, 500)); 
                }
            }
        } catch (err) {
            console.error("[Cron - Interest Error]:", err);
            await db.query('ROLLBACK').catch(()=>{});
        }
    };

    async function updateTimerChannels() {
        const guilds = Array.from(client.guilds.cache.values());
        const KSA_OFFSET = 3 * 60 * 60 * 1000; 
        for (const guild of guilds) {
            try {
                const settingsRes = await db.query(`SELECT * FROM settings WHERE "guild" = $1`, [guild.id]);
                const settings = settingsRes.rows[0];
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
            } catch (err) {}
        }
    }

    async function updateRainbowRoles() {
        try {
            const rainbowRoles = (await db.query("SELECT * FROM rainbow_roles")).rows;
            if (rainbowRoles.length === 0) return;
            const randomColor = Math.floor(Math.random() * 16777215);
            for (const record of rainbowRoles) {
                const gId = record.guildid || record.guildID;
                const rId = record.roleid || record.roleID;
                const guild = client.guilds.cache.get(gId);
                if (!guild) continue;
                const role = guild.roles.cache.get(rId);
                if (role) await role.edit({ color: randomColor }).catch(() => {});
                else await db.query(`DELETE FROM rainbow_roles WHERE "roleID" = $1 OR "roleid" = $1`, [rId]);
            }
        } catch (e) {}
    }

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

    setInterval(() => checkUnjailTask(client, db), 5 * 60 * 1000); 
    checkUnjailTask(client, db);

    setInterval(() => checkTemporaryRoles(), 60000); 
    checkTemporaryRoles();

    setInterval(() => updateTimerChannels(), 5 * 60 * 1000); 
    updateTimerChannels(); 

    setInterval(() => updateRainbowRoles(), 180000); 

    setInterval(async () => {
        const now = Date.now();
        try {
            const guildsToNotify = (await db.query(`SELECT * FROM settings WHERE "nextBumpTime" > 0 AND "nextBumpTime" <= $1`, [now])).rows;

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
                
                await db.query(`UPDATE settings SET "nextBumpTime" = 0 WHERE "guild" = $1`, [row.guild]);
            }
        } catch(e) {}
    }, 60 * 1000); 

    setInterval(async () => {
        const now = Date.now();
        try {
            const expired = (await db.query(`SELECT * FROM auto_responses WHERE "expiresAt" < $1 OR "expiresat" < $1`, [now])).rows;
            for (const reply of expired) {
                await db.query(`DELETE FROM auto_responses WHERE "id" = $1`, [reply.id]);
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
      
    const lastRandomGiveawayDate = new Map(); 
    setInterval(async () => { 
        const today = new Date().toISOString().split('T')[0]; 
        const now = Date.now(); 
        for (const guild of client.guilds.cache.values()) { 
            const guildID = guild.id; 
            if (lastRandomGiveawayDate.get(guildID) === today) continue; 
            
            if (!client.recentMessageTimestamps) client.recentMessageTimestamps = new Map();
            const guildTimestamps = client.recentMessageTimestamps.get(guildID) || []; 
            while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); } 
            
            const totalMessagesLast2Hours = guildTimestamps.length; 
            if (totalMessagesLast2Hours < 200) continue; 
            const roll = Math.random(); 
            if (roll < 0.10) { 
                try { 
                    const success = await createRandomDropGiveaway(client, guild); 
                    if (success) { lastRandomGiveawayDate.set(guildID, today); } 
                } catch (err) {} 
            } 
        } 
    }, 30 * 60 * 1000); 
      
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
};
