const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, ComponentType, SlashCommandBuilder } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');
// ✅ استدعاء دالة السعة من ملف الـ Utils (تأكد من إنشاء الملف كما اتفقنا)
const { getPlayerCapacity } = require('../../utils/farmUtils.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
// ⬅️ الإيموجيات الجديدة للتنقل
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';

const ITEMS_PER_PAGE = 9;

// --- تم حذف دالة getPlayerCapacity المحلية لاستخدام الموحدة ---

// --- دوال بناء الواجهة ---

function buildGridView(allItems, pageIndex, currentCapacity, maxCapacity) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    const col1 = [], col2 = [], col3 = [];
    itemsOnPage.forEach((item, index) => {
        const price = item.price.toLocaleString();
        const itemLine = `**${item.emoji} ${item.name}**\n${price} ${EMOJI_MORA}`;

        if (index % 3 === 0) col1.push(itemLine);
        else if (index % 3 === 1) col2.push(itemLine);
        else col3.push(itemLine);
    });

    const embed = new EmbedBuilder()
        .setTitle('🏞️ متجر المزرعة')
        .setColor("Random")
        .setImage('https://i.postimg.cc/J0x0Fj0D/download.gif')
        // عرض السعة في وصف المتجر الرئيسي
        .setDescription(`📦 **السعة:** [ \`${currentCapacity}\` / \`${maxCapacity}\` ]\nاختر حيواناً من القائمة المنسدلة لعرض التفاصيل والشراء.`)
        .addFields(
            { name: '\u200B', value: col1.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col2.join('\n\n') || '\u200B', inline: true },
            { name: '\u200B', value: col3.join('\n\n') || '\u200B', inline: true }
        )
        .setFooter({ text: `صفحة ${pageIndex + 1}/${totalPages}` });

    const selectOptions = itemsOnPage.map(item => ({
        label: `${item.name}`,
        description: `الدخل اليومي: ${item.income_per_day} مورا`,
        value: item.id,
        emoji: item.emoji
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('farm_select_item')
            .setPlaceholder('اختر حيواناً لعرض التفاصيل والشراء...')
            .addOptions(selectOptions)
    );

    return { embed, components: [selectMenuRow] };
}

function buildDetailView(item, userId, guildId, sql, itemIndex, totalItems, client) {
    const userFarm = sql.prepare("SELECT COUNT(*) as quantity FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?").get(userId, guildId, item.id);
    const userQuantity = userFarm ? userFarm.quantity : 0;
    
    // حساب السعة الإجمالية الحالية للاعب
    // ⚠️ ملاحظة: الحساب الدقيق للحجم (Size) يتم في الهاندلر عند الشراء، هنا نستخدم العدد للعرض التقريبي
    const totalUserAnimals = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ?").get(userId, guildId).count;
    
    // ✅ استخدام الدالة المستوردة
    const maxCapacity = getPlayerCapacity(client, userId, guildId);
    const isFull = totalUserAnimals >= maxCapacity;

    const price = item.price.toLocaleString();
    const income_per_day = item.income_per_day || 0;
    const lifespan = item.lifespan_days || 30;
    const size = item.size || 1; 
    const income = (income_per_day * userQuantity).toLocaleString();

    const detailEmbed = new EmbedBuilder()
        .setTitle(`🏞️ ${item.name}`)
        .setColor("Random")
        .setThumbnail(item.image || null)
        .addFields(
            { name: 'سعر الشراء', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: 'الدخل (لليوم)', value: `${income_per_day} ${EMOJI_MORA}`, inline: true },
            { name: 'الخصائص', value: `⏳ العمر: **${lifespan}** يوم\n📦 الحجم: **${size}**`, inline: true },
            { name: 'في مزرعتك', value: `**${userQuantity.toLocaleString()}** (إجمالي الدخل: ${income}/يوم)`, inline: false }
        )
        .setFooter({ text: `الحيوان ${itemIndex + 1} من ${totalItems}` });

    // إضافة تحذير في الـ Embed إذا كانت السعة ممتلئة
    if (isFull) {
        detailEmbed.addFields({ name: '⚠️ تنبيه', value: '🚫 **المزرعة ممتلئة!** لا يمكنك شراء المزيد.', inline: false });
    }

    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`farm_prev_detail_${item.id}`)
            .setEmoji(LEFT_EMOJI) 
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId(`farm_next_detail_${item.id}`)
            .setEmoji(RIGHT_EMOJI) 
            .setStyle(ButtonStyle.Secondary),
            
        new ButtonBuilder().setCustomId('farm_back_to_grid').setLabel('العودة للمتجر').setStyle(ButtonStyle.Primary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buy_animal_${item.id}`)
            .setLabel(isFull ? 'المزرعة ممتلئة' : 'شراء')
            .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(isFull), 
            
        new ButtonBuilder()
            .setCustomId(`sell_animal_${item.id}`)
            .setLabel(`بيع (تملك: ${userQuantity})`)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(userQuantity === 0)
    );

    return { embed: detailEmbed, components: [actionRow1, actionRow2] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعة')
        .setDescription('يعرض متجر المزرعة لشراء الحيوانات.'),

    name: 'farm',
    aliases: ['المزرعة', 'مزرعه','مزرعة', 'حيوانات'],
    category: "Economy",
    description: 'يعرض متجر المزرعة لشراء الحيوانات.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, guild;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            sql = client.sql;
            user = interaction.user;
            guild = interaction.guild;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            client = message.client;
            sql = client.sql;
            user = message.author;
            guild = message.guild;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const allItems = farmAnimals;
        if (allItems.length === 0) {
            const embed = new EmbedBuilder().setTitle('🏞️ متجر المزرعة').setDescription("المتجر فارغ حالياً.").setColor(Colors.Red);
            return reply({ embeds: [embed] });
        }

        // جلب بيانات السعة للعرض الأولي
        const totalUserAnimals = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ?").get(user.id, guild.id).count;
        // ✅ استخدام الدالة المستوردة
        const maxCapacity = getPlayerCapacity(client, user.id, guild.id);

        let currentPage = 0;
        let currentView = 'grid'; 
        let currentItemIndex = 0;

        const { embed, components } = buildGridView(allItems, currentPage, totalUserAnimals, maxCapacity);

        const msg = await reply({ embeds: [embed], components: components, fetchReply: true });

        const filter = i => i.user.id === user.id;
        const collector = msg.createMessageComponentCollector({
            time: 180000,
            filter,
        });

        collector.on('collect', async i => {
            if (i.replied || i.deferred) return;

            try {
                if (i.isStringSelectMenu() && i.customId === 'farm_select_item') {
                    await i.deferUpdate();
                    currentView = 'detail';
                    const selectedID = i.values[0];
                    const item = allItems.find(it => it.id === selectedID);
                    if (item) {
                        currentItemIndex = allItems.findIndex(it => it.id === selectedID);
                        const { embed: detailEmbed, components: detailComponents } = buildDetailView(item, i.user.id, i.guild.id, sql, currentItemIndex, allItems.length, client);
                        await i.editReply({ embeds: [detailEmbed], components: detailComponents });
                    }
                }
                
                else if (i.isButton()) {

                    if (i.customId.startsWith('farm_prev_detail_') || i.customId.startsWith('farm_next_detail_')) {
                        await i.deferUpdate();

                        const currentItemID = i.customId.split('_')[3];
                        currentItemIndex = allItems.findIndex(it => it.id === currentItemID);

                        if (currentItemIndex === -1) currentItemIndex = 0; 

                        if (i.customId.startsWith('farm_next_detail_')) {
                            currentItemIndex = (currentItemIndex + 1) % allItems.length;
                        } else {
                            currentItemIndex = (currentItemIndex - 1 + allItems.length) % allItems.length;
                        }

                        const item = allItems[currentItemIndex];
                        const { embed: detailEmbed, components: detailComponents } = buildDetailView(item, i.user.id, i.guild.id, sql, currentItemIndex, allItems.length, client);
                        await i.editReply({ embeds: [detailEmbed], components: detailComponents });
                    }

                    else if (i.customId === 'farm_back_to_grid') {
                        await i.deferUpdate();
                        currentView = 'grid';
                        const currentTotal = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ?").get(i.user.id, i.guild.id).count;
                        // ✅ تحديث السعة عند العودة
                        const currentMax = getPlayerCapacity(client, i.user.id, i.guild.id);
                        
                        const { embed: gridEmbed, components: gridComponents } = buildGridView(allItems, currentPage, currentTotal, currentMax);
                        await i.editReply({ embeds: [gridEmbed], components: gridComponents });
                    }

                    else if (i.customId.startsWith('buy_animal_') || i.customId.startsWith('sell_animal_')) {
                        const isBuy = i.customId.startsWith('buy_animal_');
                        const assetId = i.customId.replace(isBuy ? 'buy_animal_' : 'sell_animal_', '');
                        const item = allItems.find(it => it.id === assetId);

                        if (!item) return;

                        // ✅ التحقق قبل فتح المودال (حماية أولية)
                        // ملاحظة: الحماية الحقيقية ضد "الأرقام الكبيرة" تحدث في الهاندلر وليس هنا
                        if (isBuy) {
                            const currentTotal = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ?").get(i.user.id, i.guild.id).count;
                            const currentMax = getPlayerCapacity(client, i.user.id, i.guild.id);
                            if (currentTotal >= currentMax) {
                                return await i.reply({ content: `🚫 **المزرعة ممتلئة!** (${currentTotal}/${currentMax})`, ephemeral: true });
                            }
                        }

                        const modal = new ModalBuilder()
                            .setCustomId(`${isBuy ? 'buy_animal_' : 'sell_animal_'}${assetId}`)
                            .setTitle(isBuy ? "شراء حيوان" : "بيع حيوان");

                        const quantityInput = new TextInputBuilder()
                            .setCustomId('quantity_input')
                            .setLabel(isBuy ? `الكمية (سعر الواحد: ${item.price})` : `كمية البيع (لديك في المزرعة)`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('أدخل رقماً (مثلاً: 1)')
                            .setMinLength(1)
                            .setMaxLength(5)
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
                        
                        await i.showModal(modal).catch(err => {
                            if (err.code !== 40060 && err.code !== 10062) {
                                console.error("Modal Error:", err);
                            }
                        });
                    }
                }

            } catch (error) {
                console.error("Farm Collector Error:", error);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ حدث خطأ غير متوقع.', ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', () => {
            if (msg.editable) {
                msg.edit({ components: [] }).catch(() => null);
            }
        });
    }
};
