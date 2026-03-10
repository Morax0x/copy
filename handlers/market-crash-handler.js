const { EmbedBuilder, Colors } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';
const CRASH_PRICE_TRIGGER = 10; 
const RESET_PRICE = 500; 
const MESSAGE_DELAY = 4000; 

module.exports = async function handleMarketCrash(client, db, item) {
    if (!client.marketLocks) client.marketLocks = new Set();
    client.marketLocks.add(item.id);

    try {
        console.log(`[Market Crash] Stock ${item.id} crashed! Processing...`);

        // تحديث سعر السهم المنهار وإعادة ضبطه
        await db.query(`UPDATE market_items SET "currentPrice" = $1, "lastChangePercent" = 0, "lastChange" = 0 WHERE "id" = $2`, [RESET_PRICE, item.id]);

        // جلب جميع المستثمرين في هذا السهم
        const investorsRes = await db.query(`SELECT "userID", "quantity" FROM user_portfolio WHERE "itemID" = $1`, [item.id]);
        const investors = investorsRes.rows;

        if (investors.length === 0) {
            console.log(`[Market Crash] No investors found for ${item.id}.`);
            client.marketLocks.delete(item.id);
            return;
        }

        // جلب قناة الكازينو لإرسال البيانات
        const settingsRes = await db.query(`SELECT "casinoChannelID" FROM settings WHERE "casinoChannelID" IS NOT NULL LIMIT 1`);
        const settings = settingsRes.rows[0];
        let channel = null;
        if (settings && (settings.casinoChannelID || settings.casinochannelid)) {
            channel = client.channels.cache.get(settings.casinoChannelID || settings.casinochannelid);
        }

        try {
            await db.query("BEGIN");
            for (const inv of investors) {
                const uID = inv.userID || inv.userid;
                const qty = Number(inv.quantity);
                const refundAmount = qty * CRASH_PRICE_TRIGGER; 
                
                // إضافة التعويض لرصيد العضو
                await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2`, [refundAmount, uID]);
                
                // حذف السهم من محفظة العضو
                await db.query(`DELETE FROM user_portfolio WHERE "userID" = $1 AND "itemID" = $2`, [uID, item.id]);
            }
            await db.query("COMMIT");
        } catch (e) {
            await db.query("ROLLBACK");
            throw e;
        }

        if (channel) {
            investors.forEach((inv, index) => {
                const uID = inv.userID || inv.userid;
                const qty = Number(inv.quantity);

                setTimeout(async () => {
                    try {
                        const member = await channel.guild.members.fetch(uID).catch(() => null);
                        if (!member) return; 

                        const refundAmount = qty * CRASH_PRICE_TRIGGER;

                        const embed = new EmbedBuilder()
                            .setTitle(`❖ بـيـان صـادر عـن خـزانـة الإمبـراطوريـة`)
                            .setDescription(
                                `إن سـهـم **[ ${item.name} ]** قـد هوى واعلن افلاسـه، وتهاوى حتى بلـغ أقصـى دركٍ في السـوق\n\n` +
                                `**التـدابـيـر الإمبـراطوريـة لإعـادة البعـث:**\n` +
                                `✶ إعلان إفلاس السهم \n` +
                                `✶ نزع محافظ المستثمرين كاملة بلا أي استثناء\n` +
                                `✶ إحياء السهم بأمرٍ سامٍ من الإمبراطور وطرحه بسعره الجديد **${RESET_PRICE}**\n\n` +
                                `✬ لانك احد مستثمري هذا السهم تم منحـك قيمتـه\n` +
                                `✬ حصـلـت عـلـى: **${refundAmount.toLocaleString()}** ${EMOJI_MORA}`
                            )
                            .setColor("Random")
                            .setImage('https://i.postimg.cc/4dftMyQ6/markett.png')
                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

                        await channel.send({ content: `<@${uID}>`, embeds: [embed] });

                    } catch (err) {
                        console.error(`[Crash Notification Error] User: ${uID}`, err);
                    }

                    if (index === investors.length - 1) {
                        client.marketLocks.delete(item.id);
                        console.log(`[Market Crash] All notifications sent for ${item.id}. Stock unlocked.`);
                    }

                }, index * MESSAGE_DELAY); 
            });
        } else {
            client.marketLocks.delete(item.id);
        }

    } catch (err) {
        console.error("[Market Crash Handler Error]", err);
        client.marketLocks.delete(item.id); 
    }
};
