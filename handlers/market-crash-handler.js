const { EmbedBuilder, Colors } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';
const CRASH_PRICE_TRIGGER = 10; // السعر الذي يسبب الانهيار
const RESET_PRICE = 100; // السعر الجديد بعد الانهيار
const MESSAGE_DELAY = 4000; // 4 ثواني بين كل رسالة لمنع السبام

module.exports = async function handleMarketCrash(client, sql, item) {
    // 1. تفعيل قفل السهم لمنع البيع والشراء أثناء العملية
    if (!client.marketLocks) client.marketLocks = new Set();
    client.marketLocks.add(item.id);

    try {
        console.log(`[Market Crash] Stock ${item.id} crashed! Processing...`);

        // 2. إعادة تعيين سعر السهم فوراً إلى 100
        sql.prepare("UPDATE market_items SET currentPrice = ?, lastChangePercent = 0, lastChange = 0 WHERE id = ?").run(RESET_PRICE, item.id);

        // 3. جلب جميع المستثمرين في هذا السهم
        const investors = sql.prepare("SELECT userID, quantity FROM user_portfolio WHERE itemID = ?").all(item.id);

        if (investors.length === 0) {
            console.log(`[Market Crash] No investors found for ${item.id}.`);
            client.marketLocks.delete(item.id);
            return;
        }

        // 4. تحديد قناة الكازينو لإرسال الإشعارات
        // نفترض أن السيرفر الرئيسي هو أول سيرفر تم العثور فيه على الإعدادات أو مرر MAIN_GUILD_ID
        // يفضل تمرير guildID للدالة، لكن سنجلبها من أول مستثمر أو الإعدادات العامة
        const settings = sql.prepare("SELECT casinoChannelID FROM settings WHERE casinoChannelID IS NOT NULL LIMIT 1").get();
        let channel = null;
        if (settings && settings.casinoChannelID) {
            channel = client.channels.cache.get(settings.casinoChannelID);
        }

        // 5. تصفية المحافظ والتعويض (دفعة واحدة في الداتابيس لضمان الأمان)
        const transaction = sql.transaction(() => {
            for (const inv of investors) {
                const refundAmount = inv.quantity * CRASH_PRICE_TRIGGER; // التعويض بقيمة 10 مورا للسهم
                
                // إضافة المورا للاعب
                sql.prepare("UPDATE levels SET mora = mora + ? WHERE user = ?").run(refundAmount, inv.userID);
                
                // حذف الأسهم من المحفظة
                sql.prepare("DELETE FROM user_portfolio WHERE userID = ? AND itemID = ?").run(inv.userID, item.id);
            }
        });
        transaction();

        // 6. إرسال الإشعارات (بشكل متتابع لمنع السبام)
        if (channel) {
            investors.forEach((inv, index) => {
                setTimeout(async () => {
                    try {
                        const member = await channel.guild.members.fetch(inv.userID).catch(() => null);
                        if (!member) return; // العضو خرج من السيرفر

                        const refundAmount = inv.quantity * CRASH_PRICE_TRIGGER;

                        const embed = new EmbedBuilder()
                            .setTitle(`❖ بـيـان صـادر عـن خـزانـة الإمبـراطوريـة`)
                            .setDescription(
                                `إن سـهـم **[ ${item.name} ]** قـد هوى واعلن افلاسـه، وتهاوى حتى بلـغ أقصـى دركٍ في السـوق\n\n` +
                                `**التـدابـيـر الإمبـراطوريـة لإعـادة البعـث:**\n` +
                                `✶ إعلان إفلاس السهم على رؤوس الأشهاد\n` +
                                `✶ نزع محافظ المستثمرين كاملة بلا أي استثناء\n` +
                                `✶ إحياء السهم بأمرٍ سامٍ من الإمبراطور وطرحه بسعره الجديد **${RESET_PRICE}**\n\n` +
                                `✬ لانك احد مستثمري هذا السهم تم منحـك قيمتـه\n` +
                                `✬ حصـلـت عـلـى: **${refundAmount.toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setColor("Random")
                            .setImage('https://i.postimg.cc/4dftMyQ6/markett.png')
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

                        // إرسال الرسالة مع منشن للاعب فقط
                        await channel.send({ content: `<@${inv.userID}>`, embeds: [embed] });

                    } catch (err) {
                        console.error(`[Crash Notification Error] User: ${inv.userID}`, err);
                    }

                    // فك القفل بعد انتهاء آخر رسالة
                    if (index === investors.length - 1) {
                        client.marketLocks.delete(item.id);
                        console.log(`[Market Crash] All notifications sent for ${item.id}. Stock unlocked.`);
                    }

                }, index * MESSAGE_DELAY); // تأخير زمني (4 ثواني × ترتيب العضو)
            });
        } else {
            // في حال لم يتم العثور على القناة، نفك القفل فوراً
            client.marketLocks.delete(item.id);
        }

    } catch (err) {
        console.error("[Market Crash Handler Error]", err);
        client.marketLocks.delete(item.id); // فك القفل في حال الخطأ
    }
};
