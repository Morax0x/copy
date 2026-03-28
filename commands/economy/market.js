const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const path = require('path');
const fs = require('fs');

// 🔥 حل مشكلة المسار (Cannot find module) بشكل ديناميكي 🔥
const marketConfigPath = path.join(process.cwd(), 'json', 'market-items.json');
let marketConfig = [];
try {
    if (fs.existsSync(marketConfigPath)) {
        marketConfig = require(marketConfigPath);
    } else {
        console.error(`⚠️ [Market] لا يمكن العثور على ملف market-items.json في المسار: ${marketConfigPath}`);
    }
} catch (e) {
    console.error("⚠️ [Market] خطأ في قراءة ملف سوق الاستثمار:", e.message);
}

const EMOJI_MORA = '<:mora:1435647151349698621>';

const EMOJI_ASSET_SMALL = {
    'APPLE': '<:aapple:1435884007484293161>',
    'ANDROID': '<:android:1435885726519656578>',
    'TESLA': '<:tesla:1437395355170771016>',
    'GOLD': '<:gold:1437395402474127382>',
    'LAND': '🏞️',
    'BITCOIN': '<:ss:1437395376738013244>',
    'SPACEX': '🚀',
    'SILVER': '<:pngimg:1437395419544944713>',
    'ART': '<:atr:1437395490168639550>',
};

const EMOJI_ASSET_IMAGES = {
    'TESLA': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/tesla.png',
    'APPLE': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/apple.png',
    'GOLD': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/gold.png',
    'SPACEX': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/spacex.png',
    'ANDROID': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/android.png',
    'SILVER': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/silver.png',
    'LAND': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/land.png',
    'BITCOIN': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/bitcoin.png',
    'ART': 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev/images/market/art.png',
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
    // 🔥 الاستدعاء الذكي (Lazy Loading) لحل مشكلة Circular Dependency كلياً 🔥
    const generatorPath = path.join(process.cwd(), 'generators', 'market-generator.js');
    const { drawMarketGrid } = require(generatorPath);

    if (!drawMarketGrid) {
        throw new Error("مكتبة الرسم Canvas غير محملة أو هناك خطأ في ملف market-generator.js");
    }

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
        emoji: EMOJI_ASSET_SMALL[item.id] || '📈'
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('🔻 اختر الأصل لعرض التفاصيل والتداول...')
            .addOptions(selectOptions)
    );

    const actionRows = [selectMenuRow];

    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_prev').setLabel('السابق ◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('market_next').setLabel('▶️ التالي').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
        actionRows.push(navRow);
    }

    return { attachment, components: actionRows };
}

async function buildDetailView(item, userId, guildId, sql) {
    let userPortfolio;
    try {
        const userPortfolioRes = await sql.query(`SELECT "quantity" FROM user_portfolio WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [userId, guildId, item.id]);
        userPortfolio = userPortfolioRes.rows ? userPortfolioRes.rows[0] : (Array.isArray(userPortfolioRes) ? userPortfolioRes[0] : null);
    } catch (e) {
        try {
            const userPortfolioRes = sql.prepare("SELECT quantity FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userId, guildId, item.id);
            userPortfolio = userPortfolioRes;
        } catch(err) {}
    }
    const userQuantity = userPortfolio ? Number(userPortfolio.quantity || userPortfolio.Quantity || 0) : 0;
    
    const changePercent = Number(item.lastChangePercent || item.lastchangepercent || 0);
    const currentPrice = Number(item.currentPrice || item.currentprice || 0);
    
    const changeEmoji = getItemChangeEmoji(changePercent);
    const price = currentPrice.toLocaleString();
    const cleanName = cleanEmojiFromName(item.name);

    const detailEmbed = new EmbedBuilder()
        .setTitle(`📈 تفاصيل: ${cleanName} (${item.id})`)
        .setColor(changePercent > 0.01 ? Colors.Green : (changePercent < -0.01 ? Colors.Red : Colors.Grey))
        .setDescription(item.description || 'لا يوجد وصف')
        .addFields(
            { name: 'السعر الحالي', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: 'تغير الفترة الأخيرة', value: `${changeEmoji} ${(changePercent * 100).toFixed(2)}%`, inline: true },
            { name: 'في محفظتك الاستثمارية', value: `**${userQuantity.toLocaleString()}** وحدة`, inline: true }
        )
        .setTimestamp();

    const itemImage = EMOJI_ASSET_IMAGES[item.id];
    if (itemImage) {
        detailEmbed.setThumbnail(itemImage);
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`buy_asset_${item.id}`).setLabel('شراء 🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sell_asset_${item.id}`).setLabel(`بيع 💰`).setStyle(ButtonStyle.Danger).setDisabled(userQuantity === 0),
        new ButtonBuilder().setCustomId('market_back_to_grid').setLabel('العودة للوحة السوق').setStyle(ButtonStyle.Primary)
    );

    return { embed: detailEmbed, components: [actionRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سوق')
        .setDescription('يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي.'),

    name: 'market',
    aliases: ['سوق', 'استثمار', 'اسعار', 'بورصة'],
    category: "Economy",
    description: 'يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي.',

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
            if (isSlash) return await interaction.editReply(payload).catch(()=>{});
            else return await message.channel.send(payload).catch(()=>{});
        };

        try {
            let dbItems = [];
            try {
                const dbItemsRes = await sql.query("SELECT * FROM market_items");
                dbItems = dbItemsRes.rows ? dbItemsRes.rows : (Array.isArray(dbItemsRes) ? dbItemsRes : []);
            } catch (dbErr) {
                try {
                    dbItems = sql.prepare("SELECT * FROM market_items").all();
                } catch(sqliteErr) {
                    console.error("Market DB Error:", dbErr.message, sqliteErr.message);
                    return reply({ content: "❌ عذراً، لا يمكن الاتصال بقاعدة بيانات السوق حالياً." });
                }
            }

            const validItemIds = new Set(marketConfig.map(i => i.id));
            const allItems = dbItems.filter(item => validItemIds.has(item.id));

            if (allItems.length === 0) {
                const embed = new EmbedBuilder().setTitle('📈 سوق الاستثمار').setDescription("السوق فارغ تماماً حالياً.").setColor(Colors.Red);
                return reply({ embeds: [embed] });
            }

            let currentPage = 0;
            let currentView = 'grid'; 
            let timeRemaining = getUpdateTimeRemaining();

            // 🎨 استدعاء لوحة الرسم
            const { attachment, components } = await buildVisualGridView(allItems, currentPage, timeRemaining);
            
            let msg;
            const initPayload = { files: [attachment], components: components, content: `**مرحباً بك في سوق الاستثمار يا <@${user.id}> 📊**` };
            
            if (isSlash) {
                msg = await interaction.editReply(initPayload);
            } else {
                msg = await message.channel.send(initPayload);
            }

            const filter = i => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({
                time: 300000,
                filter,
            });

            collector.on('collect', async i => {
                try {
                    if (i.isButton()) {
                        if (i.customId === 'market_prev' || i.customId === 'market_next') {
                            try { await i.deferUpdate(); } catch (e) {}

                            if (currentView === 'grid') {
                                if (i.customId === 'market_next') currentPage = Math.min(Math.ceil(allItems.length / ITEMS_PER_PAGE) - 1, currentPage + 1);
                                else if (i.customId === 'market_prev') currentPage = Math.max(0, currentPage - 1);

                                timeRemaining = getUpdateTimeRemaining();
                                const newPage = await buildVisualGridView(allItems, currentPage, timeRemaining);
                                await i.editReply({ files: [newPage.attachment], components: newPage.components, embeds: [] });
                            }
                        } else if (i.customId === 'market_back_to_grid') {
                            try { await i.deferUpdate(); } catch (e) {}
                            currentView = 'grid';
                            timeRemaining = getUpdateTimeRemaining();
                            const { attachment: gridAttachment, components: gridComponents } = await buildVisualGridView(allItems, currentPage, timeRemaining);
                            await i.editReply({ files: [gridAttachment], components: gridComponents, embeds: [], content: `**مرحباً بك في سوق الاستثمار يا <@${i.user.id}> 📊**` });

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
                        const item = allItems.find(it => it.id === selectedID);
                        if (!item) return;
                        
                        const { embed: detailEmbed, components: detailComponents } = await buildDetailView(item, i.user.id, i.guild.id, sql); 
                        await i.editReply({ embeds: [detailEmbed], components: detailComponents, files: [], content: '' });
                    }
                } catch (error) {
                    console.error("خطأ في جامع السوق:", error);
                }
            });

            collector.on('end', () => {
                if(msg && msg.editable) msg.edit({ components: [] }).catch(() => null);
            });

        } catch (globalError) {
            console.error("Market Execute Error:", globalError);
            return reply({ content: `❌ **حدث خطأ غير متوقع:**\n\`${globalError.message}\`` });
        }
    }
};
