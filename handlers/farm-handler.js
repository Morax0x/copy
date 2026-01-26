// handlers/farm-handler.js

const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');
const seedsData = require('../json/seeds.json'); 
const feedItems = require('../json/feed-items.json');

async function checkFarmIncome(client, sql) {
    if (!sql.open) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // إنشاء الجداول الضرورية
    try {
        sql.prepare("CREATE TABLE IF NOT EXISTS farm_last_payout (id TEXT PRIMARY KEY, lastPayoutDate INTEGER)").run();
    } catch (e) {}

    // جلب الملاك
    const farmOwners = sql.prepare("SELECT DISTINCT userID, guildID FROM user_farm").all();
    if (!farmOwners.length) return;

    // تجهيز الاستعلامات
    const stmtCheckPayout = sql.prepare("SELECT lastPayoutDate FROM farm_last_payout WHERE id = ?");
    const stmtUpdatePayout = sql.prepare("INSERT OR REPLACE INTO farm_last_payout (id, lastPayoutDate) VALUES (?, ?)");
    const stmtGetSettings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?");
    
    // استعلامات العامل
    const stmtCheckWorker = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'farm_worker' AND expiresAt > ?");
    
    // استعلامات الحصاد
    const stmtGetPlots = sql.prepare("SELECT * FROM user_lands WHERE userID = ? AND guildID = ? AND status = 'planted'");
    const stmtHarvestPlot = sql.prepare("UPDATE user_lands SET status = 'empty', seedID = NULL, plantTime = NULL WHERE userID = ? AND guildID = ? AND plotID = ?");
    
    // استعلامات الحيوانات
    const stmtGetUserFarm = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?");
    const stmtDeleteAnimal = sql.prepare("DELETE FROM user_farm WHERE id = ?");
    
    // استعلامات الإطعام التلقائي
    const stmtCheckFeed = sql.prepare("SELECT quantity FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?");
    const stmtDeductFeed = sql.prepare("UPDATE user_inventory SET quantity = quantity - ? WHERE userID = ? AND guildID = ? AND itemID = ?");
    const stmtFeedAnimal = sql.prepare("UPDATE user_farm SET lastFedTimestamp = ? WHERE id = ?");

    for (const owner of farmOwners) {
        try {
            const { userID, guildID } = owner;
            const payoutID = `${userID}-${guildID}`;

            // فحص الوقت (مرة كل 24 ساعة)
            const lastPayoutData = stmtCheckPayout.get(payoutID);
            if (lastPayoutData && (now - lastPayoutData.lastPayoutDate) < ONE_DAY) {
                continue; 
            }

            // تحديث وقت الاستلام فوراً
            stmtUpdatePayout.run(payoutID, now);

            // =========================================================
            // 👨‍🌾 1. فحص وجود "عامل المزرعة"
            // =========================================================
            const workerBuff = stmtCheckWorker.get(userID, guildID, now);
            const hasWorker = !!workerBuff; 

            // سجلات التقرير
            let harvestedLog = []; // لتسجيل ما تم حصاده (الاسم: العدد)
            let fedLog = [];       // لتسجيل ما تم إطعامه (الاسم: العدد)
            let outOfStockLog = false; // هل نفذ المخزون؟

            let incomeFromWorker = 0; 
            let xpFromWorker = 0;

            // =========================================================
            // 🌾 2. وظيفة العامل: الحصاد التلقائي
            // =========================================================
            if (hasWorker) {
                const plantedPlots = stmtGetPlots.all(userID, guildID);
                let harvestMap = new Map(); // لتجميع المحاصيل المتشابهة

                for (const plot of plantedPlots) {
                    const seed = seedsData.find(s => s.id === plot.seedID);
                    if (!seed) continue;

                    const growthMs = seed.growth_time_hours * 3600000;
                    const plantTime = plot.plantTime || now;
                    const age = now - plantTime;

                    // إذا نضجت النبتة
                    if (age >= growthMs) {
                        stmtHarvestPlot.run(userID, guildID, plot.plotID);
                        incomeFromWorker += seed.sell_price;
                        xpFromWorker += seed.xp_reward;
                        
                        // إضافة للقائمة
                        if (harvestMap.has(seed.name)) {
                            harvestMap.set(seed.name, harvestMap.get(seed.name) + 1);
                        } else {
                            harvestMap.set(seed.name, 1);
                        }
                    }
                }

                // تحويل الماب إلى قائمة نصوص
                harvestMap.forEach((count, name) => {
                    harvestedLog.push(`- ${name}: ${count}`);
                });
            }

            // =========================================================
            // 🐄 3. وظيفة الحيوانات (الدخل + الإطعام التلقائي + الموت)
            // =========================================================
            const userFarm = stmtGetUserFarm.all(userID, guildID);
            
            let totalIncome = 0;
            let totalAnimalsCount = 0;
            let deadCount = 0;
            
            let starvedNames = []; 
            let oldAgeNames = []; 
            let fedMap = new Map(); // لتجميع الحيوانات التي تم إطعامها

            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animal) continue; 

                const qty = row.quantity || 1;
                
                const purchaseTimestamp = row.purchaseTimestamp || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                const lastFed = row.lastFedTimestamp || now;
                const hungerTime = now - lastFed;
                const maxHungerMs = (animal.max_hunger_days || 7) * ONE_DAY;
                
                let isDead = false;
                let workerFedThis = false;

                // 🔴 منطق الموت من الجوع + تدخل العامل
                if (hungerTime >= maxHungerMs) {
                    
                    if (hasWorker) {
                        const feedItem = feedItems.find(f => f.id === animal.feed_id);
                        if (feedItem) {
                            const invData = stmtCheckFeed.get(userID, guildID, animal.feed_id);
                            if (invData && invData.quantity >= qty) {
                                // ✅ إطعام
                                stmtDeductFeed.run(qty, userID, guildID, animal.feed_id);
                                stmtFeedAnimal.run(now, row.id);
                                workerFedThis = true;
                                
                                if (fedMap.has(animal.name)) {
                                    fedMap.set(animal.name, fedMap.get(animal.name) + qty);
                                } else {
                                    fedMap.set(animal.name, qty);
                                }
                            } else {
                                // ❌ لا يوجد علف كافي
                                outOfStockLog = true;
                            }
                        }
                    }

                    if (!workerFedThis) {
                        isDead = true;
                        if (!starvedNames.includes(animal.name)) starvedNames.push(animal.name);
                    }
                } 
                else if (ageInMs >= lifespanInMs) {
                    isDead = true;
                    if (!oldAgeNames.includes(animal.name)) oldAgeNames.push(animal.name);
                }

                if (isDead) {
                    stmtDeleteAnimal.run(row.id);
                    deadCount += qty;
                } else {
                    totalIncome += (animal.income_per_day * qty); 
                    totalAnimalsCount += qty;
                }
            }

            // تحويل ماب الإطعام إلى نصوص
            fedMap.forEach((count, name) => {
                fedLog.push(`- ${name}: ${count}`);
            });

            // =========================================================
            // 💰 4. تحديث الرصيد وإرسال التقرير
            // =========================================================
            
            const totalMoraGained = totalIncome + incomeFromWorker;
            const totalXPGained = xpFromWorker;

            if (totalMoraGained <= 0 && deadCount === 0 && harvestedLog.length === 0 && fedLog.length === 0) continue;

            if (totalMoraGained > 0 || totalXPGained > 0) {
                let userData = client.getLevel.get(userID, guildID);
                if (!userData) {
                    if (!client.defaultData) continue;
                    userData = { ...client.defaultData, user: userID, guild: guildID };
                }
                userData.mora = (userData.mora || 0) + totalMoraGained;
                userData.xp = (userData.xp || 0) + totalXPGained;
                userData.totalXP = (userData.totalXP || 0) + totalXPGained;
                client.setLevel.run(userData);
            }

            const guild = client.guilds.cache.get(guildID);
            if (!guild) continue;

            const settings = stmtGetSettings.get(guildID);
            if (!settings || !settings.casinoChannelID) continue;

            const channel = guild.channels.cache.get(settings.casinoChannelID);
            if (!channel) continue;

            const member = await guild.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            const EMOJI_MORA = '<:mora:1435647151349698621>'; 

            // 🔥 بناء التقرير بالشكل الجديد 🔥
            let description = ``;

            // تقرير العامل (إذا كان موجوداً وقام بشيء)
            if (hasWorker && (fedLog.length > 0 || harvestedLog.length > 0 || outOfStockLog)) {
                description += `**✶ تـقـرير عـامل المزرعـة**\n\n`;
                
                if (fedLog.length > 0) {
                    description += `**★ تـم اطعـام:**\n${fedLog.join('\n')}\n\n`;
                }

                if (outOfStockLog) {
                    description += `**★ مخـزون الاعلاف يحتاج للتجديد**\nلم يتمكن العامل من إطعام بعض الحيوانات\n\n`;
                }

                if (harvestedLog.length > 0) {
                    description += `**★ تـم حصـاد:**\n${harvestedLog.join('\n')}\n\n`;
                }
                description += `────────────────────\n`;
            }

            // الدخل الأساسي (للحيوانات)
            description += `✶ حـققـت حيواناتك دخـل بقيمـة: **${totalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                           `✶ عـدد الحـيوانات الحية: **${totalAnimalsCount.toLocaleString()}**`;

            // تقرير الوفيات (إن وجد)
            if (deadCount > 0) {
                description += `\n\n💀 **سُنة الحياة في المزرعة...**\nفارقت الحياة **${deadCount}** من حيواناتك:`;
                if (starvedNames.length > 0) description += `\n❌ **من الجوع:** ${starvedNames.join('، ')}`;
                if (oldAgeNames.length > 0) description += `\n🍂 **من الكبر:** ${oldAgeNames.join('، ')}`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`)
                .setColor("Random") // لون عشوائي
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/sD3FWvWT/2755e200-2fc8-45e1-8f3f-785b8e19793d-(1).png') // الصورة الجديدة
                .setDescription(description)
                .setFooter({ text: `إجمالي المكتسب: ${totalMoraGained.toLocaleString()}` })
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(err => {
                console.error(`[Farm Msg Error] Can't send to channel ${channel.id}:`, err.message);
            });

        } catch (err) {
            console.error(`[Farm Critical Error] Processing User: ${owner.userID}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
