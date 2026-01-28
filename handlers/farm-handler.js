// handlers/farm-handler.js

const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');
const seedsData = require('../json/seeds.json'); 
const feedItems = require('../json/feed-items.json');

async function checkFarmIncome(client, sql) {
    if (!sql.open) return;

    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // 1. إنشاء الجداول الضرورية (بما في ذلك جداول التخزين المؤقت للتقرير اليومي)
    try {
        sql.prepare("CREATE TABLE IF NOT EXISTS farm_last_payout (id TEXT PRIMARY KEY, lastPayoutDate INTEGER)").run();
        // جدول لتخزين ما فعله العامل خلال اليوم (حصاد/إطعام) ليتم عرضه في التقرير النهائي
        sql.prepare("CREATE TABLE IF NOT EXISTS farm_daily_log (id INTEGER PRIMARY KEY AUTOINCREMENT, userID TEXT, guildID TEXT, actionType TEXT, itemName TEXT, count INTEGER, timestamp INTEGER)").run();
    } catch (e) {}

    // جلب الملاك
    const farmOwners = sql.prepare("SELECT DISTINCT userID, guildID FROM user_farm UNION SELECT DISTINCT userID, guildID FROM user_lands").all();
    if (!farmOwners.length) return;

    // =========================================================
    // 🚜 العمليات الدورية (كل ساعة): حصاد وإطعام
    // =========================================================
    
    // تجهيز الاستعلامات
    const stmtCheckWorker = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'farm_worker' AND expiresAt > ?");
    const stmtGetPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ? AND status = 'planted'");
    const stmtHarvestPlot = sql.prepare("UPDATE user_lands SET status = 'empty', seedID = NULL, plantTime = NULL WHERE userID = ? AND guildID = ? AND plotID = ?");
    const stmtLogAction = sql.prepare("INSERT INTO farm_daily_log (userID, guildID, actionType, itemName, count, timestamp) VALUES (?, ?, ?, ?, ?, ?)");
    
    const stmtGetUserFarm = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?");
    const stmtCheckFeed = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?");
    const stmtDeductFeed = sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?");
    const stmtFeedAnimal = sql.prepare("UPDATE user_farm SET lastFedTimestamp = ? WHERE id = ?");
    const stmtDeleteAnimal = sql.prepare("DELETE FROM user_farm WHERE id = ?");

    // استعلامات التقرير اليومي
    const stmtCheckPayout = sql.prepare("SELECT lastPayoutDate FROM farm_last_payout WHERE id = ?");
    const stmtUpdatePayout = sql.prepare("INSERT OR REPLACE INTO farm_last_payout (id, lastPayoutDate) VALUES (?, ?)");
    const stmtGetSettings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?");
    const stmtGetDailyLogs = sql.prepare("SELECT * FROM farm_daily_log WHERE userID = ? AND guildID = ?");
    const stmtClearDailyLogs = sql.prepare("DELETE FROM farm_daily_log WHERE userID = ? AND guildID = ?");

    for (const owner of farmOwners) {
        try {
            const { userID, guildID } = owner;
            const workerBuff = stmtCheckWorker.get(userID, guildID, now);
            const hasWorker = !!workerBuff;

            // ---------------------------------------------------------
            // 🌾 1. الحصاد التلقائي (يعمل كل ساعة إذا وجد عامل)
            // ---------------------------------------------------------
            if (hasWorker) {
                const plantedPlots = stmtGetPlots.all(userID, guildID);
                for (const plot of plantedPlots) {
                    const seed = seedsData.find(s => s.id === plot.seedID);
                    if (!seed) continue;

                    const growthMs = seed.growth_time_hours * 3600000;
                    const plantTime = plot.plantTime || now;
                    const age = now - plantTime;

                    // إذا نضجت النبتة
                    if (age >= growthMs) {
                        stmtHarvestPlot.run(userID, guildID, plot.plotID);
                        
                        // إضافة المكافآت فوراً
                        let userData = client.getLevel.get(userID, guildID);
                        if (userData) {
                            userData.mora = (userData.mora || 0) + seed.sell_price;
                            userData.xp = (userData.xp || 0) + seed.xp_reward;
                            userData.totalXP = (userData.totalXP || 0) + seed.xp_reward;
                            client.setLevel.run(userData);
                        }

                        // تسجيل العملية للتقرير اليومي
                        stmtLogAction.run(userID, guildID, 'harvest', seed.name, 1, now);
                    }
                }
            }

            // ---------------------------------------------------------
            // 🐄 2. الإطعام التلقائي + الموت (يعمل كل ساعة)
            // ---------------------------------------------------------
            const userFarm = stmtGetUserFarm.all(userID, guildID);
            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animal) continue; 

                const qty = row.quantity || 1;
                const lastFed = row.lastFedTimestamp || now;
                const hungerTime = now - lastFed;
                const maxHungerMs = (animal.max_hunger_days || 7) * ONE_DAY;
                
                // تنبيه الجوع (إذا وصل 90% من وقت الجوع الأقصى)
                const hungerThreshold = maxHungerMs * 0.9; 

                let fedToday = false;

                // إذا الحيوان جائع جداً وقرب يموت
                if (hungerTime >= hungerThreshold) {
                    if (hasWorker) {
                        const invData = stmtCheckFeed.get(userID, guildID, animal.feed_id);
                        if (invData && invData.quantity >= qty) {
                            // ✅ إطعام فوري لإنقاذ الحيوان
                            stmtDeductFeed.run(qty, userID, guildID, animal.feed_id);
                            stmtFeedAnimal.run(now, row.id);
                            
                            stmtLogAction.run(userID, guildID, 'feed', animal.name, qty, now);
                            fedToday = true;
                        } else {
                            // ❌ لا يوجد علف (نسجل نفاد المخزون مرة واحدة في اليوم)
                            const logs = stmtGetDailyLogs.all(userID, guildID);
                            const alreadyLogged = logs.some(l => l.actionType === 'out_of_stock' && l.timestamp > (now - ONE_DAY));
                            if (!alreadyLogged) {
                                stmtLogAction.run(userID, guildID, 'out_of_stock', 'feed', 1, now);
                            }
                        }
                    }
                }

                // فحص الموت (جوع أو عمر)
                const purchaseTimestamp = row.purchaseTimestamp || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                if (!fedToday && hungerTime >= maxHungerMs) {
                    stmtDeleteAnimal.run(row.id);
                    stmtLogAction.run(userID, guildID, 'death_starve', animal.name, qty, now);
                } else if (ageInMs >= lifespanInMs) {
                    stmtDeleteAnimal.run(row.id);
                    stmtLogAction.run(userID, guildID, 'death_old', animal.name, qty, now);
                }
            }

            // =========================================================
            // 📊 3. التقرير اليومي (يعمل مرة كل 24 ساعة)
            // =========================================================
            const payoutID = `${userID}-${guildID}`;
            const lastPayoutData = stmtCheckPayout.get(payoutID);
            
            // إذا لم يمر 24 ساعة، نتوقف هنا
            if (lastPayoutData && (now - lastPayoutData.lastPayoutDate) < ONE_DAY) {
                continue; 
            }

            // تحديث وقت التقرير
            stmtUpdatePayout.run(payoutID, now);

            // حساب دخل الحيوانات اليومي (يضاف مرة واحدة في اليوم)
            let dailyAnimalIncome = 0;
            let currentAnimalsCount = 0;
            
            // نعيد جلب الحيوانات الحية فقط
            const liveAnimals = stmtGetUserFarm.all(userID, guildID);
            for (const row of liveAnimals) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (animal) {
                    const qty = row.quantity || 1;
                    dailyAnimalIncome += (animal.income_per_day * qty);
                    currentAnimalsCount += qty;
                }
            }

            // إضافة الدخل لرصيد اللاعب
            if (dailyAnimalIncome > 0) {
                let userData = client.getLevel.get(userID, guildID);
                if (userData) {
                    userData.mora = (userData.mora || 0) + dailyAnimalIncome;
                    client.setLevel.run(userData);
                }
            }

            // جلب سجلات النشاط اليومي
            const dailyLogs = stmtGetDailyLogs.all(userID, guildID);
            
            // تصفية السجلات للعرض
            let harvestedMap = new Map();
            let fedMap = new Map();
            let starvedDeaths = [];
            let oldDeaths = [];
            let outOfStock = false;

            for (const log of dailyLogs) {
                if (log.actionType === 'harvest') {
                    harvestedMap.set(log.itemName, (harvestedMap.get(log.itemName) || 0) + log.count);
                } else if (log.actionType === 'feed') {
                    fedMap.set(log.itemName, (fedMap.get(log.itemName) || 0) + log.count);
                } else if (log.actionType === 'death_starve') {
                    if (!starvedDeaths.includes(log.itemName)) starvedDeaths.push(log.itemName);
                } else if (log.actionType === 'death_old') {
                    if (!oldDeaths.includes(log.itemName)) oldDeaths.push(log.itemName);
                } else if (log.actionType === 'out_of_stock') {
                    outOfStock = true;
                }
            }

            // تنظيف السجلات القديمة
            stmtClearDailyLogs.run(userID, guildID);

            // إذا لم يحدث شيء يذكر، لا ترسل تقرير
            if (dailyAnimalIncome <= 0 && dailyLogs.length === 0) continue;

            // إرسال التقرير
            const guildObj = client.guilds.cache.get(guildID);
            if (!guildObj) continue;
            const settings = stmtGetSettings.get(guildID);
            if (!settings || !settings.casinoChannelID) continue;
            const channel = guildObj.channels.cache.get(settings.casinoChannelID);
            if (!channel) continue;
            const member = await guildObj.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            const EMOJI_MORA = '<:mora:1435647151349698621>'; 
            let description = ``;

            // قسم العامل
            if (hasWorker && (fedMap.size > 0 || harvestedMap.size > 0 || outOfStock)) {
                description += `**✶ تـقـرير عـامل المزرعـة (أعمال اليوم)**\n\n`;
                
                if (fedMap.size > 0) {
                    description += `**★ تـم اطعـام:**\n`;
                    fedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                    description += `\n`;
                }

                if (outOfStock) {
                    description += `**★ ⚠️ تنبيه:** مخزون الأعلاف نفد! العامل لم يستطع إطعام الجميع.\n\n`;
                }

                if (harvestedMap.size > 0) {
                    description += `**★ تـم حصـاد:**\n`;
                    harvestedMap.forEach((count, name) => description += `- ${name}: ${count}\n`);
                    description += `\n`;
                }
                description += `────────────────────\n`;
            }

            // قسم الدخل والحيوانات
            description += `✶ حـققـت حيواناتك دخـل يومي بقيمـة: **${dailyAnimalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                           `✶ عـدد الحـيوانات الحية في مزرعتك: **${currentAnimalsCount.toLocaleString()}**`;

            // قسم الوفيات
            if (starvedDeaths.length > 0 || oldDeaths.length > 0) {
                description += `\n\n💀 **سُنة الحياة في المزرعة...**\n`;
                if (starvedDeaths.length > 0) description += `❌ **مات من الجوع:** ${starvedDeaths.join('، ')}\n`;
                if (oldDeaths.length > 0) description += `🍂 **مات من الكبر:** ${oldDeaths.join('، ')}\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`)
                .setColor("Random")
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/sD3FWvWT/2755e200-2fc8-45e1-8f3f-785b8e19793d-(1).png')
                .setDescription(description)
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(() => {});

        } catch (err) {
            console.error(`[Farm Critical Error] User: ${owner.userID}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
