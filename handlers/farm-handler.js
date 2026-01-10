const { EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../json/farm-animals.json');

async function checkFarmIncome(client, sql) {
    // فحص أمان أولي لقاعدة البيانات
    if (!sql.open) return;

    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // 1. إنشاء الجدول إذا لم يكن موجوداً
    try {
        sql.prepare("CREATE TABLE IF NOT EXISTS farm_last_payout (id TEXT PRIMARY KEY, lastPayoutDate INTEGER)").run();
    } catch (e) {
        console.error("[Database Error] Could not create farm_last_payout table:", e);
        return;
    }

    // 2. جلب الملاك
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

            // ---[ فحص الوقت ]---
            const lastPayoutData = stmtCheckPayout.get(payoutID);
            // إذا لم يمر يوم كامل، تخطى
            if (lastPayoutData && (now - lastPayoutData.lastPayoutDate) < ONE_DAY) {
                continue; 
            }

            // ---[ حساب الدخل والحياة ]---
            const userFarm = stmtGetUserFarm.all(userID, guildID);
            if (!userFarm.length) continue;

            let totalIncome = 0;
            let totalAnimalsCount = 0;
            let deadCount = 0;
            
            // قوائم الأسماء للعرض
            let starvedNames = []; // ماتوا جوعاً
            let oldAgeNames = [];  // ماتوا كبراً

            for (const row of userFarm) {
                const animal = farmAnimals.find(a => String(a.id) === String(row.animalID));
                if (!animal) continue; 

                const qty = row.quantity || 1;

                // 1. فحص العمر
                const purchaseTimestamp = row.purchaseTimestamp || now; 
                const ageInMs = now - purchaseTimestamp;
                const lifespanInMs = animal.lifespan_days * ONE_DAY;

                // 2. فحص الجوع
                const lastFed = row.lastFedTimestamp || now;
                const hungerTime = now - lastFed;
                const maxHungerMs = (animal.max_hunger_days || 7) * ONE_DAY;

                let isDead = false;
                
                // هل مات من الجوع؟
                if (hungerTime >= maxHungerMs) {
                    isDead = true;
                    if (!starvedNames.includes(animal.name)) starvedNames.push(animal.name);
                } 
                // هل مات من الكبر؟
                else if (ageInMs >= lifespanInMs) {
                    isDead = true;
                    if (!oldAgeNames.includes(animal.name)) oldAgeNames.push(animal.name);
                }

                if (isDead) {
                    stmtDeleteAnimal.run(row.id); // حذف من الداتابيس
                    deadCount += qty;
                } else {
                    // حي -> احسب الدخل
                    totalIncome += (animal.income_per_day * qty); 
                    totalAnimalsCount += qty;
                }
            }

            // إذا لا يوجد دخل ولا وفيات، لا ترسل شيئاً
            if (totalIncome <= 0 && deadCount === 0) continue;

            // ---[ تحديث الرصيد ]---
            if (totalIncome > 0) {
                let userData = client.getLevel.get(userID, guildID);
                if (!userData) {
                    if (!client.defaultData) continue;
                    userData = { ...client.defaultData, user: userID, guild: guildID };
                }
                userData.mora = (userData.mora || 0) + totalIncome;
                client.setLevel.run(userData);
            }

            // تحديث وقت الاستلام
            stmtUpdatePayout.run(payoutID, now);

            // ---[ إرسال التقرير (بالشكل القديم) ]---
            const guild = client.guilds.cache.get(guildID);
            if (!guild) continue;

            const settings = stmtGetSettings.get(guildID);
            if (!settings || !settings.casinoChannelID) continue;

            const channel = guild.channels.cache.get(settings.casinoChannelID);
            if (!channel) continue;

            const member = await guild.members.fetch(userID).catch(() => null);
            if (!member) continue; 

            const EMOJI_MORA = '<:mora:1435647151349698621>'; 

            // بناء الوصف بنفس التنسيق القديم
            let description = `✶ حـققـت مـزرعتـك دخـل بقيمـة: **${totalIncome.toLocaleString()}** ${EMOJI_MORA}\n` +
                              `✶ عـدد الحـيوانات الحية: **${totalAnimalsCount.toLocaleString()}**`;

            // إضافة قسم الوفيات (مفصل)
            if (deadCount > 0) {
                description += `\n\n💀 **سُنة الحياة في المزرعة...**\nفارقت الحياة **${deadCount}** من حيواناتك:`;
                
                if (starvedNames.length > 0) {
                    description += `\n❌ **من الجوع:** ${starvedNames.join('، ')}`;
                }
                if (oldAgeNames.length > 0) {
                    description += `\n🍂 **من الكبر:** ${oldAgeNames.join('، ')}`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`❖ تـقرير المـزرعـة اليومي`) // العنوان القديم
                .setColor(deadCount > 0 ? Colors.Orange : Colors.Gold) // لون ذهبي أو برتقالي للتحذير
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setImage('https://i.postimg.cc/d0KD5JpH/download.gif') // الصورة القديمة
                .setDescription(description)
                .setFooter({ text: `إجمالي دخل المزرعة اليومي: ${totalIncome.toLocaleString()}` })
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
