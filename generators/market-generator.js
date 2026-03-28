const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Colors, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const marketConfig = require('../../json/market-items.json'); 
const { drawMarketGrid } = require('../../generators/market-generator.js'); // 🔥 استدعاء مكتبة الرسم الجديدة

const EMOJI_MORA = '<:mora:1435647151349698621>';

// الإيموجي الصغيرة للقائمة المنسدلة فقط
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

// روابط الصور الخارجية لإمبد التفاصيل (البيع والشراء)
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

const UPDATE_INTERVAL_MS = 1 * 60 * 60 * 1000; // ساعة واحدة
const ITEMS_PER_PAGE = 9; // شبكة 3x3

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

// 🔥🔥 دالة بناء العرض المرئي الرئيسي (تستدعي الرسام وتجهز المكونات) 🔥🔥
async function buildVisualGridView(allItems, pageIndex, timeRemaining) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const itemsOnPage = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    const totalPages = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    // 🎨 1. استدعاء دالة الرسم لتوليد صورة لوحة التداول الاحترافية
    // نرسل القائمة الكاملة لأن الرسام سيقوم بالتقسيم ورسم الصفحة الحالية
    const imageBuffer = await drawMarketGrid(allItems, timeRemaining, pageIndex, totalPages);
    
    // تجهيز الملف كمرفق ديسكورد
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'market_board.png' });

    // 2. تجهيز القائمة المنسدلة (لتكون تحت الصورة مباشرة)
    const selectOptions = itemsOnPage.map(item => ({
        label: `${cleanEmojiFromName(item.name)}`,
        description: `السعر الحالي: ${Number(item.currentPrice || item.currentprice).toLocaleString()} مورا`,
        value: item.id,
        emoji: EMOJI_ASSET_SMALL[item.id] || '📈' // استخدام الإيموجي الصغير هنا فقط
    }));

    const selectMenuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_select_item')
            .setPlaceholder('🔻 اختر الأصل لعرض التفاصيل وبدء التداول...')
            .addOptions(selectOptions)
    );

    const actionRows = [selectMenuRow];

    // 3. إضافة أزرار التنقل بين الصفحات (إذا وجد أكثر من صفحة)
    if (totalPages > 1) {
        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('market_prev').setLabel('السابق ◀️').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === 0),
            new ButtonBuilder().setCustomId('market_next').setLabel('▶️ التالي').setStyle(ButtonStyle.Secondary).setDisabled(pageIndex === totalPages - 1)
        );
        actionRows.push(navRow);
    }

    return { attachment, components: actionRows };
}

// دالة بناء عرض التفاصيل (إمبد نصي كما هو، لأنه أنسب للبيع والشراء)
async function buildDetailView(item, userId, guildId, sql) {
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
        .setTitle(`📈 تفاصيل التداول: ${cleanName} (${item.id})`)
        .setColor(changePercent > 0.01 ? Colors.Green : (changePercent < -0.01 ? Colors.Red : Colors.Grey))
        .setDescription(item.description || 'لا يوجد وصف لهذا الأصل.')
        .addFields(
            { name: 'السعر الحالي', value: `${price} ${EMOJI_MORA}`, inline: true },
            { name: 'تغير الفترة الأخيرة', value: `${changeEmoji} ${(changePercent * 100).toFixed(2)}%`, inline: true },
            { name: 'في محفظتك الاستثمارية', value: `**${userQuantity.toLocaleString()} وحدة**`, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'إمبراطورية العملات الرقمية والاستثمار' });

    const itemImage = EMOJI_ASSET_IMAGES[item.id];
    if (itemImage) {
        detailEmbed.setThumbnail(itemImage);
    }

    // أزرار العمليات والعودة
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`buy_asset_${item.id}`).setLabel('شراء وحدات 🛒').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`sell_asset_${item.id}`).setLabel(`بيع وحدات 💰`).setStyle(ButtonStyle.Danger).setDisabled(userQuantity === 0),
        new ButtonBuilder().setCustomId('market_back_to_grid').setLabel('العودة للوحة السوق').setStyle(ButtonStyle.Primary)
    );

    return { embed: detailEmbed, components: [actionRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سوق')
        .setDescription('يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي واحترافي.'),

    name: 'market',
    aliases: ['سوق', 'استثمار', 'اسعار', 'بورصة'],
    category: "Economy",
    description: 'يعرض لوحة أسعار الأسهم والعقارات الحالية بشكل مرئي واحترافي.',

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

        // جلب البيانات من الداتابيز
        const dbItemsRes = await sql.query("SELECT * FROM market_items");
        const dbItems = dbItemsRes.rows;

        // تصفية العناصر المتوافقة مع ملف الكونفج
        const validItemIds = new Set(marketConfig.map(i => i.id));
        const allItems = dbItems.filter(item => validItemIds.has(item.id));

        if (allItems.length === 0) {
            const embed = new EmbedBuilder().setTitle('📈 سوق الاستثمار').setDescription("السوق فارغ تماماً حالياً، لا توجد أصول متاحة للتداول.").setColor(Colors.Red);
            if (isSlash) return await interaction.editReply({ embeds: [embed] });
            else return await message.channel.send({ embeds: [embed] });
        }

        let currentPage = 0;
        let currentView = 'grid'; // 'grid' (اللوحة المرئية) أو 'detail' (الإمبد النصي)
        let timeRemaining = getUpdateTimeRemaining();

        // 🎨 1. بناء العرض المرئي الرئيسي لأول مرة
        const { attachment, components } = await buildVisualGridView(allItems, currentPage, timeRemaining);
        
        const payload = { 
            files: [attachment], 
            components: components, 
            content: `**مرحباً بك في بورصة الإمبراطورية يا <@${user.id}> 📊**\nسيتم تحديث الأسعار تلقائياً كل ساعة.` 
        };

        let msg;
        if (isSlash) msg = await interaction.editReply(payload);
        else msg = await message.channel.send(payload);

        // إنشاء الكوليكتور للتفاعلات
        const filter = i => i.user.id === user.id;
        const collector = msg.createMessageComponentCollector({
            time: 300000, // 5 دقائق
            filter,
        });

        collector.on('collect', async i => {
            try {
                if (i.isButton()) {
                    // أزرار التنقل بين صفحات اللوحة المرئية
                    if (i.customId === 'market_prev' || i.customId === 'market_next') {
                        try { await i.deferUpdate(); } catch (e) {}

                        if (currentView === 'grid') {
                            if (i.customId === 'market_next') currentPage = Math.min(Math.ceil(allItems.length / ITEMS_PER_PAGE) - 1, currentPage + 1);
                            else if (i.customId === 'market_prev') currentPage = Math.max(0, currentPage - 1);

                            timeRemaining = getUpdateTimeRemaining();
                            // 🎨 إعادة رسم الصفحة الجديدة
                            const newPage = await buildVisualGridView(allItems, currentPage, timeRemaining);
                            await i.editReply({ files: [newPage.attachment], components: newPage.components, embeds: [] }); // نمسح أي إمبد قديم لضمان عرض الصورة
                        }
                    } 
                    // زر العودة للوحة الرئيسية
                    else if (i.customId === 'market_back_to_grid') {
                        try { await i.deferUpdate(); } catch (e) {}
                        currentView = 'grid';
                        timeRemaining = getUpdateTimeRemaining();
                        // 🎨 إعادة رسم اللوحة الرئيسية
                        const { attachment: gridAttachment, components: gridComponents } = await buildVisualGridView(allItems, currentPage, timeRemaining);
                        // نرسل الصورة كملف، ونفرغ مصفوفة الإمبد، ونعيد نص الترحيب
                        await i.editReply({ 
                            files: [gridAttachment], 
                            components: gridComponents, 
                            embeds: [], 
                            content: `**مرحباً بك في بورصة الإمبراطورية يا <@${i.user.id}> 📊**` 
                        });
                    } 
                    // أزرار الشراء والبيع (تفتح المودال)
                    else if (i.customId.startsWith('buy_asset_') || i.customId.startsWith('sell_asset_')) {
                        const isBuy = i.customId.startsWith('buy_asset_');
                        const assetId = i.customId.replace(isBuy ? 'buy_asset_' : 'sell_asset_', '');
                        const item = allItems.find(it => it.id === assetId);

                        if (!item) return;

                        const modal = new ModalBuilder()
                            .setCustomId(`${isBuy ? 'buy_modal_' : 'sell_modal_'}${assetId}`)
                            .setTitle(`تداول: ${cleanEmojiFromName(item.name)}`);

                        const quantityInput = new TextInputBuilder()
                            .setCustomId('quantity_input')
                            .setLabel(isBuy ? `الكمية المراد شراؤها (السعر: ${Number(item.currentPrice).toLocaleString()})` : `الكمية المراد بيعها (السعر: ${Number(item.currentPrice).toLocaleString()})`)
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('أدخل عدداً صحيحاً، مثال: 10')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
                        await i.showModal(modal);
                    }
                }

                // اختيار أصل من القائمة المنسدلة (يعرض الإمبد التفصيلي للبيع والشراء)
                else if (i.isStringSelectMenu() && i.customId === 'market_select_item') {
                    try { await i.deferUpdate(); } catch (e) {}
                    currentView = 'detail';
                    const selectedID = i.values[0];
                    const item = allItems.find(it => it.id === selectedID);
                    if (!item) return;

                    // بناء عرض التفاصيل (الإمبد)
                    const { embed: detailEmbed, components: detailComponents } = await buildDetailView(item, i.user.id, i.guild.id, sql); 
                    // في التفاصيل: نرسل الإمبد، ونفرغ مصفوفة الملفات (لإخفاء الصورة)، ونمسح نص المحتوى
                    await i.editReply({ embeds: [detailEmbed], components: detailComponents, files: [], content: '' });
                }
            } catch (error) {
                console.error("خطأ في جامع السوق المرئي:", error);
            }
        });

        collector.on('end', () => {
            msg.edit({ components: [] }).catch(() => null);
        });
    }
};
