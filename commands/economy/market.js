const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const marketConfig = require('../../json/market-items.json'); 
const { drawMarketGrid } = require('../../generators/market-generator.js'); // استدعاء مكتبة الرسم

const EMOJI_MORA = '<:mora:1435647151349698621>';

const EMOJI_ASSET_IMAGES = {
    'TESLA': 'https://i.postimg.cc/Dyp3YSCw/tesla.png',
    'APPLE': 'https://i.postimg.cc/mkQN11tp/Apple-logo-grey-svg.png',
    'GOLD': 'https://i.postimg.cc/gJMPFrY7/gold.png',
    'SPACEX': 'https://i.postimg.cc/7h3PvwQd/spacex-logo-white-png-11735766395eqin6ughzj-removebg-preview.png',
    'ANDROID': 'https://i.postimg.cc/yYytwkvZ/Android-Logo-2014-2019.png',
    'SILVER': 'https://i.postimg.cc/bYHmv4b9/pngimg-com-silver-PNG17188.png',
    'LAND': 'https://i.postimg.cc/bYHmv4b9/pngimg-com-silver-PNG17188.png',
    'BITCOIN': 'https://i.postimg.cc/HWZ732CH/ss.png',
    'ART': 'https://i.postimg.cc/K8Xjspp1/3ecc929e25adc64531f0db7fe65f678f-removebg-preview.png',
};

const EMOJI_UP = '<:upward:1435880367805431850>';
const EMOJI_DOWN = '<:downward:1435880484046372914>';
const EMOJI_NEUTRAL = '<:neutral:1435880568158945292>';

const UPDATE_INTERVAL_MS = 1 * 60 * 60 * 1000;
const ITEMS_PER_PAGE = 9;

function getUpdateTimeRemaining() {
    const now = Date.now();
    const timeSinceStart = now % UPDATE_INTERVAL_MS;
    const remainingTime = UPDATE_INTERVAL_MS - timeSinceStart;
    const totalSeconds = Math.floor(remainingTime / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getItemChangeEmoji(changePercent) {
    if (changePercent > 0.01) return EMOJI_UP;
    if (changePercent < -0.01) return EMOJI_DOWN;
    return EMOJI_NEUTRAL;
}

function cleanEmojiFromName(name) {
    if (!name) return '';
    return name.replace(/<a?:.+?:\d+>/g, '').trim();
}

async function buildVisualGridView(allItems, pageIndex, timeRemaining) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    // 🎨 استدعاء دالة الرسم لتوليد صورة السوق
    const imageBuffer = await drawMarketGrid(allItems, timeRemaining, pageIndex, totalPages);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'market_board.png' });

    const selectOptions = itemsOnPage.map(item => ({
        label: `${cleanEmojiFromName(item.name)}`,
        description: `السعر الحالي: ${Number(item.currentPrice || item.currentprice).toLocaleString()} مورا`,
        value: item.id,
        emoji: '📈'
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('🔻 اختر الأصل لعرض التفاصيل...')
            .addOptions(selectOptions)
    );

    const actionRows = [selectMenuRow];

    // إضافة أزرار التنقل إذا كان هناك أكثر من صفحة
    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_prev').setLabel('السابق ◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('market_next').setLabel('▶️ التالي').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
        actionRows.push(navRow);
    }

    return { attachment, components: actionRows };
}

async function buildDetailView(item, userId, guildId, allItems, timeRemaining, sql) {
    // 🔥 الحماية المزدوجة لقراءة محفظة اللاعب 🔥
    let userPortfolio;
    try {
        const userPortfolioRes = await sql.query(`SELECT "quantity" FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]);
        userPortfolio = userPortfolioRes.rows[0];
    } catch (e) {
        const userPortfolioRes = await sql.query(`SELECT quantity FROM user_portfolio WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [userId, guildId, item.id]).catch(()=>({rows:[]}));
        userPortfolio = userPortfolioRes.rows[0];
    }
    const userQuantity = userPortfolio ? Number(userPortfolio.quantity) : 0;
    
    const changePercent = Number(item.lastChangePercent || item.lastchangepercent);
    const currentPrice = Number(item.currentPrice || item.currentprice);
    
    const changeEmoji = getItemChangeEmoji(changePercent);
    const price = currentPrice.toLocaleString();
    const cleanName = cleanEmojiFromName(item.name);

    const detailEmbed = new EmbedBuilder()
        .setTitle(`📈 تفاصيل: ${cleanName} (${item.id})`)
        .setColor(changePercent > 0.01 ? Colors.Green : (changePercent < -0.01 ? Colors.Red : Colors.Grey))
        .setDescription(item.description || 'لا يوجد وصف')
        .addFields(
            { name: 'السعر الحالي', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: 'تغير الفترة الأخيرة', value: `${changeEmoji} ${(changePercent * 100).toFixed(1)}%`, inline: true },
            { name: 'في محفظتك', value: `**${userQuantity.toLocaleString()}**`, inline: true }
        )
        .setTimestamp();

    const itemImage = EMOJI_ASSET_IMAGES[item.id];
    if (itemImage) {
        detailEmbed.setThumbnail(itemImage);
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`market_prev_${item.id}`).setLabel('◀️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`market_next_${item.id}`).setLabel('▶️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`buy_asset_${item.id}`).setLabel('شراء').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sell_asset_${item.id}`).setLabel(`بيع`).setStyle(ButtonStyle.Danger).setDisabled(userQuantity === 0),
        new ButtonBuilder().setCustomId('market_back_to_grid').setLabel('العودة').setStyle(ButtonStyle.Primary)
    );

    return { embed: detailEmbed, components: [actionRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سوق')
        .setDescription('يعرض أسعار الأسهم والعقارات الحالية في قائمة تفاعلية.'),

    name: 'market',
    aliases: ['سوق', 'استثمار', 'اسعار'],
    category: "Economy",
    description: 'يعرض أسعار الأسهم والعقارات الحالية في قائمة تفاعلية.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, sql, user, guild;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            sql = client.sql;
            user = interaction.user;
            guild = interaction.guild;
            
            try {
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply();
                }
            } catch (e) {}

        } else {
            message = interactionOrMessage;
            client = message.client;
            sql = client.sql;
            user = message.author;
            guild = message.guild;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return await interaction.editReply(payload);
            } else {
                return await message.channel.send(payload);
            }
        };

        const dbItemsRes = await sql.query("SELECT * FROM market_items");
        const dbItems = dbItemsRes.rows;

        const validItemIds = new Set(marketConfig.map(i => i.id));
        const allItems = dbItems.filter(item => validItemIds.has(item.id));

        if (allItems.length === 0) {
            const embed = new EmbedBuilder().setTitle('📈 سوق الاستثمار').setDescription("السوق فارغ حالياً.").setColor(Colors.Red);
            return reply({ embeds: [embed] });
        }

        let currentPage = 0;
        let currentItemIndex = 0;
        let currentView = 'grid'; 
        let timeRemaining = getUpdateTimeRemaining();

        // 🎨 استخدام العرض المرئي الجديد
        const { attachment, components } = await buildVisualGridView(allItems, currentPage, timeRemaining);
        
        let msg;
        if (isSlash) {
            msg = await interaction.editReply({ files: [attachment], components: components, content: `**مرحباً بك في سوق الاستثمار يا <@${user.id}>**` });
        } else {
            msg = await message.channel.send({ files: [attachment], components: components, content: `**مرحباً بك في سوق الاستثمار يا <@${user.id}>**` });
        }

        const filter = i => i.user.id === user.id;
        const collector = msg.createMessageComponentCollector({
            time: 180000,
            filter,
        });

        collector.on('collect', async i => {
            try {
                if (i.isButton()) {
                    if (i.customId.startsWith('market_prev') || i.customId.startsWith('market_next')) {
                        
                        try { await i.deferUpdate(); } catch (e) {}

                        if (currentView === 'grid') {
                            if (i.customId === 'market_next') currentPage = Math.min(Math.ceil(allItems.length / ITEMS_PER_PAGE) - 1, currentPage + 1);
                            else if (i.customId === 'market_prev') currentPage = Math.max(0, currentPage - 1);

                            timeRemaining = getUpdateTimeRemaining();
                            const newPage = await buildVisualGridView(allItems, currentPage, timeRemaining);
                            await i.editReply({ files: [newPage.attachment], components: newPage.components, embeds: [] }); // نمسح أي إمبد قديم لضمان عرض الصورة

                        } else { 
                            const currentItemID = i.customId.split('_')[2];
                            currentItemIndex = allItems.findIndex(it => it.id === currentItemID);

                            if (i.customId.startsWith('market_next')) {
                                currentItemIndex = (currentItemIndex + 1) % allItems.length;
                            } else if (i.customId.startsWith('market_prev')) {
                                currentItemIndex = (currentItemIndex - 1 + allItems.length) % allItems.length;
                            }

                            const item = allItems[currentItemIndex];
                            const { embed: detailEmbed, components: detailComponents } = await buildDetailView(item, i.user.id, i.guild.id, allItems, timeRemaining, sql); 
                            await i.editReply({ embeds: [detailEmbed], components: detailComponents, files: [], content: '' }); // نمسح الصورة عند عرض التفاصيل
                        }

                    } else if (i.customId === 'market_back_to_grid') {
                        try { await i.deferUpdate(); } catch (e) {}
                        currentView = 'grid';
                        timeRemaining = getUpdateTimeRemaining();
                        const { attachment: gridAttachment, components: gridComponents } = await buildVisualGridView(allItems, currentPage, timeRemaining);
                        await i.editReply({ files: [gridAttachment], components: gridComponents, embeds: [], content: `**مرحباً بك في سوق الاستثمار يا <@${i.user.id}>**` });

                    } else if (i.customId.startsWith('buy_asset_') || i.customId.startsWith('sell_asset_')) {
                        const isBuy = i.customId.startsWith('buy_asset_');
                        const assetId = i.customId.replace(isBuy ? 'buy_asset_' : 'sell_asset_', '');
                        const item = allItems.find(it => it.id === assetId);

                        if (!item) return;

                        const modal = new ModalBuilder()
                            .setCustomId(`${isBuy ? 'buy_modal_' : 'sell_modal_'}${assetId}`)
                            .setTitle("أدخل الكمية");

                        const quantityInput = new TextInputBuilder()
                            .setCustomId('quantity_input')
                            .setLabel(isBuy ? "الكمية التي تريد شراءها" : "الكمية التي تريد بيعها")
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder(`السعر الحالي: ${Number(item.currentPrice || item.currentprice).toLocaleString()}`)
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
                        await i.showModal(modal);
                    }
                }

                else if (i.isStringSelectMenu() && i.customId === 'market_select_item') {
                    try { await i.deferUpdate(); } catch (e) {}
                    currentView = 'detail';
                    const selectedID = i.values[0];
                    currentItemIndex = allItems.findIndex(it => it.id === selectedID);
                    const item = allItems[currentItemIndex];
                    const { embed: detailEmbed, components: detailComponents } = await buildDetailView(item, i.user.id, i.guild.id, allItems, timeRemaining, sql); 
                    await i.editReply({ embeds: [detailEmbed], components: detailComponents, files: [], content: '' });
                }
            } catch (error) {
                console.error("خطأ في جامع السوق:", error);
            }
        });

        collector.on('end', () => {
            msg.edit({ components: [] }).catch(() => null);
        });
    }
};
