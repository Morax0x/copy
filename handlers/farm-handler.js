const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');

async function checkFarmIncome(client, sql) {
    // فحص أمان أولي لقاعدة البيانات
    if (!sql.open) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // 1. إنشاء الجدول إذا لم يكن موجوداً (لتتبع آخر وقت استلم فيه الراتب)
    try {
        sql.prepare("CREATE TABLE IF NOT EXISTS farm_last_payout (id TEXT PRIMARY KEY, lastPayoutDate INTEGER)").run();
    } catch (e) {
        console.error("[Database Error] Could not create farm_last_payout table:", e);
        return;
    }

    // 2. جلب الملاك (الذين لديهم حيوانات فقط)
    const farmOwners = sql.prepare("SELECT DISTINCT userID, guildID FROM user_farm").all();
    if (!farmOwners.length) return;

    // تجهيز الاستعلامات
    const stmtCheckPayout = sql.prepare("SELECT lastPayoutDate FROM farm_last_payout WHERE id = ?");
    const stmtGetUserFarm = sql.prepare("SELECT * FROM user_farm WHERE userID = ? AND guildID = ?");
    const stmtUpdatePayout = sql.prepare("INSERT OR REPLACE INTO farm_last_payout (id, lastPayoutDate) VALUES (?, ?)");
    const stmtGetSettings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?");
    const stmtDeleteAnimal = sql.prepare("DELETE FROM user_farm WHERE id = ?");

    for (const owner of farmOwners) {
        try {
            const { userID, guildID } = owner;
            const payoutID = `${userID}-${guildID}`;

            // ---[ الخطوة 1: فحص الوقت (مرة كل 24 ساعة) ]---
            const lastPayoutData = stmtCheckPayout.get(payoutID);
            
            // إذا استلم راتب قبل أقل من يوم، تخطى
            if (lastPayoutData && (now - lastPayoutData.lastPayoutDate) < ONE_DAY) {
                continue; 
            }

            // ---[ الخطوة 2: حساب الدخل وفحص حياة الحيوانات ]---
            const userFarm = stmtGetUserFarm.all(userID, guildID);
            if (!userFarm.length) continue;

            let totalIncome = 0;
            let totalAnimalsCount = 0;
            let deadAnimalsCount = 0; 
            let deadAnimalsNames = []; 
            let starvedAnimalsNames = [];

            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animal) continue; // حيوان محذوف من الملف

                const qty = row.quantity || 1; // ✅ دعم الكميات

                // 1. فحص العمر (Age Check)
                const purchaseTimestamp = row.purchaseTimestamp || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                // 2. فحص الجوع (Hunger Check) ✅
                const lastFed = row.lastFedTimestamp || now;
                const hungerTime = now - lastFed;
                const maxHungerMs = (animal.max_hunger_days || 7) * ONE_DAY;

                let isDead = false;
                let deathReason = '';

                // هل مات من الجوع؟
                if (hungerTime >= maxHungerMs) {
                    isDead = true;
                    deathReason = 'starved';
                } 
                // هل مات من الكبر؟
                else if (ageInMs >= lifespanInMs) {
                    isDead = true;
                    deathReason = 'old';
                }

                if (isDead) {
                    stmtDeleteAnimal.run(row.id); // حذف الصف
                    deadAnimalsCount += qty;
                    
                    if (deathReason === 'starved') {
                        if (!starvedAnimalsNames.includes(animal.name)) starvedAnimalsNames.push(animal.name);
                    } else {
                        if (!deadAnimalsNames.includes(animal.name)) deadAnimalsNames.push(animal.name);
                    }
                } else {
                    // الحيوان حي -> احسب الدخل
                    // ملاحظة: الحيوان الجائع جداً قد لا ينتج، لكن للتبسيط سنحسب الدخل ما دام حياً
                    totalIncome += (animal.income_per_day * qty); 
                    totalAnimalsCount += qty;
                }
            }

            // إذا لم يتبق حيوانات ولا يوجد دخل، ولا يوجد موتى للتبليغ عنهم، توقف
            if (totalIncome <= 0 && deadAnimalsCount === 0) continue;

            // ---[ الخطوة 3: تحديث الرصيد ]---
            if (totalIncome > 0) {
                let userData = client.getLevel.get(userID, guildID);
                if (!userData) {
                    if (!client.defaultData) continue;
                    userData = { ...client.defaultData, user: userID, guild: guildID };
                }
                userData.mora = (userData.mora || 0) + totalIncome;
                client.setLevel.run(userData);
            }

            // تسجيل وقت الحصاد الجديد (تحديث التوقيت)
            stmtUpdatePayout.run(payoutID, now);

            // ---[ الخطوة 4: إرسال التقرير ]---
            const guild = client.guilds.cache.get(guildID);
            if (!guild) continue;

            const settings = stmtGetSettings.get(guildID);
            if (!settings || !settings.casinoChannelID) continue;

            const channel = guild.channels.cache.get(settings.casinoChannelID);
            if (!channel) continue;

            const member = await guild.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            const EMOJI_MORA = '<:mora:1435647151349698621>'; 

            let description = `💰 **الـدخـل اليـومـي:** **${totalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                              `🐔 **الحـيـوانـات المـنتجـة:** **${totalAnimalsCount.toLocaleString()}**`;

            // إضافة رسالة الوفيات
            if (deadAnimalsCount > 0) {
                description += `\n\n⚰️ **نفقت بعض الحيوانات (${deadAnimalsCount}):**`;
                if (starvedAnimalsNames.length > 0) {
                    description += `\n❌ **من الجوع:** ${starvedAnimalsNames.join('، ')}`;
                }
                if (deadAnimalsNames.length > 0) {
                    description += `\n🍂 **من الكبر:** ${deadAnimalsNames.join('، ')}`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 تقرير المزرعة اليومي`)
                .setColor(deadAnimalsCount > 0 ? Colors.Orange : Colors.Green)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setDescription(description)
                .setFooter({ text: `يتم توزيع الأرباح كل 24 ساعة` })
                .setTimestamp();

            await channel.send({ content: `<@${userID}>`, embeds: [embed] }).catch(() => {});

        } catch (err) {
            console.error(`[Farm Critical Error] Processing User: ${owner.userID}`, err);
        }
    }
}

module.exports = { checkFarmIncome };
