// handlers/auction-handler.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, Colors } = require('discord.js');

// إعدادات العملة والشكل
const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const AUCTION_COLOR = "#D9AD5F";
const AUCTION_IMAGE = "https://i.postimg.cc/3JxcxWJ0/fc6a5a55-09da-42af-9ae9-6313540a6415-(1).png"; 

// 1. التأكد من وجود الجدول
function ensureAuctionTable(sql) {
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS active_auctions (
            messageID TEXT PRIMARY KEY,
            channelID TEXT,
            hostID TEXT,
            item_name TEXT,
            current_bid INTEGER,
            start_price INTEGER DEFAULT 0,
            highest_bidder TEXT,
            min_increment INTEGER,
            end_time INTEGER,
            image_url TEXT,
            bid_count INTEGER DEFAULT 0
        )
    `).run();
    try { sql.prepare("ALTER TABLE active_auctions ADD COLUMN start_price INTEGER DEFAULT 0").run(); } catch (e) {}
    try { sql.prepare("ALTER TABLE active_auctions ADD COLUMN bid_count INTEGER DEFAULT 0").run(); } catch (e) {}
}

// 2. دالة بدء مراقبة المزادات
async function startAuctionSystem(client) {
    const sql = client.sql;
    ensureAuctionTable(sql);

    setInterval(async () => {
        if (!sql.open) return;
        try {
            const now = Date.now();
            const activeAuctions = sql.prepare("SELECT * FROM active_auctions").all();
            for (const auction of activeAuctions) {
                if (now >= auction.end_time) {
                    await endAuction(client, auction);
                }
            }
        } catch (err) {
            console.error("[Auction System Error]", err.message);
        }
    }, 10000);
}

// 3. دالة إنهاء المزاد
async function endAuction(client, auctionData) {
    const sql = client.sql;
    
    // 🔥 الحذف الفوري أولاً لمنع التكرار نهائياً 🔥
    try {
        sql.prepare("DELETE FROM active_auctions WHERE messageID = ?").run(auctionData.messageID);
    } catch (e) {
        console.error("Failed to delete auction:", e);
        return; // توقف إذا فشل الحذف
    }

    const channel = client.channels.cache.get(auctionData.channelID);
    if (!channel) return;

    try {
        const msg = await channel.messages.fetch(auctionData.messageID).catch(() => null);
        if (msg) {
            await msg.edit({ components: [] }).catch(() => {});
        }

        if (auctionData.highest_bidder) {
            const winEmbed = new EmbedBuilder()
                .setTitle('✥ انـتهـى المزاد')
                .setDescription(`
✶ تـم بيـع: **${auctionData.item_name}**
✶ المشتـري: <@${auctionData.highest_bidder}>
✶ السعر النهائي: **${auctionData.current_bid.toLocaleString()}** ${EMOJI_MORA}
                `)
                .setColor(AUCTION_COLOR)
                .setImage(AUCTION_IMAGE) // ✅ الصورة الذهبية
                .setTimestamp();

            await channel.send({ content: `🔔 | <@${auctionData.highest_bidder}>`, embeds: [winEmbed] });

        } else {
            const failEmbed = new EmbedBuilder()
                .setTitle('✥ انـتهـى المزاد')
                .setDescription(`
✶ تـم بيـع: **${auctionData.item_name}**
✶ الحالة: **لم يتم البيع (لا يوجد مزايدات)**
                `)
                .setColor("Red")
                .setImage(AUCTION_IMAGE); // ✅ الصورة الذهبية
            
            await channel.send({ embeds: [failEmbed] });
        }

    } catch (err) {
        console.error("Auction End Error:", err);
    }
}

// 4. معالجة نظام المزاد بالكامل
async function handleAuctionSystem(interaction) {
    const { customId, user, guild, client } = interaction;
    const sql = client.sql;

    if (!sql.open) return interaction.reply({ content: "⚠️", ephemeral: true });

    let messageID, action;
    if (customId.startsWith('bid_open_')) { messageID = customId.replace('bid_open_', ''); action = 'open_menu'; } 
    else if (customId.startsWith('bid_min_')) { messageID = customId.replace('bid_min_', ''); action = 'place_min_bid'; } 
    else if (customId.startsWith('bid_custom_btn_')) { messageID = customId.replace('bid_custom_btn_', ''); action = 'open_modal'; } 
    else if (customId.startsWith('bid_modal_submit_')) { messageID = customId.replace('bid_modal_submit_', ''); action = 'submit_custom_bid'; } 
    else { return; }

    const auction = sql.prepare("SELECT * FROM active_auctions WHERE messageID = ?").get(messageID);
    if (!auction) return interaction.reply({ content: "❌ انتهى المزاد.", ephemeral: true });

    const userData = sql.prepare("SELECT mora, bank FROM levels WHERE user = ? AND guild = ?").get(user.id, guild.id) || { mora: 0, bank: 0 };

    if (action === 'open_menu') {
        const menuEmbed = new EmbedBuilder()
            .setTitle('✥ دار المزاد')
            .setDescription(`
**اهـلاً بـك في مـنـصـة المـزايـدة**

📦 **عـنصـر المزاد:** ${auction.item_name}
💰 **السعر الحالي:** ${auction.current_bid.toLocaleString()} ${EMOJI_MORA}
📈 **اقـل مبلـغ للزيادة:** ${auction.min_increment.toLocaleString()} ${EMOJI_MORA}

💸 **رصـيدك الكـاش:** ${userData.mora.toLocaleString()} ${EMOJI_MORA}
🏦 **رصيـد البنـك:** ${userData.bank.toLocaleString()} ${EMOJI_MORA}
            `)
            .setColor(AUCTION_COLOR)
            .setThumbnail(guild.iconURL() || user.displayAvatarURL());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bid_min_${messageID}`).setLabel(`مـزايـدة (+${auction.min_increment.toLocaleString()})`).setStyle(ButtonStyle.Success).setEmoji('💸'),
            new ButtonBuilder().setCustomId(`bid_custom_btn_${messageID}`).setLabel('تـخصـيـص').setStyle(ButtonStyle.Primary).setEmoji('✍️')
        );
        return interaction.reply({ embeds: [menuEmbed], components: [row], ephemeral: true });
    }

    if (action === 'open_modal') {
        const modal = new ModalBuilder().setCustomId(`bid_modal_submit_${messageID}`).setTitle('تخصيص مبلغ الزيادة');
        const input = new TextInputBuilder().setCustomId('bid_amount_input').setLabel(`المبلغ الإضافي`).setPlaceholder(`أقل شي: ${auction.min_increment}`).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    let incrementAmount = 0;
    if (action === 'place_min_bid') {
        await interaction.deferUpdate();
        incrementAmount = auction.min_increment;
    } else if (action === 'submit_custom_bid') {
        await interaction.deferReply({ ephemeral: true });
        const val = parseInt(interaction.fields.getTextInputValue('bid_amount_input'));
        if (isNaN(val) || val < auction.min_increment) return interaction.editReply({ content: `❌ أقل مبلغ: ${auction.min_increment}` });
        incrementAmount = val;
    }

    try {
        const currentAuction = sql.prepare("SELECT * FROM active_auctions WHERE messageID = ?").get(messageID);
        if (!currentAuction) throw new Error("AUCTION_ENDED");

        const newTotalBid = currentAuction.current_bid + incrementAmount;
        let cost = newTotalBid;
        if (currentAuction.highest_bidder === user.id) cost = incrementAmount;

        const freshMora = sql.prepare("SELECT mora FROM levels WHERE user = ? AND guild = ?").get(user.id, guild.id)?.mora || 0;
        if (freshMora < cost) {
            const msg = `❌ الرصيد غير كافي. المطلوب: **${cost.toLocaleString()}**`;
            if (interaction.type === ComponentType.ModalSubmit) return interaction.editReply(msg);
            return interaction.reply({ content: msg, ephemeral: true });
        }

        if (currentAuction.highest_bidder && currentAuction.highest_bidder !== user.id) {
            sql.prepare("UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?").run(currentAuction.current_bid, currentAuction.highest_bidder, guild.id);
        }
        sql.prepare("UPDATE levels SET mora = mora - ? WHERE user = ? AND guild = ?").run(cost, user.id, guild.id);

        let newEndTime = currentAuction.end_time;
        if (currentAuction.end_time - Date.now() < 60000) newEndTime += 60000;
        const newBidCount = (currentAuction.bid_count || 0) + 1;

        sql.prepare("UPDATE active_auctions SET current_bid = ?, highest_bidder = ?, end_time = ?, bid_count = ? WHERE messageID = ?")
           .run(newTotalBid, user.id, newEndTime, newBidCount, messageID);

        // تحديث الرسالة
        const channel = guild.channels.cache.get(currentAuction.channelID);
        if (channel) {
            const msg = await channel.messages.fetch(messageID).catch(() => null);
            if (msg) {
                const newEmbed = new EmbedBuilder()
                    .setTitle('✥ دار المزاد')
                    .setDescription(`
✶ عـنـصر المزاد🔨: **${currentAuction.item_name}**
✶ السعـر الحالي💰: **${newTotalBid.toLocaleString()}** ${EMOJI_MORA}
✶ سعـر البدايـة🏁: **${(currentAuction.start_price || 0).toLocaleString()}** ${EMOJI_MORA}

✶ اعـلـى مزايـد👑: <@${user.id}>
✶ عـدد المزايـدات📈: \`${newBidCount}\`
✶ اقل مزايدة🪙: \`${currentAuction.min_increment.toLocaleString()}\`
✶ ينـتـهـي⏳: <t:${Math.floor(newEndTime / 1000)}:R>
                    `)
                    .setColor("Random");

                // ✅ منطق الصور الصحيح (نفس منطق الإنشاء):
                // إذا فيه صورة سلعة -> تظهر كبيرة
                // إذا لا -> تظهر الذهبية كبيرة
                if (currentAuction.image_url) {
                    newEmbed.setImage(currentAuction.image_url);
                } else {
                    newEmbed.setImage(AUCTION_IMAGE);
                }

                await msg.edit({ embeds: [newEmbed] });
                channel.send({ content: `🔥 **${newTotalBid.toLocaleString()}** ${EMOJI_MORA} بواسطة <@${user.id}>` }).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
        }

        const successMsg = `✅ **تم!** أنت الأعلى بـ **${newTotalBid.toLocaleString()}**`;
        if (interaction.type === ComponentType.ModalSubmit) await interaction.editReply({ content: successMsg, components: [] });
        else await interaction.editReply({ content: successMsg, embeds: [], components: [] });

    } catch (err) {
        console.error("Bid Error:", err);
        const msg = "❌ حدث خطأ.";
        if (interaction.deferred || interaction.replied) await interaction.editReply(msg); else await interaction.reply({ content: msg, ephemeral: true });
    }
}

module.exports = { startAuctionSystem, handleAuctionSystem };
